from pathlib import Path

p = Path('radio-admin/dev/shared-admin-header.js')
text = p.read_text(encoding='utf-8')
old = "{ key: 'bugs', label: 'Bug & Fix Log', href: '/radio-admin/dev/bugs/' }"
new = "{ key: 'bugs', label: 'Bug Base', href: '/radio-admin/dev/bugs/' }"
if old not in text:
    raise SystemExit('Expected Bug & Fix Log nav entry not found')
text = text.replace(old, new, 1)
text = text.replace("if (path.includes('/radio-admin/dev/bugs/')) return { key: 'bugs', title: 'Bug & Fix Log' };", "if (path.includes('/radio-admin/dev/bugs/')) return { key: 'bugs', title: 'Bug Base' };", 1)
p.write_text(text, encoding='utf-8')
