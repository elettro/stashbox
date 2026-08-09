from pathlib import Path
import re

p = Path('radio/blog/index.html')
text = p.read_text(encoding='utf-8')

# Remove the older infographic classification for this same artwork to avoid duplicate cards.
text = re.sub(r"^\s*\{type:'infographic',title:'Stashbox Radio Makes MP4s · Part 1'.*?\},\n", '', text, flags=re.M)

needle = "    const items = [\n"
entry = "      {type:'one-sheet',title:'Video Factory Workflow',description:'A nine-step Stashbox Radio workflow showing how a song moves from request and setup through render recipes, MP4 encoding, packaging, storage, tracking and post-render actions.',image:'/radio/onesheets/Onesheet-Stashbox-Radio-Makes-MP4s-1.png',url:'/radio/onesheets/Onesheet-Stashbox-Radio-Makes-MP4s-1.png',search:'stashbox radio video factory workflow mp4 render batch recipe ecs ffmpeg s3 one sheet',posted:'2026-07-19'},\n"

if "title:'Video Factory Workflow'" not in text:
    if needle not in text:
        raise SystemExit('items array not found')
    text = text.replace(needle, needle + entry, 1)

p.write_text(text, encoding='utf-8')
