from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Expected marker missing in {path}: {old!r}")
    file_path.write_text(text.replace(old, new, 1))


header = "radio-admin/dev/shared-admin-header.js"
replace_once(
    header,
    "    { key: 'social-factory', label: 'Social Factory', href: '/radio-admin/dev/social-factory/' },\n",
    "    { key: 'social-factory', label: 'Social Factory', href: '/radio-admin/dev/social-factory/' },\n"
    "    { key: 'scheduled-posts', label: 'Scheduled Posts', href: '/radio-admin/dev/social-factory/scheduled/' },\n"
    "    { key: 'scheduled-calendar', label: 'Schedule Calendar', href: '/radio-admin/dev/social-factory/scheduled/calendar/' },\n",
)

replace_once(
    header,
    "    if (path.includes('/radio-admin/dev/social-factory/')) return { key: 'social-factory', title: 'Social Factory · Content Review' };\n",
    "    if (path.includes('/radio-admin/dev/social-factory/scheduled/calendar/')) return { key: 'scheduled-calendar', title: 'Social Factory · Schedule Calendar' };\n"
    "    if (path.includes('/radio-admin/dev/social-factory/scheduled/')) return { key: 'scheduled-posts', title: 'Social Factory · Scheduled Posts' };\n"
    "    if (path.includes('/radio-admin/dev/social-factory/')) return { key: 'social-factory', title: 'Social Factory · Content Review' };\n",
)

for page in [
    "radio-admin/dev/social-factory/scheduled/index.html",
    "radio-admin/dev/social-factory/scheduled/calendar/index.html",
]:
    replace_once(
        page,
        "</body>",
        "  <script src=\"/radio-admin/dev/shared-admin-header.js?v=20260802-scheduled-nav1\" defer></script>\n</body>",
    )

print("Scheduled Posts and Schedule Calendar added to the shared DEV admin header.")
