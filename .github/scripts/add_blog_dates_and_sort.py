from pathlib import Path
import re

p = Path('radio/blog/index.html')
text = p.read_text(encoding='utf-8')

# Add card footer/date styles.
old_css = ".card p{color:var(--muted);font-size:14px;line-height:1.55;margin:0}.card-link{margin-top:auto;padding-top:8px;color:var(--gold);text-decoration:none;font-weight:700;font-size:14px}.card-link:hover{text-decoration:underline}.audio-player"
new_css = ".card p{color:var(--muted);font-size:14px;line-height:1.55;margin:0}.card-footer{margin-top:auto;padding-top:8px;display:flex;align-items:flex-end;justify-content:space-between;gap:14px}.card-link{color:var(--gold);text-decoration:none;font-weight:700;font-size:14px}.card-link:hover{text-decoration:underline}.posted-date{color:var(--faint);font-size:12px;font-weight:600;white-space:nowrap;text-align:right}.audio-player"
if old_css in text:
    text = text.replace(old_css, new_css, 1)

start_marker = "    const items = [\n"
end_marker = "    ];\n"
start = text.index(start_marker) + len(start_marker)
end = text.index(end_marker, start)
block = text[start:end]
lines = [line for line in block.splitlines() if line.strip()]

# Remove any pre-existing posted values so this pass is deterministic.
def strip_posted(line):
    line = re.sub(r',\s*posted:\s*[\'\"][^\'\"]+[\'\"]', '', line)
    line = re.sub(r',\s*"posted":\s*"[^"]+"', '', line)
    return line

lines = [strip_posted(line) for line in lines]

# Blog posting dates. These reflect when items entered the Stashbox Radio blog,
# not the original creation date of the artwork.
def posted_for(line):
    if "Inside the Vibe Ecosystem" in line:
        return "2026-08-09"
    if '"type":"one-sheet"' in line or "type:'one-sheet'" in line:
        return "2026-08-09"
    if '"type":"industry-usage"' in line or "type:'industry-usage'" in line:
        return "2026-08-09"
    if "type:'audio'" in line or '"type":"audio"' in line:
        return "2026-08-09"
    return "2026-08-05"


def add_posted(line, date):
    # Insert immediately before the final closing brace/comma.
    comma = ',' if line.rstrip().endswith(',') else ''
    core = line.rstrip()
    if comma:
        core = core[:-1]
    idx = core.rfind('}')
    if idx == -1:
        return line
    core = core[:idx] + f",posted:'{date}'" + core[idx:]
    return core + comma

lines = [add_posted(line, posted_for(line)) for line in lines]

# Make newest added item the first card. Same-date items retain their existing order.
vibe = [line for line in lines if "Inside the Vibe Ecosystem" in line]
rest = [line for line in lines if "Inside the Vibe Ecosystem" not in line]
lines = vibe + rest

new_block = "\n".join(lines) + "\n"
text = text[:start] + new_block + text[end:]

# Add stable newest-first date sorting and human-readable formatter.
labels_line = "    const labels={infographic:'Infographic',article:'Article',audio:'Audio Podcast',video:'Video Clip','one-sheet':'One-Sheet','industry-usage':'Industry Usage Example'};\n"
insert = labels_line + "    items.sort((a,b)=>(b.posted||'').localeCompare(a.posted||''));\n    const formatDate=value=>{if(!value)return '';const [y,m,d]=value.split('-').map(Number);return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(y,m-1,d))};\n"
if labels_line in text and "const formatDate=value=>" not in text:
    text = text.replace(labels_line, insert, 1)

old_card = "const linkText=item.type==='article'?'Read the article':item.type==='audio'?'Download audio':'View full size';const target=item.type==='article'?'':' target=\"_blank\" rel=\"noopener\"';return '<article class=\"card\">'+media+'<div class=\"card-body\"><div class=\"type\">'+labels[item.type]+'</div><h3>'+item.title+'</h3><p>'+item.description+'</p>'+player+'<a class=\"card-link\" href=\"'+item.url+'\"'+target+'>'+linkText+'</a></div></article>'}"
new_card = "const linkText=item.type==='article'?'Read the article':item.type==='audio'?'Download audio':'View full size';const target=item.type==='article'?'':' target=\"_blank\" rel=\"noopener\"';const posted=item.posted?'<time class=\"posted-date\" datetime=\"'+item.posted+'\">Posted '+formatDate(item.posted)+'</time>':'';return '<article class=\"card\">'+media+'<div class=\"card-body\"><div class=\"type\">'+labels[item.type]+'</div><h3>'+item.title+'</h3><p>'+item.description+'</p>'+player+'<div class=\"card-footer\"><a class=\"card-link\" href=\"'+item.url+'\"'+target+'>'+linkText+'</a>'+posted+'</div></div></article>'}"
if old_card in text:
    text = text.replace(old_card, new_card, 1)
elif "class=\"posted-date\"" not in text:
    raise SystemExit('Card renderer signature not found')

p.write_text(text, encoding='utf-8')
