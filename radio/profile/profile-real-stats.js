(() => {
  'use strict';

  const API_ROOT = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const TOKEN_KEY = 'stashbox_radio_prod_cognito_tokens';
  const app = document.getElementById('profileApp');
  if (!app) return;

  let stats = null;
  let loading = false;
  let scheduled = false;
  let retryTimer = 0;
  let lastLoadedAt = 0;

  function readTokens() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {}; }
    catch (_) { return {}; }
  }

  function formatHours(seconds) {
    const hours = Math.max(0, Number(seconds || 0)) / 3600;
    return hours < 10 ? hours.toFixed(1) : Math.round(hours).toLocaleString();
  }

  function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function currentStreak(activeDates) {
    const keys = new Set();
    if (!activeDates.size) return { days: 0, keys };
    const cursor = new Date();
    cursor.setHours(12, 0, 0, 0);
    if (!activeDates.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);

    while (activeDates.has(localDateKey(cursor))) {
      keys.add(localDateKey(cursor));
      cursor.setDate(cursor.getDate() - 1);
    }
    return { days: keys.size, keys };
  }

  function authoritativeStreakKeys(streak, activeDates) {
    const keys = new Set();
    if (!streak) return keys;
    const cursor = new Date();
    cursor.setHours(12, 0, 0, 0);
    if (!activeDates.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    for (let index = 0; index < streak; index += 1) {
      keys.add(localDateKey(cursor));
      cursor.setDate(cursor.getDate() - 1);
    }
    return keys;
  }

  function setStat(label, value) {
    const buttons = [...app.querySelectorAll('.profile-stat')];
    const button = buttons.find(item => String(item.querySelector('span')?.textContent || '').trim() === label);
    const strong = button?.querySelector('strong');
    if (strong && strong.textContent !== String(value)) strong.textContent = String(value);
  }

  function applyTopGenres() {
    const section = [...app.querySelectorAll('.profile-insight')]
      .find(item => String(item.querySelector('h3')?.textContent || '').trim() === 'Top Genres');
    if (!section || !Array.isArray(stats?.top_genres)) return;

    const h3 = section.querySelector('h3');
    [...section.children].forEach(child => { if (child !== h3) child.remove(); });

    if (!stats.top_genres.length) {
      const empty = document.createElement('div');
      empty.className = 'profile-empty';
      empty.textContent = 'Listen to more songs to build your genre profile.';
      section.appendChild(empty);
      return;
    }

    stats.top_genres.forEach(item => {
      const row = document.createElement('div');
      row.className = 'genre-row';
      const genre = document.createElement('span');
      genre.textContent = item.genre || 'Other';
      const track = document.createElement('span');
      track.className = 'genre-track';
      const fill = document.createElement('i');
      fill.style.width = `${Math.max(1, Math.min(100, Number(item.percent || 0)))}%`;
      track.appendChild(fill);
      const percent = document.createElement('small');
      percent.textContent = `${Math.max(1, Math.round(Number(item.percent || 0)))}%`;
      row.append(genre, track, percent);
      section.appendChild(row);
    });
  }

  function ensureMonthLabel(card, daysNode) {
    let monthLabel = card.querySelector('.streak-month-label');
    if (!monthLabel) {
      monthLabel = document.createElement('div');
      monthLabel.className = 'streak-month-label';
      card.insertBefore(monthLabel, daysNode);
    }
    return monthLabel;
  }

  function renderWeek(card, daysNode, activeDates, streakKeys, streak) {
    card.classList.remove('streak-month');
    card.querySelector('.streak-month-label')?.remove();
    daysNode.className = 'streak-days';
    daysNode.innerHTML = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(label => `<span>${label}</span>`).join('');

    const now = new Date();
    const sunday = new Date(now);
    sunday.setHours(12, 0, 0, 0);
    sunday.setDate(now.getDate() - now.getDay());
    let activeThisWeek = 0;

    [...daysNode.querySelectorAll('span')].forEach((node, index) => {
      const date = new Date(sunday);
      date.setDate(sunday.getDate() + index);
      const key = localDateKey(date);
      const listened = activeDates.has(key) || streakKeys.has(key);
      const inCurrentStreak = streakKeys.has(key);
      if (listened) activeThisWeek += 1;
      node.classList.toggle('on', inCurrentStreak);
      node.classList.toggle('listened', listened && !inCurrentStreak);
      node.title = inCurrentStreak
        ? `${key}: current streak day`
        : listened
          ? `${key}: listened, but outside the current streak`
          : `${key}: no listening activity`;
      node.setAttribute('aria-label', node.title);
    });

    const message = daysNode.nextElementSibling;
    if (message?.tagName === 'P') {
      if (!streak) message.textContent = 'Play a song today to begin a streak.';
      else if (activeThisWeek > streak) message.textContent = `${streak}-day current streak · ${activeThisWeek} listening days this week.`;
      else message.textContent = `${streak}-day current streak · keep it going!`;
    }
  }

  function renderMonth(card, daysNode, activeDates, streakKeys, streak) {
    card.classList.add('streak-month');
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1, 12);
    const daysInMonth = new Date(year, month + 1, 0, 12).getDate();
    const monthName = now.toLocaleDateString(undefined, { month: 'long' });
    const monthLabel = ensureMonthLabel(card, daysNode);
    monthLabel.textContent = `${monthName} ${year}`;

    daysNode.className = 'streak-days streak-month-grid';
    const pieces = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(label => `<small class="streak-weekday">${label}</small>`);
    for (let index = 0; index < firstDay.getDay(); index += 1) {
      pieces.push('<span class="calendar-empty" aria-hidden="true"></span>');
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day, 12);
      const key = localDateKey(date);
      const inCurrentStreak = streakKeys.has(key);
      const listened = activeDates.has(key) || inCurrentStreak;
      const isToday = key === localDateKey(now);
      const isFuture = date > now;
      const classes = [
        inCurrentStreak ? 'on' : '',
        listened && !inCurrentStreak ? 'listened' : '',
        isToday ? 'today' : '',
        isFuture ? 'future' : ''
      ].filter(Boolean).join(' ');
      const title = inCurrentStreak
        ? `${key}: current streak day`
        : listened
          ? `${key}: listened, but outside the current streak`
          : isFuture
            ? `${key}: future day`
            : `${key}: no listening activity`;
      pieces.push(`<span class="${classes}" title="${title}" aria-label="${title}">${day}</span>`);
    }
    daysNode.innerHTML = pieces.join('');

    const message = daysNode.nextElementSibling;
    if (message?.tagName === 'P') message.textContent = `${streak}-day current streak · ${monthName} calendar.`;
  }

  function applyStreak() {
    const card = app.querySelector('.streak-card');
    if (!card) return;

    const activeDates = new Set(Array.isArray(stats?.active_dates) ? stats.active_dates.filter(Boolean) : []);
    const derived = currentStreak(activeDates);
    const apiStreak = Math.max(0, Number(stats?.listening_streak_days || 0));
    const hasApiStreak = Boolean(stats && Object.prototype.hasOwnProperty.call(stats, 'listening_streak_days'));
    const streak = hasApiStreak ? apiStreak : derived.days;
    const streakKeys = hasApiStreak ? authoritativeStreakKeys(streak, activeDates) : derived.keys;

    card.dataset.streakSource = hasApiStreak ? 'profile-stats-api' : 'active-dates-fallback';
    card.dataset.listeningStreakDays = String(streak);
    card.dataset.streakView = streak > 7 ? 'month' : 'week';

    const numberNode = card.querySelector('.streak-number strong');
    const label = card.querySelector('.streak-number + b');
    const daysNode = card.querySelector('.streak-days');
    if (numberNode) numberNode.textContent = String(streak);
    if (label) label.textContent = `day${streak === 1 ? '' : 's'} in a row`;
    if (!daysNode) return;

    if (streak > 7) renderMonth(card, daysNode, activeDates, streakKeys, streak);
    else renderWeek(card, daysNode, activeDates, streakKeys, streak);
  }

  function apply() {
    scheduled = false;
    if (!stats) return;
    setStat('Playlists', Number(stats.playlists || 0).toLocaleString());
    setStat('Favorites', Number(stats.favorites || 0).toLocaleString());
    setStat('Songs Played', Number(stats.qualified_plays || 0).toLocaleString());
    setStat('Hours Listened', formatHours(stats.total_seconds_played));
    setStat('Following', Number(stats.following || 0).toLocaleString());
    applyTopGenres();
    applyStreak();
  }

  function queueApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(apply);
  }

  async function load(force = false) {
    if (loading || (!force && stats) || !app.querySelector('.profile-stat-grid')) return;
    const tokens = readTokens();
    if (!tokens.accessToken) return;
    loading = true;
    try {
      const response = await fetch(`${API_ROOT}/radio/me/profile-stats?timezone_offset_minutes=${encodeURIComponent(new Date().getTimezoneOffset())}&profile_refresh=${Date.now()}`, {
        cache: 'no-store',
        credentials: 'omit',
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          ...(tokens.idToken ? { 'X-Cognito-Id-Token': tokens.idToken } : {})
        }
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      stats = body.stats || null;
      lastLoadedAt = Date.now();
      queueApply();
      window.dispatchEvent(new CustomEvent('stashbox:profile-stats-loaded', { detail: stats || {} }));
    } catch (_) {
      clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => {
        loading = false;
        load(true);
      }, 1800);
      return;
    }
    loading = false;
  }

  function refreshActiveProfile() {
    if (document.visibilityState === 'hidden') return;
    if (Date.now() - lastLoadedAt < 750) {
      queueApply();
      return;
    }
    load(true);
  }

  const observer = new MutationObserver(() => {
    queueApply();
    load(false);
  });
  observer.observe(app, { childList: true, subtree: true });

  window.addEventListener('pageshow', refreshActiveProfile);
  window.addEventListener('focus', refreshActiveProfile);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshActiveProfile();
  });
  window.addEventListener('stashbox:profile-stats-refresh', refreshActiveProfile);

  load(false);
})();