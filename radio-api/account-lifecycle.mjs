import crypto from 'node:crypto';
import { subjectHash } from './rate-limit.mjs';

const MAX_REAUTH_AGE_SECONDS = 5 * 60;

function lifecycleError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function badRequest(message, code = 'BAD_REQUEST') {
  return lifecycleError(400, message, code);
}

function forbidden(message, code = 'FORBIDDEN') {
  return lifecycleError(403, message, code);
}

function notFound(message = 'Account not found.') {
  return lifecycleError(404, message, 'ACCOUNT_NOT_FOUND');
}

function identityHash(cognitoSub) {
  return subjectHash(`deleted-cognito:${String(cognitoSub || '').trim()}`);
}

function rateLimitIdentityHash(cognitoSub) {
  return subjectHash(`user:${String(cognitoSub || '').trim()}`);
}

function assertRecentAuthentication(identity) {
  const issuedAt = Number(identity?.issuedAt || 0);
  const ageSeconds = issuedAt ? Math.floor(Date.now() / 1000) - issuedAt : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(ageSeconds) || ageSeconds < -60 || ageSeconds > MAX_REAUTH_AGE_SECONDS) {
    throw forbidden('Confirm your password again before changing the account lifecycle.', 'REAUTH_REQUIRED');
  }
}

async function ensureLifecycleTable({ client, qname }) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('account_identity_tombstones')} (
      identity_hash TEXT PRIMARY KEY,
      reason TEXT NOT NULL DEFAULT 'account_erasure',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function tableExists(client, schema, table) {
  const result = await client.query(
    `SELECT to_regclass($1) IS NOT NULL AS present`,
    [`${schema}.${table}`]
  );
  return Boolean(result.rows[0]?.present);
}

async function columnExists(client, schema, table, column) {
  const result = await client.query(`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
    LIMIT 1
  `, [schema, table, column]);
  return Boolean(result.rowCount);
}

async function loadActiveAccount(identity, deps) {
  const result = await deps.client.query(`
    SELECT *
    FROM ${deps.qname('users')}
    WHERE cognito_sub = $1
    LIMIT 1
  `, [identity.sub]);
  if (!result.rowCount) throw notFound();
  const user = result.rows[0];
  if (user.status !== 'active') {
    throw forbidden('This Stashbox Radio account is already disabled or unavailable.', 'ACCOUNT_UNAVAILABLE');
  }
  return user;
}

async function insertAudit({ client, qname }, event, action, userId, details = {}) {
  const sourceIp = String(
    event?.requestContext?.http?.sourceIp
      || event?.requestContext?.identity?.sourceIp
      || 'unknown'
  );
  await client.query(`
    INSERT INTO ${qname('account_audit_log')} (
      actor_user_id, target_user_id, action, details, source_ip_hash
    ) VALUES ($1, $1, $2, $3::jsonb, $4)
  `, [userId || null, action, JSON.stringify(details), subjectHash(sourceIp)]);
}

async function deactivateAccount(event, identity, user, deps) {
  const { client, qname, schema } = deps;
  const followsHaveNotifications = await columnExists(client, schema, 'user_follows', 'notifications_enabled');

  await client.query('BEGIN');
  try {
    await client.query(`
      UPDATE ${qname('users')}
      SET status = 'disabled', updated_at = now(), last_seen_at = now()
      WHERE id = $1
    `, [user.id]);
    await client.query(`
      UPDATE ${qname('playlists')}
      SET visibility = 'private', updated_at = now()
      WHERE user_id = $1
    `, [user.id]);
    await client.query(`
      UPDATE ${qname('notification_preferences')}
      SET in_app_enabled = false,
          browser_push_enabled = false,
          email_enabled = false,
          updated_at = now()
      WHERE user_id = $1
    `, [user.id]);
    if (followsHaveNotifications) {
      await client.query(`
        UPDATE ${qname('user_follows')}
        SET notifications_enabled = false, updated_at = now()
        WHERE user_id = $1
      `, [user.id]);
    }
    await insertAudit(deps, event, 'account_deactivated', user.id, {
      recoverable_by_master_admin: true,
      personal_data_retained_privately: true
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }

  return {
    mode: 'deactivated',
    recoverable: true,
    cognito_action: 'global_sign_out'
  };
}

async function anonymizeAggregateEvents(userId, deps) {
  const { client, qname, schema } = deps;

  if (await tableExists(client, schema, 'notification_events')) {
    await client.query(`
      UPDATE ${qname('notification_events')}
      SET user_id = NULL,
          anonymous_visitor_id = NULL,
          metadata = COALESCE(metadata, '{}'::jsonb)
            - 'user_id' - 'account_id' - 'email' - 'cognito_sub' - 'visitor_id'
      WHERE user_id = $1
    `, [userId]);
  }

  if (await tableExists(client, schema, 'radio_events')) {
    const hasUserId = await columnExists(client, schema, 'radio_events', 'user_id');
    const hasMetadata = await columnExists(client, schema, 'radio_events', 'metadata');
    if (hasUserId) {
      const metadataSql = hasMetadata
        ? `, metadata = COALESCE(metadata, '{}'::jsonb) - 'user_id' - 'account_id' - 'email' - 'cognito_sub'`
        : '';
      await client.query(`
        UPDATE ${qname('radio_events')}
        SET user_id = NULL${metadataSql}
        WHERE user_id = $1
      `, [userId]);
    }
  }
}

async function eraseAccount(event, identity, user, deps) {
  const { client, qname, schema } = deps;
  const erasedIdentityHash = identityHash(identity.sub);
  const rateHash = rateLimitIdentityHash(identity.sub);
  const hasUserLabelAccess = await tableExists(client, schema, 'user_label_access');
  const hasArtistChangeRequests = await tableExists(client, schema, 'artist_change_requests');

  await client.query('BEGIN');
  try {
    await client.query(`
      INSERT INTO ${qname('account_identity_tombstones')} (identity_hash, reason)
      VALUES ($1, 'account_erasure')
      ON CONFLICT (identity_hash) DO NOTHING
    `, [erasedIdentityHash]);

    await anonymizeAggregateEvents(user.id, deps);

    if (hasArtistChangeRequests) {
      await client.query(`
        UPDATE ${qname('artist_change_requests')}
        SET requested_by_user_id = NULL, updated_at = now()
        WHERE requested_by_user_id = $1
      `, [user.id]);
    }
    if (hasUserLabelAccess) {
      await client.query(`DELETE FROM ${qname('user_label_access')} WHERE user_id = $1`, [user.id]);
    }

    await client.query(`
      UPDATE ${qname('account_audit_log')}
      SET actor_user_id = NULL,
          target_user_id = NULL,
          details = jsonb_build_object('anonymized', true)
      WHERE actor_user_id = $1 OR target_user_id = $1
    `, [user.id]);

    await client.query(`DELETE FROM ${qname('user_notification_state')} WHERE user_id = $1`, [user.id]);
    await client.query(`DELETE FROM ${qname('notification_preferences')} WHERE user_id = $1`, [user.id]);
    await client.query(`DELETE FROM ${qname('anonymous_activity_merge_log')} WHERE user_id = $1`, [user.id]);
    await client.query(`DELETE FROM ${qname('user_artist_access')} WHERE user_id = $1`, [user.id]);
    await client.query(`DELETE FROM ${qname('user_roles')} WHERE user_id = $1`, [user.id]);
    await client.query(`DELETE FROM ${qname('user_favorites')} WHERE user_id = $1`, [user.id]);
    await client.query(`DELETE FROM ${qname('user_follows')} WHERE user_id = $1`, [user.id]);
    await client.query(`DELETE FROM ${qname('playlists')} WHERE user_id = $1`, [user.id]);
    await client.query(`DELETE FROM ${qname('user_listening_history')} WHERE user_id = $1`, [user.id]);
    await client.query(`DELETE FROM ${qname('user_preferences')} WHERE user_id = $1`, [user.id]);
    await client.query(`DELETE FROM ${qname('api_rate_limit_buckets')} WHERE subject_hash = $1`, [rateHash]);
    await client.query(`DELETE FROM ${qname('users')} WHERE id = $1`, [user.id]);

    await client.query(`
      INSERT INTO ${qname('account_audit_log')} (
        actor_user_id, target_user_id, action, details, source_ip_hash
      ) VALUES (
        NULL, NULL, 'account_data_erased',
        '{"anonymous_aggregate_engagement_retained":true,"security_tombstone_retained":true}'::jsonb,
        NULL
      )
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }

  return {
    mode: 'erased',
    recoverable: false,
    cognito_action: 'delete_user',
    anonymous_aggregate_engagement_retained: true
  };
}

export function isAccountLifecycleRequest(segments) {
  return segments[0] === 'radio' && segments[1] === 'me' && segments[2] === 'account';
}

export async function assertAccountIdentityAvailable(event, deps, { required = false } = {}) {
  const identity = await deps.verifyIdentity(event, { required });
  if (!identity) return null;
  await ensureLifecycleTable(deps);
  const result = await deps.client.query(`
    SELECT 1
    FROM ${deps.qname('account_identity_tombstones')}
    WHERE identity_hash = $1
    LIMIT 1
  `, [identityHash(identity.sub)]);
  if (result.rowCount) {
    throw forbidden('This Stashbox Radio account was permanently deleted and cannot be restored.', 'ACCOUNT_ERASED');
  }
  return identity;
}

export async function handleAccountLifecycleRequest(event, deps) {
  if (deps.getMethod(event).toUpperCase() !== 'DELETE') {
    return deps.response(405, { success: false, error: 'Method not allowed.' });
  }
  const body = deps.parseBody(event);
  if (body.delete_account !== true) {
    throw badRequest('Confirm that you understand the account will be disabled.', 'ACCOUNT_CONFIRMATION_REQUIRED');
  }

  const identity = await assertAccountIdentityAvailable(event, deps, { required: true });
  assertRecentAuthentication(identity);
  const user = await loadActiveAccount(identity, deps);
  const deleteAllData = body.delete_all_data === true;
  const result = deleteAllData
    ? await eraseAccount(event, identity, user, deps)
    : await deactivateAccount(event, identity, user, deps);

  return deps.response(200, {
    success: true,
    account_lifecycle: result
  });
}
