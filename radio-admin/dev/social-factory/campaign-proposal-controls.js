(() => {
  'use strict';

  const state = {
    proposalAttempt: 0,
    rerollSubmit: false
  };

  const byId = (id) => document.getElementById(id);

  function showMessage(text, type = 'info') {
    const message = byId('message');
    if (!message) return;
    message.hidden = !text;
    message.textContent = text || '';
    message.dataset.type = type;
  }

  function installLengthOptions() {
    const select = byId('campaignDuration');
    if (!select) return;
    const selected = String(select.value || '30');
    const options = [
      ['15', '15 seconds'],
      ['30', '30 seconds'],
      ['45', '45 seconds'],
      ['60', '60 seconds'],
      ['90', '90 seconds'],
      ['120', '2 minutes'],
      ['180', '3 minutes'],
      ['300', '5 minutes'],
      ['full', 'Full Song']
    ];
    select.replaceChildren(...options.map(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = value === selected;
      return option;
    }));
    if (![...select.options].some((option) => option.selected)) select.value = '30';
    select.setAttribute('aria-description', 'Choose a short clip, a multi-minute video, or the complete song duration.');
  }

  function installStyles() {
    if (byId('sfProposalControlStyles')) return;
    const style = document.createElement('style');
    style.id = 'sfProposalControlStyles';
    style.textContent = `
      .sf-campaign-plan-head-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
      }
      #refreshCampaignProposal {
        min-height: 34px;
        padding: 7px 11px;
        white-space: nowrap;
      }
      #refreshCampaignProposal .sf-refresh-symbol {
        display: inline-block;
        margin-right: 5px;
        font-size: 15px;
        line-height: 1;
      }
      @media (max-width: 560px) {
        .sf-campaign-plan-head-actions {
          width: 100%;
          justify-content: flex-start;
        }
        #refreshCampaignProposal {
          flex: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function normalizeFullSongLabels() {
    document.querySelectorAll('.sf-campaign-plan-item small').forEach((node) => {
      if (/^Full song sec/i.test(String(node.textContent || ''))) {
        node.textContent = String(node.textContent || '').replace(/^Full song sec/i, 'Full song');
      }
    });
  }

  function installRefreshButton() {
    const head = document.querySelector('.sf-campaign-plan-head');
    const planId = byId('campaignPlanId');
    if (!head || !planId || byId('refreshCampaignProposal')) return;

    const actions = document.createElement('div');
    actions.className = 'sf-campaign-plan-head-actions';
    planId.replaceWith(actions);
    actions.appendChild(planId);

    const button = document.createElement('button');
    button.id = 'refreshCampaignProposal';
    button.className = 'sf-button sf-button-secondary';
    button.type = 'button';
    button.innerHTML = '<span class="sf-refresh-symbol" aria-hidden="true">↻</span>Refresh Proposal';
    button.title = 'Create another safe proposal. No draft jobs, renders, or publishing actions occur.';
    actions.appendChild(button);

    button.addEventListener('click', () => {
      const form = byId('campaignForm');
      const submit = byId('planCampaign');
      if (!form || !submit || button.disabled) return;

      state.proposalAttempt += 1;
      state.rerollSubmit = true;
      button.disabled = true;
      const specific = byId('campaignModeSpecific')?.getAttribute('aria-pressed') === 'true';
      showMessage(
        specific
          ? 'Creating an alternate recipe for the selected songs…'
          : 'Trying another eligible song combination…'
      );
      form.requestSubmit(submit);
      state.rerollSubmit = false;
    });

    const plan = byId('campaignPlan');
    if (plan) {
      new MutationObserver(() => {
        button.hidden = plan.hidden;
        normalizeFullSongLabels();
      }).observe(plan, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true });
      button.hidden = plan.hidden;
    }
  }

  function installProposalAttemptReset() {
    const form = byId('campaignForm');
    if (!form) return;

    form.addEventListener('submit', () => {
      if (!state.rerollSubmit) state.proposalAttempt = 0;
    }, true);

    form.addEventListener('input', (event) => {
      if (event.target?.id === 'campaignSongSearch') return;
      state.proposalAttempt = 0;
    }, true);
    form.addEventListener('change', () => {
      state.proposalAttempt = 0;
    }, true);
  }

  function installRequestAdapter() {
    if (window.__stashboxProposalRequestAdapterInstalled) return;
    window.__stashboxProposalRequestAdapterInstalled = true;
    const previousFetch = window.fetch.bind(window);

    window.fetch = async function proposalFetch(input, init = {}) {
      let requestInit = init;
      let isPlanRequest = false;
      try {
        const requestUrl = typeof input === 'string' || input instanceof URL
          ? String(input)
          : String(input?.url || '');
        const url = new URL(requestUrl, window.location.href);
        const method = String(init?.method || input?.method || 'GET').toUpperCase();
        const isCampaignRequest = method === 'POST' && (
          url.pathname.endsWith('/social/orchestration/batch-plan') ||
          url.pathname.endsWith('/social/orchestration/batch-drafts')
        );
        isPlanRequest = url.pathname.endsWith('/social/orchestration/batch-plan');

        if (isCampaignRequest && typeof init?.body === 'string') {
          const body = JSON.parse(init.body);
          const durationValue = String(byId('campaignDuration')?.value || '30');
          body.proposal_attempt = state.proposalAttempt;
          body.intro_enabled = false;
          if (durationValue === 'full') {
            body.duration_mode = 'full';
            delete body.duration_seconds;
          } else {
            body.duration_mode = 'promo';
            body.duration_seconds = Number(durationValue);
          }
          requestInit = { ...init, body: JSON.stringify(body) };
        }
      } catch (_) {
        requestInit = init;
      }

      const response = await previousFetch(input, requestInit);
      if (isPlanRequest) {
        window.setTimeout(() => {
          const button = byId('refreshCampaignProposal');
          if (button) button.disabled = false;
          normalizeFullSongLabels();
        }, 0);
      }
      return response;
    };
  }

  function install() {
    installStyles();
    installLengthOptions();
    installRefreshButton();
    installProposalAttemptReset();
    installRequestAdapter();
    normalizeFullSongLabels();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
