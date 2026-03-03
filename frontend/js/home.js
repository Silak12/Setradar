/**
 * home.js - Setradar
 */
const SUPABASE_URL = CONFIG.SUPABASE_URL;
const SUPABASE_KEY = CONFIG.SUPABASE_PUBLISHABLE_KEY || CONFIG.SUPABASE_ANON;
const AUTH_MODES = { LOGIN: 'login', SIGNUP: 'signup' };
const DEMO_HYPE_TOTALS = {
  1: { seed_hype: 62, real_hype: 8, total_hype: 70 },
  2: { seed_hype: 31, real_hype: 6, total_hype: 37 },
};
function isPlaceholderValue(v) { return !v || /^DEIN(?:E)?_SUPABASE_/i.test(v); }
function isLegacyJwtKey(v) { return typeof v === 'string' && v.startsWith('eyJ') && v.split('.').length === 3; }
function getDateStr(daysOffset = 0) { const d = new Date(); d.setDate(d.getDate() + daysOffset); return d.toISOString().split('T')[0]; }
const DEMO_EVENTS = [
  {
    id: 1,
    event_name: 'Candyflip x Wyldhearts',
    event_date: getDateStr(0),
    time_start: '23:00:00',
    time_end: '09:00:00',
    clubs: { id: 1, name: 'Lokschuppen' },
    event_acts: [
      { start_time: '02:00:00', end_time: '03:30:00', sort_order: 1, acts: { id: 1, name: 'DATSKO', insta_name: 'datsko_official' } },
      { start_time: null, end_time: null, sort_order: 2, acts: { id: 2, name: 'SZG', insta_name: null } },
      { start_time: null, end_time: null, sort_order: 3, acts: { id: 3, name: 'BabaBass3000', insta_name: 'babybass3k' } },
      { start_time: '23:00:00', end_time: '01:00:00', sort_order: 4, acts: { id: 4, name: 'DJ Tallboy', insta_name: 'dj_tallboy' } },
    ],
  },
  {
    id: 2,
    event_name: 'Dystopia',
    event_date: getDateStr(1),
    time_start: '22:00:00',
    time_end: '08:00:00',
    clubs: { id: 2, name: 'Tresor' },
    event_acts: [
      { start_time: '00:00:00', end_time: '02:00:00', sort_order: 1, acts: { id: 1, name: 'DATSKO', insta_name: 'datsko_official' } },
      { start_time: '02:00:00', end_time: '04:00:00', sort_order: 2, acts: { id: 5, name: 'Alignment', insta_name: 'alignment_music' } },
    ],
  },
];
let allEvents = [];
let activeDateIdx = 0;
let supabaseClient = null;
let supabaseAnonClient = null;
let searchMode = false;
let searchFilter = 'all';
let sessionUser = null;
let userProfile = null;
let hypeTotalsByEventId = new Map();
let userHypedEventIds = new Set();
let favoriteEventIds = new Set();
let favoriteClubIds = new Set();
let favoriteActIds = new Set();
let popularEvents = [];
let pendingActionKeys = new Set();
let activeSearch = null;
let authMode = AUTH_MODES.LOGIN;
let demoMode = false;
let _dataLoaded = false;
// ── Phase 2: Live Mode state ─────────────────────────────────────────────
let userPresence = null;          // { user_id, event_id, status } | null
let liveEventData = { queue: null, buckets: [], mood: null };
let livePollingId = null;
let livePanelExpanded = false;

function fmtTime(t) { return t ? String(t).slice(0, 5) : null; }
function timeToMinutes(t) { if (!t) return Infinity; const [h, m] = t.split(':').map(Number); const mins = h * 60 + m; return mins < 14 * 60 ? mins + 1440 : mins; }
function sortActs(acts) {
  const withTime = acts.filter(a => a.start_time).sort((a, b) => timeToMinutes(fmtTime(a.start_time)) - timeToMinutes(fmtTime(b.start_time)));
  const withoutTime = acts.filter(a => !a.start_time).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return [...withTime, ...withoutTime];
}
function formatDateLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return {
    day: String(d.getDate()).padStart(2, '0'),
    month: String(d.getMonth() + 1).padStart(2, '0'),
    weekday: ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA'][d.getDay()],
  };
}
function formatTabLabel(dateStr) {
  const today = getDateStr(0), tomorrow = getDateStr(1), d = new Date(`${dateStr}T00:00:00`), w = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  if (dateStr === today) return 'Heute';
  if (dateStr === tomorrow) return 'Morgen';
  return `${w[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
}
function groupByDate(events) {
  const map = {};
  events.forEach(ev => { if (!map[ev.event_date]) map[ev.event_date] = []; map[ev.event_date].push(ev); });
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
}
function zeroHype() { return { seed_hype: 0, real_hype: 0, total_hype: 0 }; }
function visibleEventIds(events = allEvents) { return [...new Set((events || []).map(ev => Number(ev.id)).filter(Number.isFinite))]; }
function setHype(eventId, stats) {
  hypeTotalsByEventId.set(Number(eventId), {
    seed_hype: Number(stats.seed_hype) || 0,
    real_hype: Number(stats.real_hype) || 0,
    total_hype: Number(stats.total_hype) || 0,
  });
}
function getHype(eventId) { return hypeTotalsByEventId.get(Number(eventId)) || zeroHype(); }
function bumpHype(eventId, delta) {
  const current = getHype(eventId);
  setHype(eventId, {
    seed_hype: current.seed_hype,
    real_hype: Math.max(0, current.real_hype + delta),
    total_hype: Math.max(0, current.total_hype + delta),
  });
}
function clearUserCollections() {
  userHypedEventIds = new Set();
  favoriteEventIds = new Set();
  favoriteClubIds = new Set();
  favoriteActIds = new Set();
  userPresence = null;
}
function favoriteSet(type) {
  if (type === 'event') return favoriteEventIds;
  if (type === 'club') return favoriteClubIds;
  if (type === 'act') return favoriteActIds;
  return null;
}
function userLabel() {
  if (!sessionUser) return 'Gast';
  return userProfile?.display_name || sessionUser.user_metadata?.name || sessionUser.email || 'Angemeldet';
}
function updateStatusBar() {
  const bar = document.getElementById('statusBar');
  if (!bar) return;
  const count = allEvents.filter(ev => ev.event_date === getDateStr(0)).length;
  const time = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  bar.innerHTML = `
    <div class="status-bar-left"><span class="status-live-dot"></span><span>Live - ${count} Event${count !== 1 ? 's' : ''} heute</span></div>
    <div class="status-bar-right">${time}</div>
  `;
}
function setLastUpdated() {
  const el = document.getElementById('lastUpdated');
  if (el) el.textContent = 'Stand: ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
function syncBodyLock() {
  const artistOpen = document.getElementById('artistOverlay')?.classList.contains('open');
  const authOpen = document.getElementById('authOverlay')?.classList.contains('open');
  document.body.style.overflow = artistOpen || authOpen ? 'hidden' : '';
}
function getMinutesUntil(startTimeStr, eventDateStr) {
  if (!startTimeStr || !eventDateStr || eventDateStr !== getDateStr(0)) return null;
  const now = new Date();
  const [h, m] = startTimeStr.slice(0, 5).split(':').map(Number);
  const setTime = new Date();
  setTime.setHours(h, m, 0, 0);
  if (h < 14) setTime.setDate(setTime.getDate() + 1);
  const diffMin = Math.round((setTime - now) / 60000);
  return diffMin < 0 ? null : diffMin;
}
function fmtCountdown(mins) { if (mins < 60) return `in ${mins}min`; const h = Math.floor(mins / 60), m = mins % 60; return `in ${h}:${String(m).padStart(2, '0')}h`; }
function getNextActIds(events) {
  const upcoming = [];
  events.forEach(ev => {
    if (ev.event_date !== getDateStr(0)) return;
    (ev.event_acts || []).forEach(a => {
      const mins = getMinutesUntil(a.start_time, ev.event_date);
      if (mins !== null) upcoming.push({ sortKey: timeToMinutes(fmtTime(a.start_time)), key: `${ev.id}_${a.sort_order}` });
    });
  });
  upcoming.sort((a, b) => a.sortKey - b.sortKey);
  return upcoming.slice(0, 3).map(u => u.key);
}
function compareSchedule(a, b) {
  const t = timeToMinutes(fmtTime(a.time_start)) - timeToMinutes(fmtTime(b.time_start));
  if (t) return t;
  return String(a.event_name || '').localeCompare(String(b.event_name || ''), 'de');
}
function priorityBucket(ev) {
  if (userHypedEventIds.has(Number(ev.id))) return 0;
  if (ev.clubs?.id && favoriteClubIds.has(Number(ev.clubs.id))) return 1;
  return 2;
}
function sortForDay(events) {
  return [...events].sort((a, b) => {
    const bucket = priorityBucket(a) - priorityBucket(b);
    if (bucket) return bucket;
    const hypeDiff = getHype(b.id).total_hype - getHype(a.id).total_hype;
    if (hypeDiff) return hypeDiff;
    return compareSchedule(a, b);
  });
}
function buildPopularEvents() {
  const today = getDateStr(0), maxDate = getDateStr(14);
  const candidates = allEvents.filter(ev => ev.event_date >= today && ev.event_date <= maxDate);
  const hasTrend = candidates.some(ev => getHype(ev.id).total_hype > 0);
  const sorted = [...candidates].sort((a, b) => {
    if (hasTrend) {
      const hypeDiff = getHype(b.id).total_hype - getHype(a.id).total_hype;
      if (hypeDiff) return hypeDiff;
    }
    if (a.event_date !== b.event_date) return a.event_date.localeCompare(b.event_date);
    return compareSchedule(a, b);
  });
  popularEvents = sorted.slice(0, 5).map(ev => ({ event: ev, hype: getHype(ev.id), fallback: !hasTrend }));
}
function setAuthMessage(text = '', type = '') {
  const el = document.getElementById('authMessage');
  if (!el) return;
  el.textContent = text;
  el.className = 'auth-message' + (type ? ` ${type}` : '');
}
function setAuthMode(mode) {
  authMode = mode === AUTH_MODES.SIGNUP ? AUTH_MODES.SIGNUP : AUTH_MODES.LOGIN;
  document.getElementById('authModeLogin')?.classList.toggle('active', authMode === AUTH_MODES.LOGIN);
  document.getElementById('authModeSignup')?.classList.toggle('active', authMode === AUTH_MODES.SIGNUP);
  document.getElementById('authDisplayNameRow')?.classList.toggle('visible', authMode === AUTH_MODES.SIGNUP);
  const password = document.getElementById('authPassword');
  if (password) password.autocomplete = authMode === AUTH_MODES.SIGNUP ? 'new-password' : 'current-password';
  const submit = document.getElementById('authSubmit');
  if (submit) submit.textContent = authMode === AUTH_MODES.SIGNUP ? 'Signup' : 'Login';
  setAuthMessage('');
}
function openAuthModal(mode = AUTH_MODES.LOGIN, msg = '') {
  setAuthMode(mode);
  if (msg) setAuthMessage(msg);
  const overlay = document.getElementById('authOverlay');
  if (!overlay) return;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  syncBodyLock();
  setTimeout(() => document.getElementById('authEmail')?.focus(), 60);
}
function closeAuthModal() {
  const overlay = document.getElementById('authOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  setAuthMessage('');
  syncBodyLock();
}
function updateAuthUi() {
  const user = document.getElementById('navUserState');
  const button = document.getElementById('navAuthButton');
  if (user) {
    user.textContent = userLabel();
    if (sessionUser) {
      user.setAttribute('href', 'profile.html');
      user.style.cursor = 'pointer';
      user.title = 'Profil ansehen';
    } else {
      user.removeAttribute('href');
      user.style.cursor = 'default';
      user.removeAttribute('title');
    }
  }
  if (button) button.textContent = sessionUser ? 'Logout' : 'Login';
}
async function fetchUserProfile() {
  if (!supabaseClient || !sessionUser) { userProfile = null; return null; }
  try {
    const { data, error } = await supabaseClient.from('profiles').select('user_id, display_name, avatar_url').eq('user_id', sessionUser.id).maybeSingle();
    if (error) throw error;
    userProfile = data || null;
    return userProfile;
  } catch (err) {
    console.warn('Profile fetch error:', err.message || err);
    userProfile = null;
    return null;
  }
}
async function hydrateSession() {
  if (!supabaseClient) { sessionUser = null; userProfile = null; return; }
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    sessionUser = data.session?.user || null;
  } catch (err) {
    console.warn('Auth session error:', err.message || err);
    sessionUser = null;
  }
  if (sessionUser) await fetchUserProfile();
  else userProfile = null;
}
function ensureAuthenticated(label = 'Diese Aktion') {
  if (sessionUser) return true;
  openAuthModal(AUTH_MODES.LOGIN, `${label} braucht einen Login.`);
  return false;
}
async function onAuthSubmit(event) {
  event.preventDefault();
  if (!supabaseClient) { setAuthMessage('Supabase ist nicht verfuegbar.', 'error'); return; }
  const email = document.getElementById('authEmail')?.value.trim();
  const password = document.getElementById('authPassword')?.value || '';
  const displayName = document.getElementById('authDisplayName')?.value.trim();
  const submit = document.getElementById('authSubmit');
  if (!email || !password) { setAuthMessage('E-Mail und Passwort sind Pflicht.', 'error'); return; }
  if (submit) submit.disabled = true;
  setAuthMessage(authMode === AUTH_MODES.SIGNUP ? 'Account wird erstellt...' : 'Login laeuft...');
  try {
    if (authMode === AUTH_MODES.SIGNUP) {
      const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { data: { name: displayName || email } } });
      if (error) throw error;
      if (data.session?.user) {
        sessionUser = data.session.user;
        await fetchUserProfile();
        await loadUserCollections(allEvents);
        rerenderView({ preserveDateNavScroll: true });
        closeAuthModal();
      } else {
        setAuthMessage('Check deine Mail und bestaetige den Account.', 'success');
      }
    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await hydrateSession();
      await loadUserCollections(allEvents);
      rerenderView({ preserveDateNavScroll: true });
      closeAuthModal();
    }
  } catch (err) {
    setAuthMessage(err.message || 'Auth Fehler.', 'error');
  } finally {
    if (submit) submit.disabled = false;
  }
}
async function onNavAuthClick() {
  if (!sessionUser) { openAuthModal(AUTH_MODES.LOGIN); return; }
  if (!supabaseClient) return;
  sessionUser = null;
  userProfile = null;
  clearUserCollections();
  stopLivePolling();
  hideLivePanel();
  liveEventData = { queue: null, buckets: [], mood: null };
  livePanelExpanded = false;
  rerenderView({ preserveDateNavScroll: true });
  supabaseClient.auth.signOut().catch(err => console.warn('Logout error:', err.message || err));
}
function initAuthUi() {
  document.getElementById('authOverlayBg')?.addEventListener('click', closeAuthModal);
  document.getElementById('authModalClose')?.addEventListener('click', closeAuthModal);
  document.getElementById('authModeLogin')?.addEventListener('click', () => setAuthMode(AUTH_MODES.LOGIN));
  document.getElementById('authModeSignup')?.addEventListener('click', () => setAuthMode(AUTH_MODES.SIGNUP));
  document.getElementById('authForm')?.addEventListener('submit', onAuthSubmit);
  document.getElementById('navAuthButton')?.addEventListener('click', onNavAuthClick);
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('authOverlay')?.classList.contains('open')) closeAuthModal();
  });
  setAuthMode(AUTH_MODES.LOGIN);
  updateAuthUi();
}
function subscribeAuthState() {
  if (!supabaseClient) return;
  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    sessionUser = session?.user || null;
    if (sessionUser) await fetchUserProfile();
    else {
      userProfile = null;
      clearUserCollections();
      stopLivePolling();
      hideLivePanel();
      liveEventData = { queue: null, buckets: [], mood: null };
      livePanelExpanded = false;
    }
    if (!_dataLoaded) return;
    await loadUserCollections(allEvents);
    rerenderView({ preserveDateNavScroll: true });
  });
}
function syncDateNav({ smooth = true } = {}) {
  const nav = document.getElementById('dateNav');
  const active = nav?.querySelector('.date-tab.active');
  if (!nav || !active) return;
  const pad = parseFloat(getComputedStyle(nav).paddingLeft) || 0;
  nav.scrollTo({ left: Math.max(0, active.offsetLeft - pad), behavior: smooth ? 'smooth' : 'auto' });
}
function renderDateTabs(grouped, { syncToActive = true, smoothSync = true } = {}) {
  const nav = document.getElementById('dateNav');
  if (!nav) return;
  nav.innerHTML = '';
  grouped.forEach(([dateStr], i) => {
    const btn = document.createElement('button');
    btn.className = 'date-tab' + (i === activeDateIdx ? ' active' : '');
    btn.textContent = formatTabLabel(dateStr);
    btn.onclick = () => {
      activeDateIdx = i;
      searchMode = false;
      activeSearch = null;
      clearSearch({ rerender: false });
      renderAll();
    };
    nav.appendChild(btn);
  });
  if (syncToActive) syncDateNav({ smooth: smoothSync });
}
function truncateWords(text, max = 5) {
  const words = String(text || '').trim().split(/\s+/);
  return words.length <= max ? text : words.slice(0, max).join(' ') + '…';
}
function renderPopularEvents() {
  const rail = document.getElementById('popularRail');
  if (!rail) return;
  if (!popularEvents.length) { rail.innerHTML = ''; return; }
  const fallback = popularEvents.every(item => item.fallback);
  rail.innerHTML = `
    <div class="popular-rail-shell">
      <div class="popular-rail-header">
        <span class="popular-rail-title">Beliebte Events</span>
        <span class="popular-rail-subtitle">${fallback ? 'Noch kein Trend' : 'Seed + echte Hypes'}</span>
      </div>
      <div class="popular-rail-list">
        ${popularEvents.map(item => {
          const ev = item.event, d = formatDateLabel(ev.event_date);
          return `
            <button class="popular-item" type="button" data-popular-event-id="${ev.id}" data-popular-event-date="${ev.event_date}">
              <div class="popular-item-date">${d.weekday} ${d.day}.${d.month}</div>
              <div class="popular-item-name">${truncateWords(ev.event_name)}</div>
              <div class="popular-item-meta">
                <span>${ev.clubs?.name || '-'}</span>
                <span class="popular-item-hype">${fallback ? 'Noch kein Trend' : `Hype ${item.hype.total_hype}`}</span>
              </div>
            </button>
          `;
        }).join('')}
      </div>
    </div>
  `;
}
function renderEventCard(ev, nextActKeys) {
  const acts = sortActs(ev.event_acts || []);
  const hasTime = acts.some(a => a.start_time);
  const venue = ev.clubs?.name ?? '-';
  const doors = fmtTime(ev.time_start);
  const close = fmtTime(ev.time_end);
  const hype = getHype(ev.id);
  const isHyped = userHypedEventIds.has(Number(ev.id));
  const isClubFavorite = ev.clubs?.id ? favoriteClubIds.has(Number(ev.clubs.id)) : false;
  const venueHtml = ev.clubs?.id
    ? `<span class="venue-name-group"><span class="venue-tag">${venue}</span><button class="club-follow-btn${isClubFavorite ? ' active' : ''}" type="button" data-action="toggle-favorite-club" data-club-id="${ev.clubs.id}" aria-pressed="${isClubFavorite}">${isClubFavorite ? '−' : '+'}</button></span>`
    : `<span class="venue-tag">${venue}</span>`;
  const artistRows = acts.map(a => {
    const start = fmtTime(a.start_time), end = fmtTime(a.end_time), label = start && end ? `${start} - ${end}` : start ? `ab ${start}` : null;
    const actKey = `${ev.id}_${a.sort_order}`;
    const mins = nextActKeys.includes(actKey) ? getMinutesUntil(start, ev.event_date) : null;
    const countdown = mins !== null ? fmtCountdown(mins) : null;
    const actId = a.acts?.id ?? null;
    const isActFavorite = actId ? favoriteActIds.has(Number(actId)) : false;
    const actFollowBtn = actId
      ? `<button class="act-follow-btn${isActFavorite ? ' active' : ''}" type="button" data-action="toggle-favorite-act" data-act-id="${actId}" aria-pressed="${isActFavorite}">${isActFavorite ? '−' : '+'}</button>`
      : '';
    return `
      <div class="artist-row ${start ? 'has-time' : ''}">
        <span class="artist-name">
          <span class="artist-name-link" ${actId ? `data-act-id="${actId}"` : ''} data-act-name="${a.acts?.name ?? '?'}">${a.acts?.name ?? '?'}</span>
          ${actFollowBtn}
          ${countdown ? `<span class="countdown ${mins < 30 ? 'soon' : ''}">${countdown}</span>` : ''}
        </span>
        ${label ? `<span class="artist-time confirmed">${label}</span>` : `<span class="time-tba">TBA</span>`}
      </div>
    `;
  }).join('');
  return `
    <div class="event-card" data-event-id="${ev.id}">
      <div class="card-header">
        <div class="event-name">${ev.event_name}</div>
        <div class="event-meta">
          ${venueHtml}
          ${doors ? `<span class="doors-time">↳ ${doors}${close ? ' - ' + close : ''}</span>` : ''}
          <span class="status-badge ${hasTime ? 'confirmed' : 'pending'}"><span class="status-dot"></span>${hasTime ? 'Timetable' : 'Lineup'}</span>
        </div>
      </div>
      <div class="event-actions">
        <div class="event-actions-left">
          <button class="event-action-button hype-button${isHyped ? ' active' : ''}" type="button" data-action="toggle-hype" data-event-id="${ev.id}" aria-pressed="${isHyped}">
            <span class="spark-icon">&#10022;</span><span>Hype</span><span class="hype-count">${hype.total_hype}</span>
          </button>
        </div>
        <div class="event-actions-right">${buildPresenceBtn(ev.id)}</div>
      </div>
      <div class="artist-list"><div class="artist-list-label">Artists</div>${artistRows || '<span class="time-tba">Noch keine Infos</span>'}</div>
    </div>
  `;
}
function renderAll({ preserveDateNavScroll = false } = {}) {
  if (searchMode && activeSearch) { rerenderSearch(); return; }
  const grouped = groupByDate(allEvents), nextActKeys = getNextActIds(allEvents), main = document.getElementById('mainContent');
  if (!main) return;
  activeDateIdx = grouped.length ? Math.max(0, Math.min(activeDateIdx, grouped.length - 1)) : 0;
  renderDateTabs(grouped, { syncToActive: !preserveDateNavScroll, smoothSync: !preserveDateNavScroll });
  renderPopularEvents();
  updateStatusBar();
  const scrollY = window.scrollY;
  if (!grouped.length) {
    main.innerHTML = `<div class="empty-state"><span>Keine Events gefunden</span></div>`;
    window.scrollTo(0, scrollY);
    setLastUpdated();
    return;
  }
  const [dateStr, rawEvents] = grouped[activeDateIdx] ?? grouped[0];
  const d = formatDateLabel(dateStr), events = sortForDay(rawEvents);
  main.innerHTML = `
    <div class="day-section">
      <div class="day-label"><div><div class="weekday">${d.weekday}</div>${d.day}.${d.month}</div></div>
      <div class="day-divider"></div>
      ${events.length ? events.map(ev => renderEventCard(ev, nextActKeys)).join('') : '<div class="no-events">Keine Events an diesem Tag</div>'}
    </div>
  `;
  window.scrollTo(0, scrollY);
  setLastUpdated();
  bindArtistClicks();
}
function flashEventCard(eventId) {
  const card = document.querySelector(`[data-event-id="${eventId}"]`);
  if (!card) return;
  card.classList.remove('flash');
  void card.offsetWidth;
  card.classList.add('flash');
}
function triggerHypeBurst(eventId) {
  const button = document.querySelector(`[data-action="toggle-hype"][data-event-id="${eventId}"]`);
  if (!button) return;
  button.classList.remove('just-hyped');
  void button.offsetWidth;
  button.classList.add('just-hyped');
  setTimeout(() => button.classList.remove('just-hyped'), 450);
}
function rerenderView({ preserveDateNavScroll = false } = {}) {
  buildPopularEvents();
  updateAuthUi();
  if (searchMode && activeSearch) rerenderSearch();
  else renderAll({ preserveDateNavScroll });
}
function jumpToEvent(dateStr, eventId) {
  if (!dateStr) return;
  const grouped = groupByDate(allEvents), idx = grouped.findIndex(([d]) => d === dateStr);
  if (idx === -1) return;
  searchMode = false;
  activeSearch = null;
  activeDateIdx = idx;
  clearSearch({ rerender: false });
  renderAll();
  if (eventId) setTimeout(() => document.querySelector(`[data-event-id="${eventId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 90);
}
function initSearch() {
  const input = document.getElementById('searchInput'), results = document.getElementById('searchResults'), clear = document.getElementById('searchClear');
  if (!input || !results || !clear) return;
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      searchFilter = btn.dataset.type;
      if (input.value.trim()) doSearch(input.value.trim());
    });
  });
  input.addEventListener('input', () => {
    const q = input.value.trim();
    clear.classList.toggle('visible', q.length > 0);
    if (!q) { results.classList.remove('open'); results.innerHTML = ''; return; }
    doSearch(q);
  });
  input.addEventListener('focus', () => { if (input.value.trim()) results.classList.add('open'); });
  input.addEventListener('keydown', e => { if (e.key === 'Escape') { clearSearch(); input.blur(); } });
  clear.addEventListener('click', () => { clearSearch(); input.focus(); });
  document.addEventListener('click', e => { if (!e.target.closest('.search-wrapper')) results.classList.remove('open'); });
}
function clearSearch({ rerender = true } = {}) {
  const input = document.getElementById('searchInput'), results = document.getElementById('searchResults'), clear = document.getElementById('searchClear');
  if (input) input.value = '';
  if (results) { results.classList.remove('open'); results.innerHTML = ''; }
  if (clear) clear.classList.remove('visible');
  if (searchMode) {
    searchMode = false;
    activeSearch = null;
    if (rerender) renderAll();
  }
}
window.clearSearch = clearSearch;
function doSearch(q) {
  const lower = q.toLowerCase(), results = document.getElementById('searchResults');
  if (!results) return;
  const actMap = {}, clubMap = {};
  allEvents.forEach(ev => {
    (ev.event_acts || []).forEach(a => { if (a.acts) { const id = a.acts.id ?? a.acts.name; if (!actMap[id]) actMap[id] = { ...a.acts, type: 'artist' }; } });
    if (ev.clubs?.name && !clubMap[ev.clubs.name]) clubMap[ev.clubs.name] = { ...ev.clubs, type: 'club' };
  });
  const artists = Object.values(actMap).filter(a => (searchFilter === 'all' || searchFilter === 'artist') && String(a.name || '').toLowerCase().includes(lower));
  const clubs = Object.values(clubMap).filter(c => (searchFilter === 'all' || searchFilter === 'club') && String(c.name || '').toLowerCase().includes(lower));
  if (!artists.length && !clubs.length) {
    results.innerHTML = `<div class="search-no-results">Keine Ergebnisse fuer "${q}"</div>`;
    results.classList.add('open');
    return;
  }
  let html = '';
  if (artists.length) {
    html += `<div class="search-results-header">Artists (${artists.length})</div>`;
    artists.slice(0, 6).forEach(a => {
      const upcoming = countUpcomingEvents(a.id ?? a.name, 'artist');
      html += `<div class="search-result-item" data-search-type="artist" data-id="${a.id ?? ''}" data-name="${a.name}"><span class="result-type-tag artist">DJ</span><span class="result-name">${highlight(a.name, q)}</span><span class="result-sub">${upcoming} Event${upcoming !== 1 ? 's' : ''}</span><span class="result-arrow">-></span></div>`;
    });
  }
  if (clubs.length) {
    html += `<div class="search-results-header">Clubs (${clubs.length})</div>`;
    clubs.slice(0, 4).forEach(c => {
      const upcoming = countUpcomingEvents(c.name, 'club');
      html += `<div class="search-result-item" data-search-type="club" data-id="${c.id ?? ''}" data-name="${c.name}"><span class="result-type-tag club">CLUB</span><span class="result-name">${highlight(c.name, q)}</span><span class="result-sub">${upcoming} Event${upcoming !== 1 ? 's' : ''}</span><span class="result-arrow">-></span></div>`;
    });
  }
  results.innerHTML = html;
  results.classList.add('open');
  results.querySelectorAll('.search-result-item').forEach(item => item.addEventListener('click', () => {
    results.classList.remove('open');
    if (item.dataset.searchType === 'artist') showArtistSearch(item.dataset.id || null, item.dataset.name);
    if (item.dataset.searchType === 'club') showClubSearch(item.dataset.name);
  }));
}
function highlight(text, q) {
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return text.slice(0, idx) + `<mark style="background:rgba(255,32,32,0.3);color:var(--white)">${text.slice(idx, idx + q.length)}</mark>` + text.slice(idx + q.length);
}
function countUpcomingEvents(idOrName, type) {
  const today = getDateStr(0);
  if (type === 'artist') return allEvents.filter(ev => ev.event_date >= today && (ev.event_acts || []).some(a => a.acts && (a.acts.id == idOrName || a.acts.name === idOrName))).length;
  return allEvents.filter(ev => ev.event_date >= today && ev.clubs?.name === idOrName).length;
}
function showClubSearch(clubName) {
  const today = getDateStr(0);
  activeSearch = { type: 'club', name: clubName, label: `Club: ${clubName}` };
  searchMode = true;
  renderSearchResults(activeSearch.label, groupByDate(allEvents.filter(ev => ev.clubs?.name === clubName && ev.event_date >= today)));
}
function showArtistSearch(actId, actName) {
  const today = getDateStr(0);
  activeSearch = { type: 'artist', id: actId, name: actName, label: `Artist: ${actName}` };
  searchMode = true;
  renderSearchResults(activeSearch.label, groupByDate(allEvents.filter(ev => ev.event_date >= today && (ev.event_acts || []).some(a => a.acts && (a.acts.id == actId || a.acts.name === actName)))));
}
function rerenderSearch() {
  if (!activeSearch) { searchMode = false; renderAll({ preserveDateNavScroll: true }); return; }
  if (activeSearch.type === 'club') showClubSearch(activeSearch.name);
  else showArtistSearch(activeSearch.id, activeSearch.name);
}
function renderSearchResults(label, grouped) {
  const nextActKeys = getNextActIds(allEvents), main = document.getElementById('mainContent');
  if (!main) return;
  renderPopularEvents();
  updateStatusBar();
  if (!grouped.length) {
    main.innerHTML = `<div class="search-active-banner"><span><strong>${label}</strong> - Keine kommenden Events</span><button class="search-banner-close" type="button" onclick="clearSearch()">Zurueck</button></div><div class="empty-state"><span>Keine Events gefunden</span></div>`;
    setLastUpdated();
    return;
  }
  let html = `<div class="search-active-banner"><span>Ergebnisse fuer <strong>${label}</strong></span><button class="search-banner-close" type="button" onclick="clearSearch()">Zurueck</button></div>`;
  grouped.forEach(([dateStr, rawEvents]) => {
    const d = formatDateLabel(dateStr), events = sortForDay(rawEvents);
    html += `
      <div class="day-section">
        <div class="day-label"><div><div class="weekday">${d.weekday}</div>${d.day}.${d.month}</div></div>
        <div class="day-divider"></div>
        ${events.map(ev => renderEventCard(ev, nextActKeys)).join('')}
      </div>
    `;
  });
  main.innerHTML = html;
  setLastUpdated();
  bindArtistClicks();
}
async function toggleFavorite(type, id, { rerender = true, onChange = null } = {}) {
  const numericId = Number(id), set = favoriteSet(type);
  if (!set || !Number.isFinite(numericId) || !ensureAuthenticated('Favoriten') || !supabaseClient) return false;
  const key = `favorite:${type}:${numericId}`;
  if (pendingActionKeys.has(key)) return false;
  const active = set.has(numericId);
  pendingActionKeys.add(key);
  if (active) set.delete(numericId);
  else set.add(numericId);
  if (rerender) rerenderView({ preserveDateNavScroll: true });
  if (onChange) onChange();
  try {
    if (active) {
      const { error } = await supabaseClient.from('favorites').delete().eq('user_id', sessionUser.id).eq('entity_type', type).eq('entity_id', numericId);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient.from('favorites').insert({ user_id: sessionUser.id, entity_type: type, entity_id: numericId });
      if (error) throw error;
    }
    return true;
  } catch (err) {
    console.warn('Favorite toggle error:', err.message || err);
    if (active) set.add(numericId);
    else set.delete(numericId);
    if (rerender) rerenderView({ preserveDateNavScroll: true });
    if (onChange) onChange();
    return false;
  } finally {
    pendingActionKeys.delete(key);
  }
}
async function toggleHype(id) {
  const eventId = Number(id);
  if (!Number.isFinite(eventId) || !ensureAuthenticated('Hype') || !supabaseClient) return false;
  const key = `hype:${eventId}`;
  if (pendingActionKeys.has(key)) return false;
  const active = userHypedEventIds.has(eventId);
  pendingActionKeys.add(key);
  if (active) { userHypedEventIds.delete(eventId); bumpHype(eventId, -1); }
  else { userHypedEventIds.add(eventId); bumpHype(eventId, 1); }
  syncHypeButton(eventId); buildPopularEvents(); renderPopularEvents();
  try {
    if (active) {
      const { error } = await supabaseClient.from('event_hypes').delete().eq('user_id', sessionUser.id).eq('event_id', eventId);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient.from('event_hypes').insert({ user_id: sessionUser.id, event_id: eventId });
      if (error) throw error;
      triggerHypeBurst(eventId);
    }
    return true;
  } catch (err) {
    console.warn('Hype toggle error:', err.message || err);
    if (active) { userHypedEventIds.add(eventId); bumpHype(eventId, 1); }
    else { userHypedEventIds.delete(eventId); bumpHype(eventId, -1); }
    syncHypeButton(eventId); buildPopularEvents(); renderPopularEvents();
    return false;
  } finally {
    pendingActionKeys.delete(key);
  }
}
function syncActFavoriteButton(actId) {
  const button = document.querySelector(`[data-favorite-act-id="${actId}"]`);
  if (!button) return;
  const active = favoriteActIds.has(Number(actId));
  button.classList.toggle('active', active);
  button.setAttribute('aria-pressed', String(active));
  const label = button.querySelector('.modal-act-favorite-label');
  if (label) label.textContent = active ? 'Saved' : 'Save';
}
function syncHypeButton(eventId) {
  const isHyped = userHypedEventIds.has(Number(eventId));
  const hype = getHype(eventId);
  document.querySelectorAll(`[data-action="toggle-hype"][data-event-id="${eventId}"]`).forEach(btn => {
    btn.classList.toggle('active', isHyped);
    btn.setAttribute('aria-pressed', String(isHyped));
    const count = btn.querySelector('.hype-count');
    if (count) count.textContent = hype.total_hype;
  });
}
function syncClubFollowButtons(clubId) {
  const isActive = favoriteClubIds.has(Number(clubId));
  document.querySelectorAll(`[data-action="toggle-favorite-club"][data-club-id="${clubId}"]`).forEach(btn => {
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
    btn.textContent = isActive ? '−' : '+';
  });
}
function syncActFollowButtons(actId) {
  const isActive = favoriteActIds.has(Number(actId));
  document.querySelectorAll(`[data-action="toggle-favorite-act"][data-act-id="${actId}"]`).forEach(btn => {
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
    btn.textContent = isActive ? '−' : '+';
  });
  syncActFavoriteButton(actId);
}
function bindActionHandlers() {
  document.getElementById('mainContent')?.addEventListener('click', async e => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    e.preventDefault();
    if (target.dataset.action === 'toggle-hype') await toggleHype(target.dataset.eventId);
    if (target.dataset.action === 'toggle-favorite-event') await toggleFavorite('event', target.dataset.eventId);
    if (target.dataset.action === 'toggle-favorite-club') {
      const clubId = Number(target.dataset.clubId);
      await toggleFavorite('club', clubId, { rerender: false, onChange: () => syncClubFollowButtons(clubId) });
    }
    if (target.dataset.action === 'toggle-favorite-act') {
      const actId = Number(target.dataset.actId);
      await toggleFavorite('act', actId, { rerender: false, onChange: () => syncActFollowButtons(actId) });
    }
    if (target.dataset.action === 'set-presence') {
      await setPresenceStatus(Number(target.dataset.eventId), target.dataset.nextStatus);
    }
  });
  document.getElementById('popularRail')?.addEventListener('click', e => {
    const item = e.target.closest('[data-popular-event-id]');
    if (item) jumpToEvent(item.dataset.popularEventDate, item.dataset.popularEventId);
  });
}
function bindArtistClicks() {
  document.querySelectorAll('.artist-name-link[data-act-id]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      openArtistPopup(el.dataset.actId, el.dataset.actName);
    });
  });
}
async function openArtistPopup(actId, actName) {
  const overlay = document.getElementById('artistOverlay'), content = document.getElementById('modalContent');
  if (!overlay || !content) return;
  content.innerHTML = `<div class="modal-artist-tag">// ARTIST</div><div class="modal-artist-name">${actName}</div><div class="modal-divider"></div><div style="color:var(--grey);font-size:11px;letter-spacing:0.1em">Loading...</div>`;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  syncBodyLock();
  let instaName = null, upcomingEvents = [];
  if (supabaseClient && actId) {
    const pubClient = supabaseAnonClient || supabaseClient;
    try {
      const { data: act } = await pubClient.from('acts').select('id, name, insta_name').eq('id', actId).maybeSingle();
      if (act) instaName = act.insta_name;
      const { data: eventActRows } = await pubClient.from('event_acts').select('id, start_time, end_time, event_id').eq('act_id', actId);
      if (eventActRows?.length) {
        const eventIds = eventActRows.map(r => r.event_id);
        const { data: eventRows } = await pubClient.from('events').select('id, event_name, event_date, time_start, clubs(id, name)').in('id', eventIds).gte('event_date', getDateStr(0)).order('event_date');
        if (eventRows) {
          const eventMap = {};
          eventRows.forEach(ev => { eventMap[ev.id] = ev; });
          upcomingEvents = eventActRows.map(ea => ({ start_time: ea.start_time, end_time: ea.end_time, events: eventMap[ea.event_id] || null })).filter(ea => ea.events).sort((a, b) => a.events.event_date.localeCompare(b.events.event_date)).slice(0, 8);
        }
      }
    } catch (err) {
      console.warn('Artist popup fetch error:', err.message || err);
    }
  } else {
    allEvents.filter(ev => ev.event_date >= getDateStr(0)).forEach(ev => {
      const act = (ev.event_acts || []).find(a => a.acts && (a.acts.id == actId || a.acts.name === actName));
      if (act) { upcomingEvents.push({ start_time: act.start_time, end_time: act.end_time, events: ev }); instaName = act.acts.insta_name; }
    });
  }
  renderArtistModal(actName, instaName, upcomingEvents, actId);
}
function renderArtistModal(name, instaName, upcomingEvents, actId) {
  const content = document.getElementById('modalContent');
  if (!content) return;
  const numericActId = Number(actId), isFavorite = Number.isFinite(numericActId) && favoriteActIds.has(numericActId);
  const favHtml = Number.isFinite(numericActId)
    ? `<button class="modal-act-favorite${isFavorite ? ' active' : ''}" type="button" data-favorite-act-id="${numericActId}" aria-pressed="${isFavorite}"><span class="modal-act-favorite-label">${isFavorite ? 'Saved' : 'Save'}</span></button>`
    : '';
  const igHtml = instaName
    ? `<a class="modal-ig-link" href="https://instagram.com/${instaName}" target="_blank" rel="noopener"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>@${instaName}</a>`
    : '';
  const rows = upcomingEvents.length
    ? upcomingEvents.map(ea => {
      const ev = ea.events ?? ea, d = formatDateLabel(ev.event_date), start = fmtTime(ea.start_time), end = fmtTime(ea.end_time), slot = start && end ? `${start}-${end}` : start ? `ab ${start}` : null;
      return `<div class="modal-event-row modal-event-row--link" data-event-date="${ev.event_date}" data-event-id="${ev.id}"><div class="modal-event-date"><span class="med">${d.day}</span><span class="mwday">${d.weekday}</span></div><div class="modal-event-info"><div class="modal-event-name">${ev.event_name}</div><div class="modal-event-venue">${ev.clubs?.name ?? '-'}</div></div><div class="modal-event-right">${slot ? `<div class="modal-event-time">${slot}</div>` : ''}<span class="modal-event-goto">-></span></div></div>`;
    }).join('')
    : `<div class="modal-no-events">Keine kommenden Events gefunden</div>`;
  content.innerHTML = `
    <div class="modal-artist-tag">// ARTIST</div>
    <div class="artist-modal-header"><div class="modal-artist-name">${name}</div><div class="modal-head-actions">${favHtml}</div></div>
    <div class="modal-divider"></div>
    ${igHtml}
    <div class="modal-events-label">Kommende Events (${upcomingEvents.length})</div>
    ${rows}
    <div class="modal-scanner"></div>
  `;
}
function closeArtistPopup() {
  const overlay = document.getElementById('artistOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  syncBodyLock();
}
function initArtistPopup() {
  document.getElementById('artistOverlayBg')?.addEventListener('click', closeArtistPopup);
  document.getElementById('modalClose')?.addEventListener('click', closeArtistPopup);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('artistOverlay')?.classList.contains('open')) closeArtistPopup();
  });
  document.getElementById('modalContent')?.addEventListener('click', async e => {
    const fav = e.target.closest('[data-favorite-act-id]');
    if (fav) {
      e.preventDefault();
      const actId = Number(fav.dataset.favoriteActId);
      await toggleFavorite('act', actId, { rerender: false, onChange: () => syncActFavoriteButton(actId) });
      return;
    }
    const row = e.target.closest('.modal-event-row--link');
    if (!row) return;
    closeArtistPopup();
    jumpToEvent(row.dataset.eventDate, row.dataset.eventId);
  });
}
function initSwipe() {
  const main = document.getElementById('mainContent');
  if (!main) return;
  const THRESHOLD = 60, MAX_RESIST = 70;
  let startX = null, startY = null, curX = null, swiping = false;
  const reset = () => { main.style.transition = 'transform 0.25s cubic-bezier(0.25,1,0.5,1), opacity 0.2s'; main.style.transform = ''; main.style.opacity = ''; };
  const out = (dir, cb) => { main.style.transition = 'transform 0.17s cubic-bezier(0.4,0,1,1), opacity 0.17s'; main.style.transform = `translateX(${dir * -110}%) rotate(${dir * -3}deg)`; main.style.opacity = '0'; setTimeout(cb, 170); };
  const inp = dir => { main.style.transition = 'none'; main.style.transform = `translateX(${dir * 75}%) rotate(${dir * 2}deg)`; main.style.opacity = '0'; void main.offsetWidth; main.style.transition = 'transform 0.28s cubic-bezier(0.25,1,0.5,1), opacity 0.22s'; main.style.transform = ''; main.style.opacity = ''; };
  document.addEventListener('touchstart', e => {
    if (document.getElementById('artistOverlay')?.classList.contains('open') || document.getElementById('authOverlay')?.classList.contains('open') || e.target.closest('.date-nav') || e.target.closest('.popular-rail') || e.target.closest('.live-panel')) return;
    startX = e.changedTouches[0].clientX; startY = e.changedTouches[0].clientY; curX = startX; swiping = false;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (startX === null || document.getElementById('artistOverlay')?.classList.contains('open') || document.getElementById('authOverlay')?.classList.contains('open')) return;
    const dx = e.changedTouches[0].clientX - startX, dy = e.changedTouches[0].clientY - startY;
    if (!swiping) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) { startX = null; return; }
      swiping = true;
    }
    if (Math.abs(dx) > 10) e.preventDefault();
    curX = e.changedTouches[0].clientX;
    const grouped = groupByDate(allEvents), atStart = activeDateIdx === 0, atEnd = activeDateIdx >= grouped.length - 1;
    let clamped = dx;
    if ((dx > 0 && atStart) || (dx < 0 && atEnd)) clamped = dx > 0 ? Math.min(dx * 0.18, MAX_RESIST) : Math.max(dx * 0.18, -MAX_RESIST);
    main.style.transition = 'none';
    main.style.transform = `translateX(${clamped}px) rotate(${clamped * 0.012}deg)`;
    main.style.opacity = String(1 - Math.min(Math.abs(clamped) / 280, 0.28));
  }, { passive: false });
  document.addEventListener('touchend', () => {
    if (startX === null || !swiping) { startX = null; return; }
    const dx = curX - startX, grouped = groupByDate(allEvents), canNext = activeDateIdx < grouped.length - 1, canPrev = activeDateIdx > 0;
    if (searchMode) { reset(); startX = null; swiping = false; return; }
    if (dx < -THRESHOLD && canNext) out(-1, () => { activeDateIdx += 1; renderAll(); inp(1); });
    else if (dx > THRESHOLD && canPrev) out(1, () => { activeDateIdx -= 1; renderAll(); inp(-1); });
    else reset();
    startX = null; swiping = false;
  });
}
function loadDemoHypes() {
  const nextMap = new Map();
  visibleEventIds(allEvents).forEach(eventId => nextMap.set(eventId, DEMO_HYPE_TOTALS[eventId] || zeroHype()));
  hypeTotalsByEventId = nextMap;
}
async function loadPublicHypes(events = allEvents) {
  const ids = visibleEventIds(events), nextMap = new Map();
  ids.forEach(id => nextMap.set(id, zeroHype()));
  const publicClient = supabaseAnonClient || supabaseClient;
  if (!publicClient || !ids.length) { hypeTotalsByEventId = nextMap; return; }
  try {
    const { data, error } = await publicClient.from('event_hype_totals').select('event_id,total_hype,real_hype,seed_hype').in('event_id', ids);
    if (error) throw error;
    (data || []).forEach(row => nextMap.set(Number(row.event_id), {
      seed_hype: Number(row.seed_hype) || 0,
      real_hype: Number(row.real_hype) || 0,
      total_hype: Number(row.total_hype) || 0,
    }));
  } catch (err) {
    console.warn('Public hype fetch error:', err.message || err);
  }
  hypeTotalsByEventId = nextMap;
}
async function loadUserCollections(events = allEvents) {
  clearUserCollections();
  if (!supabaseClient || !sessionUser) return;
  const ids = visibleEventIds(events);
  try {
    const { data, error } = await supabaseClient.from('favorites').select('entity_type,entity_id').eq('user_id', sessionUser.id);
    if (error) throw error;
    (data || []).forEach(row => {
      const id = Number(row.entity_id);
      if (!Number.isFinite(id)) return;
      if (row.entity_type === 'event') favoriteEventIds.add(id);
      if (row.entity_type === 'club') favoriteClubIds.add(id);
      if (row.entity_type === 'act') favoriteActIds.add(id);
    });
  } catch (err) {
    console.warn('Favorites fetch error:', err.message || err);
  }
  try {
    let query = supabaseClient.from('event_hypes').select('event_id').eq('user_id', sessionUser.id);
    if (ids.length) query = query.in('event_id', ids);
    const { data, error } = await query;
    if (error) throw error;
    (data || []).forEach(row => { const id = Number(row.event_id); if (Number.isFinite(id)) userHypedEventIds.add(id); });
  } catch (err) {
    console.warn('User hype fetch error:', err.message || err);
  }
  await loadPresence();
}
async function loadFromSupabase() {
  const { data, error } = await (supabaseAnonClient || supabaseClient)
    .from('events')
    .select(`
      id, event_name, event_date, time_start, time_end,
      clubs ( id, name ),
      event_acts ( start_time, end_time, sort_order, acts ( id, name, insta_name ) )
    `)
    .gte('event_date', getDateStr(0))
    .lte('event_date', getDateStr(60))
    .order('event_date');
  if (error) throw error;
  return data || [];
}
async function refreshEventData({ preserveDateNavScroll = false, flashEventId = null } = {}) {
  if (supabaseClient) {
    try {
      allEvents = await loadFromSupabase();
      demoMode = false;
    } catch (err) {
      console.warn('Supabase Fehler, nutze Demo-Daten:', err.message || err);
      allEvents = DEMO_EVENTS;
      demoMode = true;
    }
  } else {
    allEvents = DEMO_EVENTS;
    demoMode = true;
  }
  if (demoMode) loadDemoHypes();
  else await loadPublicHypes(allEvents);
  await loadUserCollections(allEvents);
  rerenderView({ preserveDateNavScroll });
  _dataLoaded = true;
  if (flashEventId) flashEventCard(flashEventId);
}
function subscribeRealtime() {
  if (!supabaseClient || demoMode) return;
  supabaseClient.channel('event_acts_changes').on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'event_acts' },
    async payload => refreshEventData({ preserveDateNavScroll: true, flashEventId: payload.new.event_id })
  ).subscribe();
}
// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2: LIVE MODE
// ═══════════════════════════════════════════════════════════════════════════

function getPresenceEventId() {
  return (userPresence && userPresence.event_id && userPresence.status !== 'left')
    ? Number(userPresence.event_id) : null;
}

function stopLivePolling() {
  if (livePollingId) { clearInterval(livePollingId); livePollingId = null; }
}

function hideLivePanel() {
  const panel = document.getElementById('livePanel');
  if (!panel) return;
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = '';
  document.body.classList.remove('live-mode-active');
}

async function loadPresence() {
  if (!supabaseClient || !sessionUser) { userPresence = null; return; }
  try {
    const { data, error } = await supabaseClient
      .from('user_event_presence')
      .select('user_id, event_id, status')
      .eq('user_id', sessionUser.id)
      .maybeSingle();
    if (error) throw error;
    userPresence = (data && data.event_id && data.status !== 'left') ? data : null;
  } catch (err) {
    console.warn('Presence fetch error:', err.message || err);
    userPresence = null;
  }
  if (userPresence) {
    await fetchLiveData(userPresence.event_id);
    renderLivePanel();
    startLivePolling(userPresence.event_id);
  } else {
    hideLivePanel();
    stopLivePolling();
  }
}

async function upsertPresence(eventId, status) {
  if (!supabaseClient || !sessionUser) return false;
  try {
    const { error } = await supabaseClient.from('user_event_presence').upsert({
      user_id: sessionUser.id,
      event_id: eventId,
      status,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('Presence upsert error:', err.message || err);
    return false;
  }
}

async function deletePresence() {
  if (!supabaseClient || !sessionUser) return;
  try {
    await supabaseClient.from('user_event_presence').delete().eq('user_id', sessionUser.id);
  } catch (err) {
    console.warn('Presence delete error:', err.message || err);
  }
}

async function setPresenceStatus(eventId, nextStatus) {
  if (!ensureAuthenticated('Live Mode')) return;
  if (demoMode) { alert('Live Mode braucht eine echte Supabase-Verbindung.'); return; }

  if (nextStatus === 'left' || nextStatus === null) {
    stopLivePolling();
    userPresence = null;
    liveEventData = { queue: null, buckets: [], mood: null };
    livePanelExpanded = false;
    hideLivePanel();
    rerenderView({ preserveDateNavScroll: true });
    await deletePresence();
    return;
  }

  const ok = await upsertPresence(eventId, nextStatus);
  if (!ok) return;
  userPresence = { user_id: sessionUser.id, event_id: Number(eventId), status: nextStatus };

  await fetchLiveData(eventId);
  renderLivePanel();
  rerenderView({ preserveDateNavScroll: true });

  if (!livePollingId) startLivePolling(eventId);
}

async function submitQueueReport(eventId, level) {
  if (!ensureAuthenticated('Queue Report') || !supabaseClient) return;
  try {
    await supabaseClient.from('queue_reports').insert({ event_id: eventId, user_id: sessionUser.id, level });
    await fetchLiveData(eventId);
    renderLivePanel();
  } catch (err) {
    console.warn('Queue report error:', err.message || err);
  }
}

async function submitMoodVote(eventId, mood) {
  if (!ensureAuthenticated('Mood Vote') || !supabaseClient) return;
  try {
    await supabaseClient.from('mood_votes').insert({ event_id: eventId, user_id: sessionUser.id, mood });
    await fetchLiveData(eventId);
    renderLivePanel();
  } catch (err) {
    console.warn('Mood vote error:', err.message || err);
  }
}

async function fetchLiveData(eventId) {
  if (!supabaseClient || !eventId) return;
  try {
    const [qRes, bRes, mRes] = await Promise.all([
      supabaseClient.from('event_queue_current').select('*').eq('event_id', eventId).maybeSingle(),
      supabaseClient.from('event_queue_buckets').select('*').eq('event_id', eventId).order('bucket_start'),
      supabaseClient.from('event_mood_current').select('*').eq('event_id', eventId).maybeSingle(),
    ]);
    liveEventData = {
      queue: qRes.data || null,
      buckets: bRes.data || [],
      mood: mRes.data || null,
    };
  } catch (err) {
    console.warn('Live data fetch error:', err.message || err);
  }
}

function startLivePolling(eventId) {
  stopLivePolling();
  if (!eventId) return;
  livePollingId = setInterval(async () => {
    await fetchLiveData(eventId);
    renderLivePanel();
  }, 15 * 1000);
}

function renderQueueGraph() {
  const canvas = document.getElementById('liveQueueGraph');
  if (!canvas || !canvas.getContext) return;
  const parent = canvas.parentElement;
  if (parent && parent.clientWidth > 0) canvas.width = parent.clientWidth;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const buckets = liveEventData.buckets || [];

  ctx.clearRect(0, 0, w, h);

  if (!buckets.length) {
    ctx.fillStyle = '#333';
    ctx.font = '9px IBM Plex Mono, monospace';
    ctx.fillText('keine daten', 8, Math.floor(h / 2) + 3);
    return;
  }

  const levelColors = { green: '#3ddc84', yellow: '#ffd60a', red: '#ff2020', hell: '#ff6020' };
  const padT = 4, padB = 4, graphH = h - padT - padB;
  const maxBuckets = 24;
  const barW = Math.max(2, (w / maxBuckets) - 1);

  // grid
  ctx.strokeStyle = '#1e1e1e';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const py = padT + graphH - (i / 3) * graphH;
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
  }

  // bars
  buckets.forEach((b, i) => {
    const x = (i / maxBuckets) * w;
    const val = Math.max(0, Math.min(3, b.level_avg || 0));
    const bh = (val / 3) * graphH;
    ctx.fillStyle = (levelColors[b.bucket_level] || '#444') + '55';
    ctx.fillRect(x, padT + graphH - bh, barW, bh);
  });

  // line
  if (buckets.length > 1) {
    ctx.beginPath();
    ctx.strokeStyle = '#ff2020';
    ctx.lineWidth = 1.5;
    buckets.forEach((b, i) => {
      const x = (i / maxBuckets) * w + barW / 2;
      const val = Math.max(0, Math.min(3, b.level_avg || 0));
      const py = padT + graphH - (val / 3) * graphH;
      if (i === 0) ctx.moveTo(x, py); else ctx.lineTo(x, py);
    });
    ctx.stroke();
  }
}

function renderLivePanel() {
  const panel = document.getElementById('livePanel');
  if (!panel) return;

  const eventId = getPresenceEventId();
  if (!eventId || !userPresence) { hideLivePanel(); return; }

  const ev = allEvents.find(e => Number(e.id) === eventId);
  if (!ev) { hideLivePanel(); return; }

  const status = userPresence.status;
  const statusLabel = status === 'queue' ? 'Warteschlange' : 'Im Club';
  const levelLabels = { green: 'Grün', yellow: 'Gelb', red: 'Rot', hell: 'Hell' };

  const qd = liveEventData.queue;
  const currentLevel = qd?.current_level || null;
  const md = liveEventData.mood;

  // timetable
  const acts = sortActs(ev.event_acts || []);
  const timetableHtml = acts.length
    ? acts.map(a => {
        const s = fmtTime(a.start_time), e2 = fmtTime(a.end_time);
        const t = s && e2 ? `${s}–${e2}` : s ? `ab ${s}` : 'TBA';
        return `<div class="live-act-row"><span class="live-act-name">${a.acts?.name ?? '?'}</span><span class="live-act-time">${t}</span></div>`;
      }).join('')
    : '<span class="time-tba">Keine Acts</span>';

  // queue buttons
  const queueBtns = ['green', 'yellow', 'red', 'hell'].map(l =>
    `<button class="live-level-btn live-level-${l}${currentLevel === l ? ' active' : ''}" data-live-action="queue-report" data-level="${l}" data-event-id="${eventId}">${levelLabels[l]}</button>`
  ).join('');

  // mood buttons
  const moodMap = { euphoric: 'Euphorisch', stable: 'Stabil', flop: 'Flop' };
  const moodPct = { euphoric: md?.euphoric_pct || 0, stable: md?.stable_pct || 0, flop: md?.flop_pct || 0 };
  const moodBtns = ['euphoric', 'stable', 'flop'].map(m =>
    `<button class="live-mood-btn" data-live-action="mood-vote" data-mood="${m}" data-event-id="${eventId}"><span>${moodMap[m]}</span><span class="live-mood-pct">${moodPct[m]}%</span></button>`
  ).join('');

  // hype
  const hype = getHype(ev.id);
  const isHyped = userHypedEventIds.has(Number(ev.id));
  const nextStatusBtn = status === 'queue'
    ? `<button class="event-action-button live-next-btn" data-live-action="next-status" data-event-id="${eventId}">Im Club ↑</button>`
    : '';

  // level chip
  const levelChip = currentLevel
    ? `<span class="live-level-chip live-level-chip-${currentLevel}">${levelLabels[currentLevel]}</span>`
    : `<span class="live-no-data">keine Meldungen</span>`;

  panel.innerHTML = `
    <div class="live-panel-topbar" data-live-action="toggle-expand">
      <span class="live-panel-dot"></span>
      <div class="live-panel-info">
        <span class="live-panel-event-name">${ev.event_name}</span>
        <span class="live-panel-venue">${ev.clubs?.name ?? ''}</span>
      </div>
      <span class="live-status-chip live-status-${status}">${statusLabel}</span>
      <span class="live-panel-chevron">${livePanelExpanded ? '▼' : '▲'}</span>
    </div>
    <div class="live-panel-body" style="display:${livePanelExpanded ? 'block' : 'none'}">
      <div class="live-section">
        <div class="live-section-label">Timetable</div>
        <div class="live-timetable">${timetableHtml}</div>
      </div>
      <div class="live-section">
        <div class="live-section-label">Warteschlange ${levelChip}</div>
        <div class="live-level-buttons">${queueBtns}</div>
        <canvas id="liveQueueGraph" class="live-graph" height="48"></canvas>
      </div>
      <div class="live-section">
        <div class="live-section-label">Stimmung</div>
        <div class="live-mood-buttons">${moodBtns}</div>
      </div>
      <div class="live-panel-actions">
        <button class="event-action-button hype-button${isHyped ? ' active' : ''}" data-live-action="hype" data-event-id="${ev.id}">
          <span class="spark-icon">&#10022;</span><span>Hype</span><span class="hype-count">${hype.total_hype}</span>
        </button>
        ${nextStatusBtn}
        <button class="event-action-button live-leave-btn" data-live-action="leave" data-event-id="${eventId}">Verlassen</button>
      </div>
    </div>
  `;

  panel.setAttribute('aria-hidden', 'false');
  panel.classList.add('open');
  document.body.classList.add('live-mode-active');

  if (livePanelExpanded) setTimeout(renderQueueGraph, 10);
}

function initLivePanel() {
  const panel = document.getElementById('livePanel');
  if (!panel) return;
  panel.addEventListener('click', async e => {
    const target = e.target.closest('[data-live-action]');
    if (!target) return;
    e.stopPropagation();
    const action = target.dataset.liveAction;
    const eventId = Number(target.dataset.eventId || getPresenceEventId());

    if (action === 'toggle-expand') {
      livePanelExpanded = !livePanelExpanded;
      renderLivePanel();
      return;
    }
    if (action === 'queue-report') { await submitQueueReport(eventId, target.dataset.level); return; }
    if (action === 'mood-vote')    { await submitMoodVote(eventId, target.dataset.mood);    return; }
    if (action === 'hype')         { await toggleHype(eventId); renderLivePanel();           return; }
    if (action === 'next-status') {
      const next = userPresence?.status === 'queue' ? 'in_club' : null;
      if (next) await setPresenceStatus(eventId, next);
      return;
    }
    if (action === 'leave') { await setPresenceStatus(eventId, 'left'); return; }
  });
}

// ── helper: build presence button HTML for event card ────────────────────
function buildPresenceBtn(evId) {
  if (!sessionUser || demoMode) return '';
  const eventId = Number(evId);
  const pid = getPresenceEventId();
  if (!pid) {
    return `<button class="event-action-button presence-btn" type="button" data-action="set-presence" data-event-id="${eventId}" data-next-status="queue">Warteschlange</button>`;
  }
  if (pid === eventId) {
    if (userPresence?.status === 'queue') {
      return `<button class="event-action-button presence-btn active" type="button" data-action="set-presence" data-event-id="${eventId}" data-next-status="in_club">Im Club ↑</button>`;
    }
    if (userPresence?.status === 'in_club') {
      return `<button class="event-action-button presence-btn presence-leaving" type="button" data-action="set-presence" data-event-id="${eventId}" data-next-status="left">Verlassen ×</button>`;
    }
  }
  return '';
}

async function init() {
  if (window.componentsReady?.then) await window.componentsReady;
  initAuthUi();
  initSearch();
  initArtistPopup();
  initSwipe();
  initLivePanel();
  bindActionHandlers();
  const hasUrl = !isPlaceholderValue(SUPABASE_URL), hasKey = !isPlaceholderValue(SUPABASE_KEY), legacy = isLegacyJwtKey(SUPABASE_KEY), configured = hasUrl && hasKey && !legacy;
  if (configured) {
    const { createClient } = supabase;
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
    supabaseAnonClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    await hydrateSession();
    subscribeAuthState();
  } else if (legacy) {
    console.warn('Supabase Legacy-Key erkannt. Bitte einen Publishable Key (sb_publishable_...) setzen.');
  }
  await refreshEventData();
  if (supabaseClient && !demoMode) subscribeRealtime();
  setInterval(() => rerenderView({ preserveDateNavScroll: true }), 60 * 1000);
  setInterval(updateStatusBar, 30 * 1000);
}
init();
