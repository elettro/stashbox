import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content, 'utf8');
}

function replaceOnce(content, before, after, label) {
  if (!content.includes(before)) {
    throw new Error(`Patch target not found: ${label}`);
  }
  const next = content.replace(before, after);
  if (next === content) throw new Error(`Patch did not change content: ${label}`);
  return next;
}

function patch(path, operations) {
  let content = read(path);
  for (const [before, after, label] of operations) {
    content = replaceOnce(content, before, after, `${path} :: ${label}`);
  }
  write(path, content);
}

patch('radio-api/artist-routes.mjs', [
  [
    "    profile_image_url: row.profile_image_url || '',\n    banner_image_url: row.banner_image_url || '',\n    bio: row.bio || '',",
    "    profile_image_url: row.profile_image_url || '',\n    banner_image_url: row.banner_image_url || '',\n    vertical_profile_image_url: row.vertical_profile_image_url || '',\n    bio: row.bio || '',",
    'public artist response'
  ],
  [
    "      profile_image_url TEXT,\n      banner_image_url TEXT,\n      bio TEXT NOT NULL DEFAULT '',",
    "      profile_image_url TEXT,\n      banner_image_url TEXT,\n      vertical_profile_image_url TEXT,\n      bio TEXT NOT NULL DEFAULT '',",
    'artists table create column'
  ],
  [
    "  `);\n  await client.query(`CREATE INDEX IF NOT EXISTS artists_public_idx ON ${qname('artists')} (status, featured DESC, lower(name))`);",
    "  `);\n  await client.query(`ALTER TABLE ${qname('artists')} ADD COLUMN IF NOT EXISTS vertical_profile_image_url TEXT`);\n  await client.query(`CREATE INDEX IF NOT EXISTS artists_public_idx ON ${qname('artists')} (status, featured DESC, lower(name))`);",
    'existing artists table column upgrade'
  ],
  [
    "    profile_image_url: cleanText(body.profile_image_url ?? body.profileImageUrl ?? current.profile_image_url, 2000) || null,\n    banner_image_url: cleanText(body.banner_image_url ?? body.bannerImageUrl ?? current.banner_image_url, 2000) || null,\n    bio: cleanText(body.bio ?? current.bio, 12000),",
    "    profile_image_url: cleanText(body.profile_image_url ?? body.profileImageUrl ?? current.profile_image_url, 2000) || null,\n    banner_image_url: cleanText(body.banner_image_url ?? body.bannerImageUrl ?? current.banner_image_url, 2000) || null,\n    vertical_profile_image_url: cleanText(body.vertical_profile_image_url ?? body.verticalProfileImageUrl ?? current.vertical_profile_image_url, 2000) || null,\n    bio: cleanText(body.bio ?? current.bio, 12000),",
    'artist input normalization'
  ],
  [
    "      id, artist_key, slug, name, sort_name, profile_image_url, banner_image_url, bio, location,\n      website_url, spotify_url, apple_music_url, youtube_url, instagram_url, x_url, facebook_url,\n      merch_url, verified, featured, status, notes, metadata, created_by\n    ) VALUES (\n      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23\n    ) RETURNING *\n  `, [\n    id, input.artist_key, input.slug, input.name, input.sort_name, input.profile_image_url, input.banner_image_url,\n    input.bio, input.location, input.website_url, input.spotify_url, input.apple_music_url, input.youtube_url,\n    input.instagram_url, input.x_url, input.facebook_url, input.merch_url, input.verified, input.featured,\n    input.status, input.notes, JSON.stringify(input.metadata), context.account?.user.id || 'admin-token'\n  ]);",
    "      id, artist_key, slug, name, sort_name, profile_image_url, banner_image_url, vertical_profile_image_url, bio, location,\n      website_url, spotify_url, apple_music_url, youtube_url, instagram_url, x_url, facebook_url,\n      merch_url, verified, featured, status, notes, metadata, created_by\n    ) VALUES (\n      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb,$24\n    ) RETURNING *\n  `, [\n    id, input.artist_key, input.slug, input.name, input.sort_name, input.profile_image_url, input.banner_image_url, input.vertical_profile_image_url,\n    input.bio, input.location, input.website_url, input.spotify_url, input.apple_music_url, input.youtube_url,\n    input.instagram_url, input.x_url, input.facebook_url, input.merch_url, input.verified, input.featured,\n    input.status, input.notes, JSON.stringify(input.metadata), context.account?.user.id || 'admin-token'\n  ]);",
    'artist create query'
  ],
  [
    "      artist_key=$1, slug=$2, name=$3, sort_name=$4, profile_image_url=$5, banner_image_url=$6,\n      bio=$7, location=$8, website_url=$9, spotify_url=$10, apple_music_url=$11, youtube_url=$12,\n      instagram_url=$13, x_url=$14, facebook_url=$15, merch_url=$16, verified=$17, featured=$18,\n      status=$19, notes=$20, metadata=$21::jsonb, updated_at=now()\n    WHERE id=$22 RETURNING *\n  `, [\n    input.artist_key, input.slug, input.name, input.sort_name, input.profile_image_url, input.banner_image_url,\n    input.bio, input.location, input.website_url, input.spotify_url, input.apple_music_url, input.youtube_url,\n    input.instagram_url, input.x_url, input.facebook_url, input.merch_url, input.verified, input.featured,\n    input.status, input.notes, JSON.stringify(input.metadata), artist.id\n  ]);",
    "      artist_key=$1, slug=$2, name=$3, sort_name=$4, profile_image_url=$5, banner_image_url=$6, vertical_profile_image_url=$7,\n      bio=$8, location=$9, website_url=$10, spotify_url=$11, apple_music_url=$12, youtube_url=$13,\n      instagram_url=$14, x_url=$15, facebook_url=$16, merch_url=$17, verified=$18, featured=$19,\n      status=$20, notes=$21, metadata=$22::jsonb, updated_at=now()\n    WHERE id=$23 RETURNING *\n  `, [\n    input.artist_key, input.slug, input.name, input.sort_name, input.profile_image_url, input.banner_image_url, input.vertical_profile_image_url,\n    input.bio, input.location, input.website_url, input.spotify_url, input.apple_music_url, input.youtube_url,\n    input.instagram_url, input.x_url, input.facebook_url, input.merch_url, input.verified, input.featured,\n    input.status, input.notes, JSON.stringify(input.metadata), artist.id\n  ]);",
    'artist update query'
  ]
]);

patch('radio-admin/artists/dev/index.html', [
  [
    "          <input id=\"profileImageUrl\" type=\"hidden\">\n          <input id=\"bannerImageUrl\" type=\"hidden\">",
    "          <input id=\"profileImageUrl\" type=\"hidden\">\n          <input id=\"bannerImageUrl\" type=\"hidden\">\n          <input id=\"verticalProfileImageUrl\" type=\"hidden\">",
    'vertical image hidden URL'
  ],
  [
    "            </section>\n\n            <label class=\"full\">Biography<textarea id=\"bio\" rows=\"7\"></textarea></label>",
    "            </section>\n\n            <section class=\"media-field full\" aria-labelledby=\"verticalProfileImageHeading\">\n              <div class=\"media-field-head\">\n                <div><span class=\"field-label\" id=\"verticalProfileImageHeading\">Vertical artist profile image</span><span class=\"field-help\">Recommended: 1080 × 1920 px · 9:16 portrait JPG, PNG, or WEBP · used as the primary mobile artist image</span></div>\n                <span id=\"verticalProfileImageDimensions\" class=\"dimension-pill\"></span>\n              </div>\n              <div class=\"media-field-body vertical-profile-media-body\">\n                <div id=\"verticalProfileImagePreview\" class=\"media-preview vertical-profile-preview\"><span>No vertical profile image</span></div>\n                <div class=\"media-field-actions\">\n                  <input id=\"verticalProfileImageFile\" class=\"visually-hidden\" type=\"file\" accept=\"image/jpeg,image/png,image/webp\">\n                  <button id=\"uploadVerticalProfileImage\" class=\"button\" type=\"button\">Upload / Replace</button>\n                  <button id=\"deleteVerticalProfileImage\" class=\"button ghost danger-ghost\" type=\"button\">Delete Image</button>\n                  <p id=\"verticalProfileImageStatus\" class=\"upload-status\" aria-live=\"polite\"></p>\n                </div>\n              </div>\n            </section>\n\n            <label class=\"full\">Biography<textarea id=\"bio\" rows=\"7\"></textarea></label>",
    'vertical image editor field'
  ],
  [
    "  <link rel=\"stylesheet\" href=\"./styles.css?v=20260721-banner169\">",
    "  <link rel=\"stylesheet\" href=\"./styles.css?v=20260723-vertical1\">",
    'CMS CSS cache version'
  ],
  [
    "  <script src=\"./app.js?v=20260721-networkfix1\" defer></script>",
    "  <script src=\"./app.js?v=20260723-vertical1\" defer></script>",
    'CMS app cache version'
  ]
]);

patch('radio-admin/artists/dev/app.js', [
  [
    "    image.alt = `${kind === 'profile' ? 'Profile' : 'Banner'} preview`;",
    "    const imageLabels = { profile: 'Profile', banner: 'Banner', verticalProfile: 'Vertical artist profile' };\n    image.alt = `${imageLabels[kind] || 'Artist'} preview`;",
    'vertical preview alt label'
  ],
  [
    "    fill('status', artist.status || 'draft'); fill('location', artist.location); fill('profileImageUrl', artist.profile_image_url); fill('bannerImageUrl', artist.banner_image_url);",
    "    fill('status', artist.status || 'draft'); fill('location', artist.location); fill('profileImageUrl', artist.profile_image_url); fill('bannerImageUrl', artist.banner_image_url); fill('verticalProfileImageUrl', artist.vertical_profile_image_url);",
    'populate vertical URL'
  ],
  [
    "    renderImagePreview('profile', artist.profile_image_url || '');\n    renderImagePreview('banner', artist.banner_image_url || '');\n    setUploadStatus('profile'); setUploadStatus('banner');",
    "    renderImagePreview('profile', artist.profile_image_url || '');\n    renderImagePreview('banner', artist.banner_image_url || '');\n    renderImagePreview('verticalProfile', artist.vertical_profile_image_url || '');\n    setUploadStatus('profile'); setUploadStatus('banner'); setUploadStatus('verticalProfile');",
    'render vertical preview'
  ],
  [
    "      status: el('status').value, location: el('location').value, profile_image_url: el('profileImageUrl').value, banner_image_url: el('bannerImageUrl').value,",
    "      status: el('status').value, location: el('location').value, profile_image_url: el('profileImageUrl').value, banner_image_url: el('bannerImageUrl').value, vertical_profile_image_url: el('verticalProfileImageUrl').value,",
    'save vertical URL'
  ],
  [
    "    const recommended = kind === 'profile'\n      ? { width: 1200, height: 1200 }\n      : { width: 1920, height: 1080 };",
    "    const recommended = kind === 'profile'\n      ? { width: 1200, height: 1200 }\n      : kind === 'verticalProfile'\n        ? { width: 1080, height: 1920 }\n        : { width: 1920, height: 1080 };",
    'vertical image recommendations'
  ],
  [
    "      publicLink.href = `/radio/artists/dev/?artist=${encodeURIComponent(artist.slug)}`;",
    "      publicLink.href = `/radio/dev/v2/artist/?artist=${encodeURIComponent(artist.slug)}`;",
    'V2 public profile link'
  ],
  [
    "  bindImageControls('profile');\n  bindImageControls('banner');",
    "  bindImageControls('profile');\n  bindImageControls('banner');\n  bindImageControls('verticalProfile');",
    'vertical image controls'
  ]
]);

patch('radio-admin/artists/dev/styles.css', [
  [
    ".banner-media-body{grid-template-columns:minmax(280px,2fr) minmax(220px,1fr)}",
    ".banner-media-body{grid-template-columns:minmax(280px,2fr) minmax(220px,1fr)}\n.vertical-profile-media-body{grid-template-columns:220px minmax(220px,1fr)}",
    'vertical field layout'
  ],
  [
    ".banner-preview{width:100%;height:auto;min-height:0;aspect-ratio:16/9}",
    ".banner-preview{width:100%;height:auto;min-height:0;aspect-ratio:16/9}\n.vertical-profile-preview{width:220px;height:auto;min-height:0;aspect-ratio:9/16}",
    'vertical preview ratio'
  ],
  [
    "@media(max-width:760px){.media-field-body,.banner-media-body{grid-template-columns:1fr}.profile-preview{width:130px;height:130px}.banner-preview{height:130px}.media-field-head{display:grid}.dimension-pill{justify-self:start}}",
    "@media(max-width:760px){.media-field-body,.banner-media-body,.vertical-profile-media-body{grid-template-columns:1fr}.profile-preview{width:130px;height:130px}.banner-preview{height:130px}.vertical-profile-preview{width:170px;max-height:302px}.media-field-head{display:grid}.dimension-pill{justify-self:start}}",
    'responsive vertical preview'
  ]
]);

patch('radio/dev/v2/artist/artist.js', [
  [
    "      <section class=\"artist-hero\" style=\"--artist-banner:url('${esc(artist.banner_image_url || artist.profile_image_url || FALLBACK)}')\">",
    "      <section class=\"artist-hero\" style=\"--artist-banner:url('${esc(artist.banner_image_url || artist.profile_image_url || FALLBACK)}');--artist-mobile-banner:url('${esc(artist.vertical_profile_image_url || artist.banner_image_url || artist.profile_image_url || FALLBACK)}')\">",
    'V2 mobile artist image variable'
  ]
]);

patch('radio/dev/v2/artist/artist.css', [
  [
    "  .artist-hero {\n    min-height: 600px;\n    padding: calc(12px + var(--artist-safe-top)) 16px 18px;\n    background-position: center top;\n  }\n  .artist-hero::before { background-position: center top; }",
    "  .artist-hero {\n    min-height: 600px;\n    padding: calc(12px + var(--artist-safe-top)) 16px 18px;\n    background-image: var(--artist-mobile-banner, var(--artist-banner));\n    background-position: center top;\n  }\n  .artist-hero::before {\n    background-image: var(--artist-mobile-banner, var(--artist-banner));\n    background-position: center top;\n  }",
    'mobile vertical artist hero'
  ]
]);

patch('radio/dev/v2/artist/index.html', [
  [
    "  <meta name=\"stashbox-v2-artist-build\" content=\"mobile-social-align-20260723-4\">",
    "  <meta name=\"stashbox-v2-artist-build\" content=\"vertical-artist-image-20260723-5\">",
    'artist build marker'
  ],
  [
    "/radio/dev/v2/artist/artist.css?v=20260723-artist4",
    "/radio/dev/v2/artist/artist.css?v=20260723-artist5",
    'artist CSS version'
  ],
  [
    "/radio/dev/v2/artist/artist-mobile-menu.css?v=20260723-artist4",
    "/radio/dev/v2/artist/artist-mobile-menu.css?v=20260723-artist5",
    'artist mobile menu CSS version'
  ],
  [
    "/radio/dev/v2/v2-auth-sheet.css?v=20260723-artist4",
    "/radio/dev/v2/v2-auth-sheet.css?v=20260723-artist5",
    'auth CSS version'
  ],
  [
    "/radio/dev/v2/v2-auth-desktop-position.css?v=20260723-artist4",
    "/radio/dev/v2/v2-auth-desktop-position.css?v=20260723-artist5",
    'auth position CSS version'
  ],
  [
    "/radio/dev/v2/v2-auth-sheet.js?v=20260723-artist4",
    "/radio/dev/v2/v2-auth-sheet.js?v=20260723-artist5",
    'auth JS version'
  ],
  [
    "/radio/dev/v2/artist/artist.js?v=20260723-artist4",
    "/radio/dev/v2/artist/artist.js?v=20260723-artist5",
    'artist JS version'
  ],
  [
    "/radio/dev/v2/artist/artist-mobile-menu.js?v=20260723-artist4",
    "/radio/dev/v2/artist/artist-mobile-menu.js?v=20260723-artist5",
    'artist mobile menu JS version'
  ]
]);

patch('radio-api/tests/artist-foundation.test.mjs', [
  [
    "  assert.match(cmsHtml, /Recommended: 1920 × 1080 px/);\n  assert.match(cmsHtml, /Upload \/ Replace/);",
    "  assert.match(cmsHtml, /Recommended: 1920 × 1080 px/);\n  assert.match(cmsHtml, /Recommended: 1080 × 1920 px/);\n  assert.match(cmsHtml, /Vertical artist profile image/);\n  assert.match(cmsApp, /vertical_profile_image_url/);\n  assert.match(cmsApp, /bindImageControls\('verticalProfile'\)/);\n  assert.match(cmsHtml, /Upload \/ Replace/);",
    'vertical image CMS tests'
  ],
  [
    "test('public artist page prioritizes music and removes the About biography column', () => {",
    "test('artist API exposes the vertical mobile profile image', () => {\n  const routes = read('radio-api/artist-routes.mjs');\n  const publicProfile = read('radio/dev/v2/artist/artist.js');\n  assert.match(routes, /vertical_profile_image_url/);\n  assert.match(routes, /ADD COLUMN IF NOT EXISTS vertical_profile_image_url TEXT/);\n  assert.match(publicProfile, /artist\.vertical_profile_image_url/);\n});\n\ntest('public artist page prioritizes music and removes the About biography column', () => {",
    'vertical image API test'
  ]
]);

write('radio-api/migrations/20260723_artist_vertical_profile_image_dev.sql', `BEGIN;\n\nSET LOCAL search_path TO radio_dev;\n\nDO $$\nBEGIN\n  IF current_schema() <> 'radio_dev' THEN\n    RAISE EXCEPTION 'Refusing to add artist vertical image outside radio_dev';\n  END IF;\nEND $$;\n\nALTER TABLE artists\n  ADD COLUMN IF NOT EXISTS vertical_profile_image_url TEXT;\n\nCOMMIT;\n`);

console.log('Vertical artist profile image patch applied successfully.');
