from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Expected marker missing in {path}: {old[:120]!r}")
    file_path.write_text(text.replace(old, new, 1))


modal = "radio-admin/dev/social-factory/scheduled/scheduled-modal.js"
replace_once(
    modal,
    "  const TOKEN_KEY = 'stashbox_social_factory_admin_token_dev';\n  const state = { items: [], selected: null, observer: null };\n",
    "  const TOKEN_KEY = 'stashbox_social_factory_admin_token_dev';\n"
    "  const DEFAULT_TIME_ZONE = 'America/New_York';\n"
    "  const state = { items: [], selected: null, observer: null };\n",
)

replace_once(
    modal,
    "  function toLocalInput(date) {\n    const pad = (value) => String(value).padStart(2, '0');\n    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;\n  }\n\n  function formatDate(date) {\n    return date.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });\n  }\n",
    "  function easternParts(date) {\n"
    "    const parts = new Intl.DateTimeFormat('en-US', {\n"
    "      timeZone: DEFAULT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',\n"
    "      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'\n"
    "    }).formatToParts(date);\n"
    "    return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));\n"
    "  }\n\n"
    "  function toEasternInput(date) {\n"
    "    const parts = easternParts(date);\n"
    "    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;\n"
    "  }\n\n"
    "  function easternWallTimeToDate(value) {\n"
    "    const match = /^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2})$/.exec(String(value || ''));\n"
    "    if (!match) return null;\n"
    "    const [, year, month, day, hour, minute] = match.map(Number);\n"
    "    const wallUtc = Date.UTC(year, month - 1, day, hour, minute, 0);\n"
    "    let guess = new Date(wallUtc);\n"
    "    for (let attempt = 0; attempt < 4; attempt += 1) {\n"
    "      const parts = easternParts(guess);\n"
    "      const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));\n"
    "      const delta = wallUtc - represented;\n"
    "      if (!delta) break;\n"
    "      guess = new Date(guess.getTime() + delta);\n"
    "    }\n"
    "    const check = easternParts(guess);\n"
    "    if (Number(check.year) !== year || Number(check.month) !== month || Number(check.day) !== day || Number(check.hour) !== hour || Number(check.minute) !== minute) return null;\n"
    "    return guess;\n"
    "  }\n\n"
    "  function formatDate(date) {\n"
    "    return new Intl.DateTimeFormat('en-US', { timeZone: DEFAULT_TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(date);\n"
    "  }\n",
)

replace_once(
    modal,
    "          <label class=\"sf-modal-label\">New date and time<input id=\"scheduledModalDate\" type=\"datetime-local\" /></label>\n",
    "          <label class=\"sf-modal-label\">New date and time <span class=\"sf-timezone-note\">Eastern Time (America/New_York)</span><input id=\"scheduledModalDate\" type=\"datetime-local\" /></label>\n",
)

replace_once(modal, "    document.getElementById('scheduledModalDate').value = toLocalInput(item.scheduledAt);\n", "    document.getElementById('scheduledModalDate').value = toEasternInput(item.scheduledAt);\n")
replace_once(modal, "    const nextDate = new Date(input);\n", "    const nextDate = easternWallTimeToDate(input);\n")

scheduled = "radio-admin/dev/social-factory/scheduled/scheduled.js"
replace_once(
    scheduled,
    "  const TOKEN_KEY = 'stashbox_social_factory_admin_token_dev';\n  const state = { items: [], filtered: [], month: new Date(new Date().getFullYear(), new Date().getMonth(), 1) };\n",
    "  const TOKEN_KEY = 'stashbox_social_factory_admin_token_dev';\n"
    "  const DEFAULT_TIME_ZONE = 'America/New_York';\n"
    "  const nowParts = new Intl.DateTimeFormat('en-US', { timeZone: DEFAULT_TIME_ZONE, year: 'numeric', month: 'numeric' }).formatToParts(new Date());\n"
    "  const nowMap = Object.fromEntries(nowParts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));\n"
    "  const state = { items: [], filtered: [], month: new Date(nowMap.year, nowMap.month - 1, 1) };\n",
)
replace_once(
    scheduled,
    "  function formatDate(date) {\n    return date.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });\n  }\n",
    "  function formatDate(date) {\n"
    "    return new Intl.DateTimeFormat('en-US', { timeZone: DEFAULT_TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(date);\n"
    "  }\n\n"
    "  function easternDateKey(date) {\n"
    "    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);\n"
    "    const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));\n"
    "    return `${values.year}-${values.month}-${values.day}`;\n"
    "  }\n\n"
    "  function easternTimeLabel(date) {\n"
    "    return new Intl.DateTimeFormat('en-US', { timeZone: DEFAULT_TIME_ZONE, hour: 'numeric', minute: '2-digit' }).format(date);\n"
    "  }\n",
)
replace_once(scheduled, "      const today = new Date();\n", "      const today = new Date();\n")
replace_once(
    scheduled,
    "      state.filtered.filter((item) => item.scheduledAt.toDateString() === date.toDateString()).sort((a,b) => a.scheduledAt-b.scheduledAt).forEach((item) => {\n",
    "      const calendarKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;\n"
    "      state.filtered.filter((item) => easternDateKey(item.scheduledAt) === calendarKey).sort((a,b) => a.scheduledAt-b.scheduledAt).forEach((item) => {\n",
)
replace_once(
    scheduled,
    "        const time = document.createElement('span'); time.className = 'event-time'; time.textContent = item.scheduledAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });\n",
    "        const time = document.createElement('span'); time.className = 'event-time'; time.textContent = easternTimeLabel(item.scheduledAt);\n",
)

for page in [
    "radio-admin/dev/social-factory/scheduled/index.html",
    "radio-admin/dev/social-factory/scheduled/calendar/index.html",
]:
    text = Path(page).read_text()
    text = text.replace("scheduled.js?v=20260802-1", "scheduled.js?v=20260802-et1")
    text = text.replace("scheduled-modal.js?v=20260802-2", "scheduled-modal.js?v=20260802-et1")
    Path(page).write_text(text)

print('Eastern Time scheduling enforced for list, calendar, and modal rescheduling.')
