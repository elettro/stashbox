from pathlib import Path
import re

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    (ROOT / path).write_text(content, encoding='utf-8')
    print(f'updated {path}')


def replace_once(source, old, new, label):
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly 1 match, found {count}')
    return source.replace(old, new, 1)


def regex_once(source, pattern, replacement, label, flags=0):
    updated, count = re.subn(pattern, replacement, source, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly 1 regex match, found {count}')
    return updated


cms_path = 'radio/visual-experience/dev/index.html'
cms = read(cms_path)

if '.clip-product-field{grid-column:1/-1}' not in cms:
    cms = replace_once(
        cms,
        '.asset-fields textarea.asset-field{min-height:2.15rem}',
        '.asset-fields textarea.asset-field{min-height:2.15rem}.asset-notes-field,.clip-product-field{grid-column:1/-1}',
        'add clip Shopify field layout',
    )

if 'function normalizeShopifyProductUrls(value,{strict=false}={})' not in cms:
    helper = r'''    function normalizeShopifyProductUrls(value,{strict=false}={}){const raw=Array.isArray(value)?value:typeof value==='string'?value.split(/\r?\n|,/):[];const seen=new Set(),urls=[],invalid=[];raw.forEach(item=>{const candidate=String(item||'').trim();if(!candidate)return;try{const parsed=new URL(candidate);if(!['http:','https:'].includes(parsed.protocol)){invalid.push(candidate);return}const normalized=parsed.toString();if(seen.has(normalized))return;seen.add(normalized);urls.push(normalized)}catch{invalid.push(candidate)}});if(strict&&invalid.length)throw new Error(`Shopify Product URLs must contain valid HTTP or HTTPS URLs. Invalid value: ${invalid[0]}`);return urls}
    function formatShopifyProductUrls(value){return normalizeShopifyProductUrls(value).join('\n')}
'''
    cms = replace_once(
        cms,
        '    function renderAssetCard(asset,sequenceLabels=new Map()){',
        helper + '    function renderAssetCard(asset,sequenceLabels=new Map()){',
        'insert CMS clip Shopify URL helpers',
    )

if 'data-field="shopify_product_urls"' not in cms:
    render_function = r'''    function renderAssetCard(asset,sequenceLabels=new Map()){
      const type=(asset.asset_type||asset.type||'image')==='clip'?'clip':'image';
      const isLocal=asset.local_preview===true;
      const card=document.createElement('article');
      const status=(asset.status||'active')==='hidden'?'hidden':'active';
      card.className=`asset-card ${type==='clip'?'clip-card':'image-card'}${status==='hidden'?' is-hidden':''}`;
      card.dataset.assetId=asset.id||'';
      const preview=assetPreviewMarkup(asset,type,isLocal);
      const displayName=asset.caption||asset.file_name||'Unnamed file';
      const sequenceLabel=sequenceLabels.get(assetIdentity(asset));
      const sequencePill=sequenceLabel?`<span class="asset-sequence-pill">${escapeHtml(sequenceLabel)}</span>`:'';
      const actions=isLocal
        ? `<button class="button danger" type="button" data-remove-local-preview="${escapeHtml(asset.id||'')}">Remove</button>`
        : `<button class="button" type="button" data-save-details="${escapeHtml(asset.id||'')}">Save Details</button><button class="button secondary" data-copy-url="${escapeHtml(asset.id||'')}" ${asset.public_url?'':'disabled'}>Copy URL</button><button class="button secondary" data-view-url="${escapeHtml(asset.id||'')}" ${asset.public_url?'':'disabled'}>View URL</button><button class="button danger" type="button" data-delete-asset="${escapeHtml(asset.id||'')}">Remove / hide</button>`;
      const shopifyField=type==='clip'?`<label class="clip-product-field">Shopify Product URLs<span class="field-help">One public Shopify product URL per line.</span><textarea class="asset-field" data-field="shopify_product_urls" aria-label="Shopify Product URLs" placeholder="https://stashbox.ai/products/example">${escapeHtml(formatShopifyProductUrls(asset.shopify_product_urls||asset.shopifyProductUrls))}</textarea></label>`:'';
      card.innerHTML=`<div class="asset-preview">${preview}</div><div class="asset-body"><div class="asset-card-head"><div class="asset-title-stack"><div class="asset-title-row"><strong class="asset-name" title="${escapeHtml(asset.file_name||'Unnamed file')}">${escapeHtml(displayName)}</strong></div><div class="asset-meta">${sequencePill}<span>${escapeHtml(asset.content_type||type)}</span><span class="asset-dimensions-pill" data-dimensions-pill>dimensions unavailable</span><span>${formatBytes(asset.size_bytes)}</span><span>${escapeHtml(asset.status||'active')}</span>${isLocal?'':`<span>${formatDate(asset.created_at)}</span>`}</div></div><div class="asset-actions">${actions}</div></div><div class="asset-fields"><label>Caption<input class="asset-field" data-field="caption" value="${escapeHtml(asset.caption||'')}" aria-label="Caption" placeholder="Caption" /></label><label>Alt text<input class="asset-field" data-field="alt_text" value="${escapeHtml(asset.alt_text||'')}" aria-label="Alt text" placeholder="Alt text" /></label><label class="asset-notes-field">Notes<textarea class="asset-field" data-field="notes" aria-label="Notes" placeholder="Notes">${escapeHtml(asset.notes||'')}</textarea></label>${shopifyField}</div></div>`;
      updateAssetDimensions(asset,type,card);
      return card;
    }'''
    cms = regex_once(
        cms,
        r'    function renderAssetCard\(asset,sequenceLabels=new Map\(\)\)\{.*?return card\}',
        render_function,
        'replace CMS asset card renderer',
        re.S,
    )

if 'shopify_product_urls:[]' not in cms:
    cms = replace_once(
        cms,
        "status:'Local preview only. Not saved yet.',public_url:URL.createObjectURL(file),local_preview:true,caption:'',alt_text:'',notes:''}",
        "status:'Local preview only. Not saved yet.',public_url:URL.createObjectURL(file),local_preview:true,caption:'',alt_text:'',notes:'',shopify_product_urls:[]}",
        'initialize local preview clip products',
    )

if "shopify_product_urls:assetType==='clip'" not in cms:
    cms = replace_once(
        cms,
        "ratio_label:'',caption:asset.caption||'',alt_text:asset.alt_text||'',notes:asset.notes||''});return saved.asset||saved}",
        "ratio_label:'',caption:asset.caption||'',alt_text:asset.alt_text||'',notes:asset.notes||'',shopify_product_urls:assetType==='clip'?normalizeShopifyProductUrls(asset.shopify_product_urls,{strict:true}):[]});return saved.asset||saved}",
        'save clip products during upload',
    )

if "shopify_product_urls:normalizedAssetType(asset)==='clip'" not in cms:
    cms = replace_once(
        cms,
        "await updateAsset(activeMediaFolder,asset,{caption:asset.caption||'',alt_text:asset.alt_text||'',notes:asset.notes||''});mediaMessage('Asset details saved.')",
        "await updateAsset(activeMediaFolder,asset,{caption:asset.caption||'',alt_text:asset.alt_text||'',notes:asset.notes||'',shopify_product_urls:normalizedAssetType(asset)==='clip'?normalizeShopifyProductUrls(asset.shopify_product_urls,{strict:true}):[]});activeAssets=await loadFolderAssets(activeMediaFolder);renderAssets();renderMediaSummary(activeMediaFolder);mediaMessage('Asset details saved and verified.')",
        'save and reload CMS clip products',
    )

write(cms_path, cms)
