from pathlib import Path
from urllib.parse import quote
import json

blog = Path('radio/blog/index.html')
folder = Path('radio/onesheets')
text = blog.read_text(encoding='utf-8')

# Remove the current top-level One-Sheet records only.
lines = text.splitlines()
lines = [line for line in lines if '"type":"one-sheet"' not in line and "type:'one-sheet'" not in line]
text = '\n'.join(lines) + '\n'

titles = {
    'STASHBOX_Six_Profile_Image_Styles_Client_Explainer_page_1.jpg': 'One Song. Six Professional Profile Image Styles',
    'Social Factory YouTube.png': 'Social Factory YouTube',
    'Social Factory-process.png': 'Social Factory Process',
    'Stashbox Radio - OneSheet-July2026 (1).png': 'Stashbox Radio One-Sheet · July 2026 · 1',
    'Stashbox Radio - OneSheet-July2026 (3).png': 'Stashbox Radio One-Sheet · July 2026 · 3',
    'Stashbox Radio - OneSheet-July2026 (4).png': 'Stashbox Radio One-Sheet · July 2026 · 4',
    'Stashbox Radio - OneSheet-July2026 (5).png': 'Stashbox Radio One-Sheet · July 2026 · 5',
    'Stashbox Radio - OneSheet-July2026 (6).png': 'Stashbox Radio One-Sheet · July 2026 · 6',
    'Stashbox Radio - OneSheet-July2026 -- add .png': 'Stashbox Radio One-Sheet · July 2026 · Addendum',
    'Stashbox_Custom_GPT_How_To_Use_One_Sheet.png': 'How to Use the Stashbox Custom GPT',
    'Stashbox_Social_Factory_Campaign_Instructions_One_Sheet_page_1.jpg': 'Stashbox Social Factory: Build & Launch a Campaign',
}

descriptions = {
    'STASHBOX_Six_Profile_Image_Styles_Client_Explainer_page_1.jpg': 'A client value explainer showing how one song graphic becomes six purpose-built profile image formats for major screens, feeds, players and campaigns.',
    'Social Factory YouTube.png': 'A Stashbox Radio one-sheet focused on the Social Factory workflow for YouTube content creation and publishing.',
    'Social Factory-process.png': 'A visual one-sheet explaining the Stashbox Radio Social Factory process from content selection through finished social output.',
    'Stashbox Radio - OneSheet-July2026 (1).png': 'A July 2026 Stashbox Radio platform one-sheet covering the ecosystem, capabilities and current product direction.',
    'Stashbox Radio - OneSheet-July2026 (3).png': 'A July 2026 Stashbox Radio one-sheet documenting the growing radio, visual, audience and commerce platform.',
    'Stashbox Radio - OneSheet-July2026 (4).png': 'A July 2026 platform explainer highlighting Stashbox Radio features, workflows and ecosystem value.',
    'Stashbox Radio - OneSheet-July2026 (5).png': 'A July 2026 Stashbox Radio visual summary of platform capabilities and connected content operations.',
    'Stashbox Radio - OneSheet-July2026 (6).png': 'A July 2026 Stashbox Radio one-sheet presenting the platform ecosystem and its connected media capabilities.',
    'Stashbox Radio - OneSheet-July2026 -- add .png': 'An additional July 2026 Stashbox Radio one-sheet expanding the platform story and feature set.',
    'Stashbox_Custom_GPT_How_To_Use_One_Sheet.png': 'A practical one-sheet explaining how to use the Stashbox Custom GPT as an interface to the Stashbox Radio ecosystem.',
    'Stashbox_Social_Factory_Campaign_Instructions_One_Sheet_page_1.jpg': 'A six-step Social Factory guide from building a campaign and creating draft jobs through rendering, review, approval and YouTube publishing or scheduling.',
}

files = sorted(
    [p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in {'.png', '.jpg', '.jpeg'}],
    key=lambda p: p.name.lower()
)

entries = []
for p in files:
    title = titles.get(p.name, p.stem.replace('_', ' ').replace('-', ' ').strip())
    desc = descriptions.get(p.name, 'A Stashbox Radio one-sheet from the current platform explainer library.')
    encoded = quote(p.name)
    url = f'/radio/onesheets/{encoded}'
    search = f'{title} stashbox radio one sheet'.lower()
    item = {
        'type': 'one-sheet',
        'title': title,
        'description': desc,
        'image': url,
        'url': url,
        'search': search,
    }
    entries.append('      ' + json.dumps(item, ensure_ascii=False, separators=(',', ':')) + ',')

marker = '    const items = [\n'
if marker not in text:
    raise SystemExit('Could not find blog items array marker')
text = text.replace(marker, marker + '\n'.join(entries) + '\n', 1)
blog.write_text(text, encoding='utf-8')
print(f'Synced {len(entries)} top-level one-sheet images into the blog.')
