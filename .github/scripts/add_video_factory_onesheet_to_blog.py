from pathlib import Path

p = Path('radio/blog/index.html')
text = p.read_text(encoding='utf-8')
needle = "    const items = [\n"
url = "/radio/onesheets/Onesheet-Stashbox-Radio-Makes-MP4s-2.png"
if url not in text:
    item = "      {type:'one-sheet',title:'Video Factory for Artists & Brands',description:'A five-step Stashbox Radio Video Factory explainer showing how a song becomes a complete set of ready-to-use vertical, portrait and widescreen promo videos with branded overlays and organized metadata.',image:'" + url + "',url:'" + url + "',search:'stashbox radio video factory artists brands mp4 promo videos social media one sheet',posted:'2026-08-09'},\n"
    if needle not in text:
        raise SystemExit('items array marker not found')
    text = text.replace(needle, needle + item, 1)
    p.write_text(text, encoding='utf-8')
