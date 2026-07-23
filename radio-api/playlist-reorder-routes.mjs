import crypto from 'node:crypto';
import { ensureAccountTables } from './account-routes.mjs';
import { enforceRateLimit } from './rate-limit.mjs';

function cleanText(value, maxLength = 500) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function routeError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function badRequest(message) {
  return routeError(400, 'BAD_REQUEST', message);
}

function notFound(message = 'Playlist not found.') {
  return routeError(404, 'NOT_FOUND', message);
}

function forbidden(message = 'This Stashbox Radio account is disabled or unavailable.') {
  return routeError(403, 'ACCOUNT_UNAVAILABLE', message);
}

async function syncAccount(event, deps) {
  const identity = await deps.verifyIdentity(event, { required: true });
  if (!identity?.sub) throw routeError(401, 'AUTH_REQUIRED', 'Authentication is required.');

  await ensureAccountTables(deps);
  const email = cleanText(identity.email, 320).toLowerCase();
  const displayName = cleanText(
    identity.displayName || (email.includes('@') ? email.split('@')[0] : 'Listener'),
    120
  );
  const result = await deps.client.query(`
    INSERT INTO ${deps.qname('users')} AS account_user (
      id, cognito_sub, email, email_verified, display_name, status, last_login_at, last_seen_at
    ) VALUES ($1, $2, $3, $4, $5, 'active', now(), now())
    ON CONFLICT (cognito_sub)
    DO UPDATE SET
      email = CASE WHEN EXCLUDED.email <> '' THEN EXCLUDED.email ELSE account_user.email END,
      email_verified = account_user.email_verified OR EXCLUDED.email_verified,
      last_seen_at = now(),
      updated_at = now()
    RETURNING *
  `, [crypto.randomUUID(), identity.sub, email, Boolean(identity.emailVerified), displayName]);

  const user = result.rows[0];
  if (!user || user.status !== 'active') throw forbidden();
  return { identity, user };
}

function normalizeOrderedIds(body) {
  const source = body.ordered_item_ids ?? body.orderedItemIds ?? body.item_ids ?? body.itemIds;
  if (!Array.isArray(source)) throw badRequest('ordered_item_ids must be an array.');
  const ids = source.map(value => cleanText(value, 300)).filter(Boolean);
  if (ids.length > 500) throw badRequest('A playlist can reorder at most 500 songs at once.');
  if (new Set(ids).size !== ids.length) throw badRequest('ordered_item_ids cannot contain duplicates.');
  return ids;
}

export function isPlaylistReorderRequest(segments) {
  return segments[0] === 'radio'
    && segments[1] === 'me'
    && segments[2] === 'playlists'
    && Boolean(segments[3])
    && segments[4] === 'items'
    && segments[5] === 'reorder';
}

export async function handlePlaylistReorderRequest(event, deps) {
  const method = deps.getMethod(event).toUpperCase();
  if (!['PATCH', 'PUT'].includes(method)) {
    return deps.response(405, { success: false, error: 'Method not allowed.' });
  }

  const segments = deps.getRouteSegments(event);
  const playlistId = decodeURIComponent(segments[3] || '');
  if (!playlistId) throw badRequest('Playlist id is required.');

  const account = await syncAccount(event, deps);
  await enforceRateLimit({
    client: deps.client,
    qname: deps.qname,
    event,
    identity: account.identity,
    scope: 'playlist_reorder',
    limit: 180,
    windowSeconds: 15 * 60
  });

  const playlist = await deps.client.query(`
    SELECT id, name, description, visibility, updated_at
    FROM ${deps.qname('playlists')}
    WHERE id = $1 AND user_id = $2
    LIMIT 1
  `, [playlistId, account.user.id]);
  if (!playlist.rowCount) throw notFound();

  const orderedIds = normalizeOrderedIds(deps.parseBody(event));
  const current = await deps.client.query(`
    SELECT id
    FROM ${deps.qname('playlist_items')}
    WHERE playlist_id = $1
    ORDER BY position, added_at, id
  `, [playlistId]);
  const currentIds = current.rows.map(row => String(row.id));

  if (orderedIds.length !== currentIds.length) {
    throw badRequest('The saved order must include every song currently in the playlist.');
  }
  const currentSet = new Set(currentIds);
  if (orderedIds.some(id => !currentSet.has(id))) {
    throw badRequest('The saved order contains a song that is not in this playlist.');
  }

  await deps.client.query('BEGIN');
  try {
    for (let position = 0; position < orderedIds.length; position += 1) {
      await deps.client.query(`
        UPDATE ${deps.qname('playlist_items')}
        SET position = $1
        WHERE id = $2 AND playlist_id = $3
      `, [position, orderedIds[position], playlistId]);
    }
    const updatedPlaylist = await deps.client.query(`
      UPDATE ${deps.qname('playlists')}
      SET updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING id, name, description, visibility, created_at, updated_at
    `, [playlistId, account.user.id]);
    await deps.client.query('COMMIT');

    const items = await deps.client.query(`
      SELECT id, playlist_id, song_key, song_id, display_title, artist, position, metadata, added_at
      FROM ${deps.qname('playlist_items')}
      WHERE playlist_id = $1
      ORDER BY position, added_at, id
    `, [playlistId]);

    return deps.response(200, {
      success: true,
      playlist: { ...updatedPlaylist.rows[0], items: items.rows },
      ordered_item_ids: items.rows.map(item => item.id)
    });
  } catch (error) {
    await deps.client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}
