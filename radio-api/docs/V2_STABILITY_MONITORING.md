# Stashbox Radio V2 Stability Monitoring

## What is protected

The stability layer verifies three separate areas:

1. **Static V2 release contract**
   - `radio/dev/v2/index.html` contains the required build marker.
   - `v2-boot-guard.js`, `v2-health.js`, and `v2-recovery.js` appear exactly once.
   - Core scripts appear in the approved order.
   - Every local V2 JavaScript and stylesheet reference exists.
   - Every referenced JavaScript file passes `node --check`.

2. **TRUE DEV API and CMS routes**
   - Public song catalog.
   - Dashboard summary.
   - Ads CMS when the DEV admin token is available.
   - VEC folders when the DEV admin token is available.
   - Video Factory summary when the DEV admin token is available.

3. **Live listener browser flow**
   - Opens the published V2 page in Chromium.
   - Confirms the live build matches the repository build.
   - Waits for the in-browser health signal to become `ready`.
   - Confirms songs rendered.
   - Confirms the player and media element initialized.
   - Opens a song and verifies a media source exists.
   - Records page errors and failed required resources.

## Automated workflow

Workflow:

```text
.github/workflows/v2-stability-monitor.yml
```

It runs:

- On every push to `main` that changes V2 or its monitor scripts.
- Manually through GitHub Actions.
- Every 15 minutes.

A failed browser run stores:

```text
artifacts/v2-stability/latest-report.json
artifacts/v2-stability/failure-attempt-N.png
```

GitHub retains the uploaded workflow artifact for 14 days.

## Incident behavior

The workflow opens one issue titled:

```text
[Monitor] Stashbox Radio V2 stability failure
```

New failures add comments to the same open incident instead of creating duplicate issues.

When the static contract, TRUE DEV API, and live browser flow all pass again, the workflow comments with the recovery run and closes the incident.

## In-browser health signal

V2 exposes:

```javascript
window.STASHBOX_HEALTH
```

Important fields:

- `status`
- `environment`
- `build`
- `songCount`
- `playerReady`
- `mediaReady`
- `catalogSource`
- `startupMs`
- `errors`

The ready definition is stricter than HTTP 200. V2 is ready only after songs render and the player and media element exist.

## Private CMS dashboard

Open:

```text
/radio-admin/dev/system-health/
```

The page checks:

- Live V2 browser readiness.
- Current live build.
- Song count and startup time.
- Core startup files.
- DEV song catalog.
- Dashboard summary.
- Ads CMS.
- VEC folders.
- Video Factory summary.

Protected checks use the existing DEV admin token stored in the browser. The page performs read-only requests.

## Manual commands

Static contract:

```bash
node radio-api/scripts/validate-v2-entry.mjs
```

TRUE DEV API:

```bash
node radio-api/scripts/smoke-test-true-dev.mjs
```

Live browser flow after installing Playwright:

```bash
npm install --no-save --package-lock=false playwright@1.54.1
npx playwright install chromium
node radio-api/scripts/smoke-test-v2-browser.mjs
```

## Failure interpretation

- **Static contract failed** means the repository entry file, required resources, order, or JavaScript syntax is broken.
- **API smoke failed** means the DEV API, database-facing response, or protected CMS route failed.
- **Browser smoke failed** means the published listener experience did not render or become playable, even when the API might still return 200.
- **Build mismatch** means GitHub contains a newer V2 release than the published server.

## Performance impact

The scheduled browser and API checks run on GitHub infrastructure. They do not execute inside normal listener sessions.

`v2-health.js` performs a small DOM readiness inspection and stores a compact status object. It does not block catalog loading, player initialization, or playback.
