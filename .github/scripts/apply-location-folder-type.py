from pathlib import Path
import subprocess


def replace_or_verify(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected exactly one old match, found {count}: {old[:120]}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


html = "radio/visual-experience/dev/index.html"
replace_or_verify(
    html,
    "<option>Campaign</option><option>Brand</option></select></label><label>Status",
    "<option>Campaign</option><option>Brand</option><option>Location</option></select></label><label>Status",
)
replace_or_verify(
    html,
    '<option>Campaign</option><option>Brand</option></select></div><p id="folderCount"',
    '<option>Campaign</option><option>Brand</option><option>Location</option></select></div><p id="folderCount"',
)
replace_or_verify(
    html,
    "const typeLabels={general:'General',artist:'Artist',song:'Song',genre:'Genre',mood:'Mood',global:'Global',campaign:'Campaign',brand:'Brand'};",
    "const typeLabels={general:'General',artist:'Artist',song:'Song',genre:'Genre',mood:'Mood',global:'Global',campaign:'Campaign',brand:'Brand',location:'Location'};",
)

api = "radio-api/index.mjs"
replace_or_verify(
    api,
    "const VISUALS_FOLDER_TYPES = new Set(['general', 'artist', 'song', 'genre', 'mood', 'global', 'campaign', 'brand']);\nconst VISUALS_FOLDER_STATUSES",
    "const VISUALS_FOLDER_TYPES = new Set(['general', 'artist', 'song', 'genre', 'mood', 'global', 'campaign', 'brand', 'location']);\nconst VISUALS_FOLDER_STATUSES",
)
replace_or_verify(
    api,
    "if (!VISUALS_FOLDER_TYPES.has(folderType)) return { error: 'folder_type must be one of: general, artist, song, genre, mood, global, campaign, brand.' };",
    "if (!VISUALS_FOLDER_TYPES.has(folderType)) return { error: 'folder_type must be one of: general, artist, song, genre, mood, global, campaign, brand, location.' };",
)

api_path = Path(api)
api_text = api_path.read_text(encoding="utf-8")
helper_marker = "async function ensureVisualsFolderTypeConstraint()"
if helper_marker not in api_text:
    anchor = "const VISUALS_FOLDER_PRIORITIES = new Set(['high', 'medium', 'low']);\n\nfunction slugify(value)"
    helper = """const VISUALS_FOLDER_PRIORITIES = new Set(['high', 'medium', 'low']);

async function ensureVisualsFolderTypeConstraint() {
  const result = await client.query(
    `SELECT pg_get_constraintdef(c.oid) AS definition
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = $1
       AND t.relname = 'visuals_folders'
       AND c.conname = 'visuals_folders_folder_type_check'
     LIMIT 1`,
    [getDbSchema()]
  );
  const definition = String(result.rows[0]?.definition || '').toLowerCase();
  if (definition.includes("'location'")) return;

  await client.query(`ALTER TABLE ${qname('visuals_folders')} DROP CONSTRAINT IF EXISTS visuals_folders_folder_type_check`);
  await client.query(`ALTER TABLE ${qname('visuals_folders')} ADD CONSTRAINT visuals_folders_folder_type_check CHECK (folder_type IN ('general', 'artist', 'song', 'genre', 'mood', 'global', 'campaign', 'brand', 'location'))`);
}

function slugify(value)"""
    if api_text.count(anchor) != 1:
        raise RuntimeError(f"{api}: helper anchor count was {api_text.count(anchor)}")
    api_text = api_text.replace(anchor, helper, 1)

route_new = "async function handleAdminVisualsFoldersRoute(event) {\n  await requireAdmin(event);\n  const method = getMethod(event).toUpperCase();\n  if (method === 'POST' || method === 'PUT') await ensureVisualsFolderTypeConstraint();"
if route_new not in api_text:
    route_old = "async function handleAdminVisualsFoldersRoute(event) {\n  await requireAdmin(event);\n  const method = getMethod(event).toUpperCase();"
    if api_text.count(route_old) != 1:
        raise RuntimeError(f"{api}: route anchor count was {api_text.count(route_old)}")
    api_text = api_text.replace(route_old, route_new, 1)
api_path.write_text(api_text, encoding="utf-8")

for migration in [
    "radio-admin/dev/ads/migrations/create_visuals_folders.sql",
    "radio-admin/ads/migrations/create_visuals_folders.sql",
]:
    replace_or_verify(
        migration,
        "CHECK (folder_type IN ('general', 'artist', 'song', 'genre', 'mood', 'global', 'campaign', 'brand'))",
        "CHECK (folder_type IN ('general', 'artist', 'song', 'genre', 'mood', 'global', 'campaign', 'brand', 'location'))",
    )

checks = {
    html: ["<option>Location</option>", "location:'Location'"],
    api: ["'brand', 'location'", "ensureVisualsFolderTypeConstraint()", "brand, location."],
    "radio-admin/dev/ads/migrations/create_visuals_folders.sql": ["'brand', 'location'"],
    "radio-admin/ads/migrations/create_visuals_folders.sql": ["'brand', 'location'"],
}
for path, needles in checks.items():
    text = Path(path).read_text(encoding="utf-8")
    for needle in needles:
        if needle not in text:
            raise RuntimeError(f"{path}: missing verification text: {needle}")

subprocess.run(["node", "--check", "radio-api/index.mjs"], check=True)
subprocess.run(["git", "diff", "--check"], check=True)
print("LOCATION_FOLDER_TYPE_PATCH_VERIFIED=true")
