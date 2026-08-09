from pathlib import Path

p = Path('radio/blog/index.html')
text = p.read_text(encoding='utf-8')

needle = 'Inside_the_Vibe_Ecosystem.png'
if needle in text:
    print('Inside the Vibe Ecosystem already exists in blog')
    raise SystemExit(0)

entry = "      {type:'infographic',title:'Inside the Vibe Ecosystem',description:'A visual tour inside the Stashbox Radio Vibe ecosystem and the connected experience around music, visuals, audience and content.',image:'/radio/infographics/Inside_the_Vibe_Ecosystem.png',url:'/radio/infographics/Inside_the_Vibe_Ecosystem.png',search:'inside vibe ecosystem stashbox radio visual music audience content infographic'},\n"

lines = text.splitlines(True)
insert_at = None
for i, line in enumerate(lines):
    if "type:'infographic'" in line or '"type":"infographic"' in line:
        insert_at = i
        break

if insert_at is None:
    marker = '    const items = [\n'
    if marker not in text:
        raise SystemExit('Could not find items array')
    text = text.replace(marker, marker + entry, 1)
else:
    lines.insert(insert_at, entry)
    text = ''.join(lines)

p.write_text(text, encoding='utf-8')
print('Added Inside the Vibe Ecosystem infographic')
