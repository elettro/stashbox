(() => {
  'use strict';

  const API_BASE = 'https://tnrca1ff32.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_social_factory_admin_token_dev';
  let items = [];
  let applying = false;

  function installLayoutOverride() {
    if (document.getElementById('sf-wide-review-queue-override')) return;
    const style = document.createElement('style');
    style.id = 'sf-wide-review-queue-override';
    style.textContent = `
      @media (min-width: 1101px) {
        .sf-workspace {
          grid-template-columns: minmax(500px, 560px) minmax(0, 1fr) !important;
        }
        .sf-queue {
          min-width: 500px !important;
        }
        .sf-review-campaign-head {
          display: grid !important;
          grid-template-columns: minmax(0, 1fr) auto !important;
          align-items: start !important;
        }
        .sf-open-campaign-review {
          grid-column: 2 !important;
          grid-row: 1 / span 2 !important;
          align-self: center !important;
        }
        .sf-queue-list {
          overflow-x: hidden !important;
        }
      }
      @media (max-width: 1100px) {
        .sf-workspace { grid-template-columns: 1fr !important; }
        .sf-queue { min-width: 0 !important; position: static !important; max-height: none !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function token() {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
  }

  function value(...choices) {
    return choices.find((choice) => choice !== undefined && choice !== null && String(choice).trim() !== '');
  }

  function campaignId(item) {
    return String(value(
      item.campaign_id,
      item.campaign?.id,
      item.source?.campaign_id,
      item.render_batch_id,
      item.source?.render_batch_id,
      item.video?.render_batch_id,
      item.batch_id,
      ''
    )).trim();
  }

  function campaignName(item) {
    return String(value(
      item.campaign_name,
      item.campaign?.name,
      item.source?.campaign_name,
      item.source?.batch_name,
      item.metadata?.campaign_name,
      item.metadata?.batch_name,
      'Ungrouped Content'
    ));
  }

  function itemDate(item) {
    const date = new Date(value(item.created_at, item.updated_at, item.source?.created_at, 0));
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  async function fetchItems() {
    const savedToken = token();
    if (!savedToken) return;
    try {
      const response = await fetch(`${API_BASE}/social/review-items?limit=250`, {
        headers: { 'x-admin-token': savedToken },
        cache: 'no-store'
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) return;
      items = Array.isArray(payload.items) ? payload.items : [];
      decorate();
    } catch (_) {
      // Primary Social Factory UI owns visible errors.
    }
  }

  function newestCampaignForName(name) {
    return items
      .filter((item) => campaignName(item) === name && campaignId(item))
      .sort((a, b) => itemDate(b) - itemDate(a))[0] || null;
  }

  function decorate() {
    installLayoutOverride();
    if (applying) return;
    applying = true;
    try {
      document.querySelectorAll('.sf-review-campaign-group').forEach((group) => {
        const name = String(group.dataset.campaignName || group.querySelector('.sf-review-campaign-head strong')?.textContent || '').trim();
        const item = newestCampaignForName(name);
        const id = item ? campaignId(item) : '';
        const head = group.querySelector('.sf-review-campaign-head');
        if (!head || !id) return;

        let link = head.querySelector('.sf-open-campaign-review');
        if (!link) {
          link = document.createElement('a');
          link.className = 'sf-open-campaign-review';
          link.textContent = 'Open Campaign Review';
          link.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;margin-left:auto;padding:8px 12px;border-radius:9px;border:1px solid #4de39a;background:#4de39a;color:#062016;font-weight:800;text-decoration:none;white-space:nowrap';
          head.appendChild(link);
        }
        link.href = `/radio-admin/dev/social-factory/campaign-review/?campaign_id=${encodeURIComponent(id)}`;
        link.dataset.campaignId = id;
        group.dataset.campaignId = id;
      });
    } finally {
      applying = false;
    }
  }

  function init() {
    installLayoutOverride();
    const queue = document.getElementById('queueList');
    if (!queue) return;
    new MutationObserver(() => window.setTimeout(decorate, 0)).observe(queue, { childList: true, subtree: true });
    document.getElementById('refreshQueue')?.addEventListener('click', () => window.setTimeout(fetchItems, 200));
    document.getElementById('saveToken')?.addEventListener('click', () => window.setTimeout(fetchItems, 200));
    fetchItems();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
