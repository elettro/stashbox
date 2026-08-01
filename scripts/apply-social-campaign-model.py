from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing expected block in {path}: {old[:80]}')
    p.write_text(text.replace(old, new, 1))

# Promote plan_id into a stable campaign_id and return one campaign review URL.
replace_once(
    'social-factory-api/batch-campaigns.mjs',
    "  const planId = crypto.createHash('sha256').update(fingerprint).digest('hex').slice(0, 16);\n\n  return {\n    plan_id: planId,",
    "  const planId = crypto.createHash('sha256').update(fingerprint).digest('hex').slice(0, 16);\n  const campaignId = `campaign-${planId}`;\n  for (const job of jobs) job.recipe.campaign_id = campaignId;\n\n  return {\n    plan_id: planId,\n    campaign_id: campaignId,\n    campaign_review_page_url: `https://stashbox.com/radio-admin/dev/social-factory/campaign-review/?campaign_id=${encodeURIComponent(campaignId)}`,"
)
replace_once(
    'social-factory-api/batch-campaigns.mjs',
    "        plan_id: proposal.plan_id,\n        campaign_name: proposal.campaign_name,",
    "        plan_id: proposal.plan_id,\n        campaign_id: proposal.campaign_id,\n        campaign_name: proposal.campaign_name,\n        campaign_review_page_url: proposal.campaign_review_page_url,"
)

# Carry campaign identity into staged Content Review records.
replace_once(
    'social-factory-api/review-workflow.mjs',
    "      const createdAt = now().toISOString();\n      const metadata = generateReviewMetadata({ song, job });\n      const review = {",
    "      const createdAt = now().toISOString();\n      const metadata = generateReviewMetadata({ song, job });\n      const rawCampaignId = String(job.campaign_id || '').trim();\n      const fallbackBatchId = String(job.batch_id || '').trim();\n      const campaignId = rawCampaignId || (fallbackBatchId ? `campaign-${fallbackBatchId}` : `campaign-${safeJobId}`);\n      const campaignName = String(job.campaign_name || job.batch_name || 'Social Factory Campaign').trim().slice(0, 120);\n      const review = {"
)
replace_once(
    'social-factory-api/review-workflow.mjs',
    "        id: reviewId,\n        status: 'in_review',",
    "        id: reviewId,\n        campaign_id: campaignId,\n        campaign_name: campaignName,\n        campaign: {\n          id: campaignId,\n          name: campaignName,\n          status: 'in_review',\n          review_page_url: `https://stashbox.com/radio-admin/dev/social-factory/campaign-review/?campaign_id=${encodeURIComponent(campaignId)}`\n        },\n        status: 'in_review',"
)
replace_once(
    'social-factory-api/review-workflow.mjs',
    "          render_batch_id: String(job.batch_id || ''),\n          source_uri:",
    "          render_batch_id: String(job.batch_id || ''),\n          campaign_id: campaignId,\n          campaign_name: campaignName,\n          source_uri:"
)

# Add campaign aggregation to the review workflow service.
replace_once(
    'social-factory-api/review-workflow.mjs',
    "    async getReviewItem(event, reviewId) {\n      await authorize(event);",
    "    async getCampaignReview(event, campaignId) {\n      await authorize(event);\n      const safeCampaignId = safeId(campaignId, 'campaign_id');\n      const limit = Number(event?.queryStringParameters?.limit || 250);\n      const all = await getReviewStore().listReviews(limit);\n      const items = all.filter((item) => {\n        const ids = [item.campaign_id, item.campaign?.id, item.source?.campaign_id];\n        return ids.some((value) => String(value || '') === safeCampaignId);\n      });\n      if (!items.length) throw serviceError('campaign_not_found', 404);\n      const renderStatuses = items.map((item) => String(item.render_status || item.video?.render_status || (item.video?.object_key ? 'completed' : 'pending')).toLowerCase());\n      const reviewStatuses = items.map((item) => String(item.status || 'in_review').toLowerCase());\n      const active = renderStatuses.some((value) => ['queued','pending','preparing','rendering','processing','uploading'].includes(value));\n      const campaignName = String(items[0]?.campaign_name || items[0]?.campaign?.name || 'Social Factory Campaign');\n      return {\n        campaign: {\n          id: safeCampaignId,\n          name: campaignName,\n          status: active ? 'rendering' : 'ready_for_review',\n          review_page_url: `https://stashbox.com/radio-admin/dev/social-factory/campaign-review/?campaign_id=${encodeURIComponent(safeCampaignId)}`\n        },\n        summary: {\n          total: items.length,\n          completed: renderStatuses.filter((value) => ['completed','complete','ready','succeeded'].includes(value)).length,\n          rendering: renderStatuses.filter((value) => ['queued','pending','preparing','rendering','processing','uploading'].includes(value)).length,\n          failed: renderStatuses.filter((value) => value === 'failed').length,\n          approved: reviewStatuses.filter((value) => value === 'approved').length,\n          held: reviewStatuses.filter((value) => value === 'held').length,\n          hidden: reviewStatuses.filter((value) => value === 'hidden').length\n        },\n        items\n      };\n    },\n\n    async getReviewItem(event, reviewId) {\n      await authorize(event);"
)

# Route the campaign endpoint.
replace_once(
    'social-factory-api/index.mjs',
    "function reviewRoute(path) {",
    "function campaignRoute(path) {\n  const reviewMatch = String(path).match(/^\\/social\\/campaigns\\/([^/]+)\\/review$/);\n  return { campaignId: reviewMatch ? decodeURIComponent(reviewMatch[1]) : '' };\n}\n\nfunction reviewRoute(path) {"
)
replace_once(
    'social-factory-api/index.mjs',
    "    const review = reviewRoute(path);",
    "    const review = reviewRoute(path);\n    const campaign = campaignRoute(path);"
)
replace_once(
    'social-factory-api/index.mjs',
    "      if (method === 'GET' && path === '/social/review-items') {",
    "      if (method === 'GET' && campaign.campaignId) {\n        return json(200, { ok: true, ...(await getReviewWorkflow().getCampaignReview(event, campaign.campaignId)) });\n      }\n\n      if (method === 'GET' && path === '/social/review-items') {"
)

# Make the page use the campaign endpoint when a campaign_id is supplied.
replace_once(
    'radio-admin/dev/social-factory/campaign-review/index.html',
    "async function load(){message('Loading campaign review items.');try{const p=await api('/social/review-items?limit=250');state.items=Array.isArray(p.items)?p.items:[];render();",
    "async function load(){message('Loading campaign review items.');try{const path=requestedCampaign?`/social/campaigns/${encodeURIComponent(requestedCampaign)}/review?limit=250`:'/social/review-items?limit=250';const p=await api(path);state.items=Array.isArray(p.items)?p.items:[];render();"
)

print('campaign model patch applied')
