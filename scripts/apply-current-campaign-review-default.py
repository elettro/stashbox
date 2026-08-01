from pathlib import Path
import re

path = Path('radio-admin/dev/social-factory/campaign-review/index.html')
text = path.read_text()

text = text.replace(
    "const qs=new URLSearchParams(location.search);const requestedCampaign=qs.get('campaign_id')||qs.get('campaign')||'';",
    "const qs=new URLSearchParams(location.search);const requestedCampaign=qs.get('campaign_id')||qs.get('campaign')||'';let activeCampaign=requestedCampaign;"
)

text = text.replace(
    "function selectedItems(){let items=state.items;if(requestedCampaign)items=items.filter(i=>campaignKey(i)===requestedCampaign);",
    "function selectedItems(){let items=state.items;if(activeCampaign)items=items.filter(i=>campaignKey(i)===activeCampaign);"
)
text = text.replace(
    "function summaryItems(){return requestedCampaign?state.items.filter(i=>campaignKey(i)===requestedCampaign):state.items}",
    "function summaryItems(){return activeCampaign?state.items.filter(i=>campaignKey(i)===activeCampaign):state.items}"
)
text = text.replace(
    "function setSummary(){const items=summaryItems(),key=requestedCampaign||(items[0]?campaignKey(items[0]):'');",
    "function setSummary(){const items=summaryItems(),key=activeCampaign||(items[0]?campaignKey(items[0]):'');"
)

# Insert newest-campaign resolver before the load function.
marker = "async function load(){message('Loading campaign review items.');"
resolver = "function itemTime(i){const value=i.updated_at||i.created_at||i.campaign?.updated_at||i.campaign?.created_at||'';const n=Date.parse(value);return Number.isFinite(n)?n:0}\nfunction chooseCurrentCampaign(items){const sorted=[...items].sort((a,b)=>itemTime(b)-itemTime(a));const formal=sorted.find(i=>campaignKey(i)&&campaignKey(i)!=='uncategorized');return formal?campaignKey(formal):''}\n"
if resolver.strip() not in text:
    if marker not in text:
        raise SystemExit('load marker not found')
    text = text.replace(marker, resolver + marker, 1)

old = re.compile(r"async function load\(\)\{message\('Loading campaign review items\.'\);try\{const path=requestedCampaign\?`/social/campaigns/\$\{encodeURIComponent\(requestedCampaign\)\}/review\?limit=250`:'/social/review-items\?limit=250';const p=await api\(path\);state\.items=Array\.isArray\(p\.items\)\?p\.items:\[\];render\(\);", re.M)
new = "async function load(){message('Loading current campaign review items.');try{const path=activeCampaign?`/social/campaigns/${encodeURIComponent(activeCampaign)}/review?limit=250`:'/social/review-items?limit=250';const p=await api(path);state.items=Array.isArray(p.items)?p.items:[];if(!activeCampaign){activeCampaign=chooseCurrentCampaign(state.items);if(activeCampaign){const next=new URL(location.href);next.searchParams.set('campaign_id',activeCampaign);history.replaceState({},'',next);message('Automatically showing the newest current campaign from the Social Factory table.','success')}}render();"
text, count = old.subn(new, text, count=1)
if count != 1:
    raise SystemExit('current load block not found')

text = text.replace(
    "<div class=\"sub\">Review every generated video from one campaign in one place. Every preview now shows the full uncropped render at its true aspect ratio.</div>",
    "<div class=\"sub\">Review the current Social Factory campaign in one place. Opening this page without a campaign ID automatically selects the newest campaign shown in the campaign table. Every preview shows the full uncropped render.</div>"
)

path.write_text(text)
print('current campaign default applied')
