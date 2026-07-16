# DEV Ads CMS QA

## Scope

This checklist is for the DEV Ads CMS only:

- Page: `https://stashbox.com/radio-admin/dev/ads/`
- API base: `https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev`
- Ads endpoint: `https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev/admin/ads`
- Expected database schema: `radio_dev`
- Expected table: `radio_dev.ads`
- Notes field name sent by the DEV Ads CMS: `notes`

Do not use this checklist for production `/radio-admin/` pages.

## Manual QA checklist

1. Open `/radio-admin/dev/ads/` in a browser.
2. Confirm the ads list loads from the DEV API.
3. Edit one test ad notes field.
4. Save the ad.
5. Refresh the browser.
6. Confirm the note remains visible in the UI.
7. Confirm DBeaver shows the saved note in `radio_dev.ads.notes`, for example:

   ```sql
   SELECT id, internal_title, notes, description, active, updated_at
   FROM radio_dev.ads
   ORDER BY updated_at DESC NULLS LAST
   LIMIT 10;
   ```

8. Confirm production `radio.ads` did not change.

## Notes persistence expectations

- The DEV Ads CMS must call the canonical radio API Lambda through the DEV API Gateway base above.
- Create and update requests must include the `notes` property in the JSON payload.
- The backend ads create/update path writes the `notes` property to the `ads.notes` column in the active `PGSCHEMA`.
- For defensive compatibility only, the backend also accepts legacy note aliases (`note`, `internal_notes`, and `internalNotes`) when `notes` is absent, then normalizes them to `notes` before writing.
- The DEV Ads page does not call `radio-admin/dev/ads/admin-ads-lambda.js`; that file remains a legacy source path and should not be deployed for this page.
