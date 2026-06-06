/**
 * home.js - Setradar
 */
const SUPABASE_URL = CONFIG.SUPABASE_URL;
const SUPABASE_KEY = CONFIG.SUPABASE_PUBLISHABLE_KEY || CONFIG.SUPABASE_ANON;
const EventCardUtils = window.SetradarEventCards || {};
const AUTH_MODES = { LOGIN: 'login', SIGNUP: 'signup' };
const DEMO_HYPE_TOTALS = {
  1: { seed_hype: 62, real_hype: 8, total_hype: 70 },
  2: { seed_hype: 31, real_hype: 6, total_hype: 37 },
};
function isPlaceholderValue(v) { return !v || /^DEIN(?:E)?_SUPABASE_/i.test(v); }
function isLegacyJwtKey(v) { return typeof v === 'string' && v.startsWith('eyJ') && v.split('.').length === 3; }
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function safeUrl(url) {
  if (!url) return '';
  const s = String(url).trim();
  return /^https?:\/\//i.test(s) ? escapeHtml(s) : '';
}
function formatLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function parseDateStr(dateStr) {
  if (!dateStr) return null;
  const [year, month, day] = String(dateStr).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}
function getDateStr(daysOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return formatLocalDateKey(d);
}
function shiftDateStr(dateStr, daysOffset = 0) {
  const d = parseDateStr(dateStr);
  if (!d) return null;
  d.setDate(d.getDate() + daysOffset);
  return formatLocalDateKey(d);
}
const DEMO_EVENTS = [
  {
    id: 1,
    event_name: 'Candyflip x Wyldhearts',
    event_date: getDateStr(0),
    time_start: '23:00:00',
    time_end: '09:00:00',
    clubs: { id: 1, name: 'Lokschuppen', cities: { name: 'Berlin' } },
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
    clubs: { id: 2, name: 'Tresor', cities: { name: 'Berlin' } },
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
let userActAvgRatings  = new Map();  // actId → avg rating across all events (1–5)
let collabRecsMap      = new Map();  // actId → collab confidence (0–100)
const clubStatsCache   = new Map();  // clubName → { waitMin, entryRate, fetched }
let queueTimelineByEventId = new Map(); // eventId → [{ ts, avgWait, count }, ...]
let popularEvents = [];
let pendingActionKeys = new Set();
let activeSearch = null;
let authMode = AUTH_MODES.LOGIN;
let demoMode = false;
let _dataLoaded = false;
let _sessionReady = false;
let availableCities = [];
let selectedCity = localStorage.getItem('setradar_city') || 'Berlin';
let eventSortMode = localStorage.getItem('setradar_event_sort') || 'interested';
// ── Phase 2: Live Mode state ─────────────────────────────────────────────
let userPresence = null;          // { user_id, event_id, status } | null
let liveEventData = { queueTimeline: [], mood: null, presenceRows: [], allRatings: [] };
let livePollingId = null;
let livePanelExpanded = false;
let liveGoodbyeEvent = null;   // event after "Club verlassen" — persists until new queue join
let liveGoodbyeScreen = false; // true = show goodbye message; false = show full read-only view
// ── Phase 3: Ratings state ────────────────────────────────────────────────
let ratingState = null;           // { actId, actName, eventId, eventName } | null
let selectedRating = 0;
let userActRatings = new Map();   // key: `${actId}:${eventId}` → rating row
let eventHighlights = new Map();  // event_id → { bestActId, surpriseActId }
let spotlightActs = [];           // artist spotlight cards for last night
let railActiveTab = localStorage.getItem('setradar_rail_tab') || 'spotlight';
let expandedEventIds = new Set(); // event IDs with timetable open
let myQueueStartTime = null;      // Date when current user joined queue
let myClubEntryTime  = null;      // Date when current user entered club
let artistPopupRequestId = 0;
let livePanelRenderSignature = '';

function fmtTime(t) { return t ? String(t).slice(0, 5) : null; }
function formatTimeInput(d) { if (!d) return ''; return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function parseTimeInputToDate(hhmm) { if (!hhmm) return null; const [h,m]=hhmm.split(':').map(Number); const d=new Date(); d.setHours(h,m,0,0); return d; }
function fmtWaitTime(start, end) { const mins=Math.round(((end||new Date())-start)/60000); if(mins<0) return '?'; return mins<60?`${mins}m`:`${Math.floor(mins/60)}h ${mins%60}m`; }
function timeToMinutes(t) { if (!t) return Infinity; const [h, m] = t.split(':').map(Number); const mins = h * 60 + m; return mins < 14 * 60 ? mins + 1440 : mins; }
let queueInfoToastTimer = null;
function showQueueInfoToast(message) {
  let toast = document.getElementById('queueInfoToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'queueInfoToast';
    toast.className = 'queue-info-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(queueInfoToastTimer);
  queueInfoToastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
}
function sortActs(acts) {
  if (EventCardUtils.sortActs) return EventCardUtils.sortActs(acts);
  const withTime = acts.filter(a => a.start_time).sort((a, b) => timeToMinutes(fmtTime(a.start_time)) - timeToMinutes(fmtTime(b.start_time)));
  const withoutTime = acts.filter(a => !a.start_time).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return [...withTime, ...withoutTime];
}

function getUserActAvg(actId) {
  if (!actId || !userActRatings.size) return null;
  const ratings = [];
  for (const [key, r] of userActRatings.entries()) {
    if (key.startsWith(`${actId}:`) && r.rating) ratings.push(r.rating);
  }
  return ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
}

function buildActLeftHtml(actId) {
  if (!actId) return `<span class="artist-act-avg empty"></span>`;
  if (!sessionUser) return `<span class="artist-act-avg empty"></span>`;
  const avg = getUserActAvg(actId);
  return avg !== null
    ? `<span class="artist-act-avg rated">${avg.toFixed(1)}</span>`
    : `<span class="artist-act-avg empty">—</span>`;
}
function formatDateLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return {
    day: String(d.getDate()).padStart(2, '0'),
    month: String(d.getMonth() + 1).padStart(2, '0'),
    monthShort: t('date.months_short')[d.getMonth()],
    weekday: t('date.weekdays_short')[d.getDay()].toUpperCase(),
  };
}
function formatTabLabel(dateStr) {
  const today = getDateStr(0), yesterday = getDateStr(-1), twoDaysAgo = getDateStr(-2), tomorrow = getDateStr(1), d = new Date(`${dateStr}T00:00:00`);
  if (dateStr === today) return t('date.today');
  if (dateStr === yesterday) return t('date.yesterday');
  if (dateStr === twoDaysAgo) return t('date.two_days_ago');
  if (dateStr === tomorrow) return t('date.tomorrow');
  const w = t('date.weekdays_short');
  return `${w[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
}
function getEventCity(ev) {
  return normalizeCityName(ev?.clubs?.cities?.name);
}
function getEventTimeDate(dateStr, timeStr) {
  const base = parseDateStr(dateStr);
  if (!base || !timeStr) return null;
  const [hours, minutes] = timeStr.slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  base.setHours(hours, minutes, 0, 0);
  if (hours < 14) base.setDate(base.getDate() + 1);
  return base;
}
function getEventStartDateTime(ev) {
  if (!ev?.event_date) return null;
  if (ev.time_start) return getEventTimeDate(ev.event_date, fmtTime(ev.time_start));
  return parseDateStr(ev.event_date);
}
function getEventEndDateTime(ev) {
  if (!ev?.event_date) return null;
  if (ev.time_end) return getEventTimeDate(ev.event_date, fmtTime(ev.time_end));
  return getEventStartDateTime(ev);
}
function isEventRunningNow(ev, now = new Date()) {
  const start = getEventStartDateTime(ev);
  const end = getEventEndDateTime(ev);
  if (!start || !end) return false;
  return now >= start && now <= end;
}
function isUpcomingOrRunningEvent(ev, now = new Date()) {
  const end = getEventEndDateTime(ev);
  if (end) return end >= now;
  return !!ev?.event_date && ev.event_date >= getDateStr(0);
}
function getBucketDatesForEvent(ev, now = new Date()) {
  const dates = [];
  if (ev?.event_date) dates.push(ev.event_date);
  const today = formatLocalDateKey(now);
  if (isEventRunningNow(ev, now) && today !== ev?.event_date && !dates.includes(today)) {
    dates.push(today);
  }
  return dates;
}
function getEventsForDateBucket(dateStr, events = allEvents, now = new Date()) {
  return (events || []).filter(ev => getBucketDatesForEvent(ev, now).includes(dateStr));
}
function getDefaultDateIndex(grouped) {
  if (!grouped.length) return 0;
  const today = getDateStr(0);
  const todayIndex = grouped.findIndex(([dateStr]) => dateStr === today);
  if (todayIndex !== -1) return todayIndex;
  const nextIndex = grouped.findIndex(([dateStr]) => dateStr >= today);
  return nextIndex !== -1 ? nextIndex : Math.max(0, grouped.length - 1);
}
function groupByDate(events) {
  const map = {};
  const now = new Date();
  events.forEach(ev => {
    getBucketDatesForEvent(ev, now).forEach(dateStr => {
      if (!map[dateStr]) map[dateStr] = [];
      if (!map[dateStr].some(item => Number(item.id) === Number(ev.id))) map[dateStr].push(ev);
    });
  });
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
  userActRatings = new Map();
}
function favoriteSet(type) {
  if (type === 'event') return favoriteEventIds;
  if (type === 'club') return favoriteClubIds;
  if (type === 'act') return favoriteActIds;
  return null;
}
function userLabel() {
  if (!sessionUser) return t('user.guest');
  return userProfile?.display_name || sessionUser.user_metadata?.name || sessionUser.email || t('user.logged_in');
}
function normalizeCityName(value) {
  return String(value || '').trim();
}
function resolveSelectedCity(cities = availableCities) {
  const normalized = cities.map(normalizeCityName).filter(Boolean);
  if (!normalized.length) {
    selectedCity = normalizeCityName(selectedCity) || 'Berlin';
    return selectedCity;
  }
  const current = normalized.find(city => city.localeCompare(selectedCity, 'de', { sensitivity: 'base' }) === 0);
  selectedCity = current || normalized[0];
  localStorage.setItem('setradar_city', selectedCity);
  return selectedCity;
}
function getVisibleEvents(events = allEvents) {
  const city = normalizeCityName(selectedCity);
  if (!city) return [...(events || [])];
  return (events || []).filter(ev => getEventCity(ev) === city);
}
function syncCitySelectorUi() {
  if (!window.SetradarCitySelector) return;
  window.SetradarCitySelector.setOptions(availableCities);
  window.SetradarCitySelector.setCurrentCity(resolveSelectedCity(), { emit: false });
}
function applySelectedCity(nextCity) {
  const normalized = normalizeCityName(nextCity);
  if (!normalized) return;
  if (normalized.localeCompare(selectedCity, 'de', { sensitivity: 'base' }) === 0) return;
  selectedCity = normalized;
  localStorage.setItem('setradar_city', selectedCity);
  activeDateIdx = 0;
  searchMode = false;
  activeSearch = null;
  clearSearch({ rerender: false });
  rerenderView({ preserveDateNavScroll: false });
  loadActSpotlight().then(() => { buildPopularEvents(); renderPopularEvents(); });
}
function updateStatusBar() {
  const bar = document.getElementById('statusBar');
  if (!bar) return;
  const visibleEvents = getVisibleEvents();
  const count = getEventsForDateBucket(getDateStr(0), visibleEvents).length;
  const locale = window.LANG === 'de' ? 'de-DE' : 'en-GB';
  const time = new Date().toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const todayLabel = t('date.today').toLowerCase();
  bar.innerHTML = `
    <div class="status-bar-left"><span class="status-live-dot"></span><span>${escapeHtml(selectedCity)} - ${count} Event${count !== 1 ? 's' : ''} ${todayLabel}</span></div>
    <div class="status-bar-right">${time}</div>
  `;
}
function setLastUpdated() {
  const el = document.getElementById('lastUpdated');
  if (el) el.textContent = t('status.updated') + ' ' + new Date().toLocaleTimeString(window.LANG === 'de' ? 'de-DE' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
}
function refreshAmbientUi() {
  updateStatusBar();
  setLastUpdated();
}
function syncBodyLock() {
  const artistOpen = document.getElementById('artistOverlay')?.classList.contains('open');
  const authOpen = document.getElementById('authOverlay')?.classList.contains('open');
  const ratingOpen = document.getElementById('ratingOverlay')?.classList.contains('open');
  document.body.style.overflow = artistOpen || authOpen || ratingOpen ? 'hidden' : '';
}
function getMinutesUntil(startTimeStr, eventDateStr) {
  if (!startTimeStr || !eventDateStr) return null;
  const now = new Date();
  const setTime = getEventTimeDate(eventDateStr, startTimeStr);
  if (!setTime) return null;
  const diffMin = Math.round((setTime - now) / 60000);
  return diffMin < 0 ? null : diffMin;
}
function fmtCountdown(mins) { if (mins < 60) return `in ${mins}min`; const h = Math.floor(mins / 60), m = mins % 60; return `in ${h}:${String(m).padStart(2, '0')}h`; }
function getNextActIds(events) {
  const upcoming = [];
  getEventsForDateBucket(getDateStr(0), events).forEach(ev => {
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
function loadPersonalScoreData() {
  // Per-act average from all user ratings (across different events)
  const actsSum = new Map(), actsCnt = new Map();
  for (const r of userActRatings.values()) {
    if (!r.act_id || !r.rating) continue;
    const id = Number(r.act_id);
    actsSum.set(id, (actsSum.get(id) || 0) + r.rating);
    actsCnt.set(id, (actsCnt.get(id) || 0) + 1);
  }
  userActAvgRatings = new Map();
  actsSum.forEach((sum, id) => userActAvgRatings.set(id, sum / actsCnt.get(id)));

  // Full collab act score map from localStorage (computed on profile page).
  // Contains ALL unrated acts from similar users (0–10 predicted score),
  // not just the top-15 recommendations — so bad acts pull event scores down too.
  collabRecsMap = new Map();
  if (sessionUser) {
    try {
      const raw = localStorage.getItem(`sr_recs_${sessionUser.id}`);
      if (raw) {
        const { actScores } = JSON.parse(raw);
        if (actScores) {
          Object.entries(actScores).forEach(([id, score]) =>
            collabRecsMap.set(Number(id), score)
          );
        }
      }
    } catch {}
  }
}

function getEventScore(ev) {
  if (!sessionUser) return null;
  const acts = (ev.event_acts || []).filter(a => a.acts?.id && !a.canceled);
  if (!acts.length) return null;

  let weightedSum = 0, totalWeight = 0;
  for (const a of acts) {
    const actId = Number(a.acts.id);
    const myRating = userActAvgRatings.get(actId);
    if (myRating != null) {
      // Own rating: 1–5 → 2–10, weight 2 (trusted data)
      weightedSum += (myRating * 2) * 2;
      totalWeight += 2;
    } else {
      const collabScore = collabRecsMap.get(actId); // already 0–10
      if (collabScore != null) {
        // Collab prediction, weight 1 (less trusted than own ratings)
        weightedSum += collabScore * 1;
        totalWeight += 1;
      }
    }
  }
  if (!totalWeight) return null;
  return Math.round((weightedSum / totalWeight) * 10) / 10;
}

function buildEventScoreBadge(ev) {
  if (!sessionUser) return '';
  const score = getEventScore(ev);
  if (score === null) {
    return `<button class="event-score-badge event-score-badge--unknown" type="button" data-action="score-info">?</button>`;
  }
  return `<button class="event-score-badge" type="button" data-action="score-info"><span class="esb-value">${score.toFixed(1)}</span><span class="esb-denom">/10</span></button>`;
}
function priorityBucket(ev) {
  if (userHypedEventIds.has(Number(ev.id))) return 0;
  return 1;
}
function sortForDay(events) {
  return [...events].sort((a, b) => {
    if (eventSortMode === 'time') return compareSchedule(a, b);
    if (eventSortMode === 'score') {
      const scoreDiff = getEventScore(b) - getEventScore(a);
      if (scoreDiff) return scoreDiff;
      return compareSchedule(a, b);
    }
    const bucketDiff = priorityBucket(a) - priorityBucket(b);
    if (bucketDiff) return bucketDiff;
    const hypeDiff = getHype(b.id).total_hype - getHype(a.id).total_hype;
    if (hypeDiff) return hypeDiff;
    return compareSchedule(a, b);
  });
}
function syncSortUi() {
  document.querySelectorAll('.event-sort-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sortMode === eventSortMode);
  });
}
function initSortControls() {
  const bar = document.getElementById('eventSortBar');
  if (!bar) return;
  syncSortUi();
  bar.addEventListener('click', e => {
    const btn = e.target.closest('.event-sort-btn');
    if (!btn) return;
    const nextMode = btn.dataset.sortMode || 'interested';
    if (nextMode === eventSortMode) return;
    eventSortMode = nextMode;
    localStorage.setItem('setradar_event_sort', eventSortMode);
    syncSortUi();
    rerenderView({ preserveDateNavScroll: true });
  });
}
function buildPopularEvents() {
  const today = getDateStr(0), maxDate = getDateStr(14);
  const candidates = getVisibleEvents().filter(ev => ev.event_date >= today && ev.event_date <= maxDate);
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
function getAuthRedirectUrl() {
  const url = new URL(window.location.href);
  url.hash = '';
  url.search = '';
  return url.toString();
}
function updateGoogleButtonLabel() {
  const label = document.getElementById('authGoogleBtnLabel');
  if (!label) return;
  label.textContent = authMode === AUTH_MODES.SIGNUP ? t('auth.google_signup') : t('auth.google_login');
}
function updateAppleButtonLabel() {
  const label = document.getElementById('authAppleBtnLabel');
  if (!label) return;
  label.textContent = authMode === AUTH_MODES.SIGNUP ? t('auth.apple_signup') : t('auth.apple_login');
}
function setAuthBusy(isBusy) {
  ['authSubmit', 'authGoogleBtn', 'authAppleBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = isBusy;
  });
}
async function ensureUserProfile() {
  if (!supabaseClient || !sessionUser) return null;
  if (userProfile?.user_id === sessionUser.id) return userProfile;
  const fallbackName = sessionUser.user_metadata?.name || sessionUser.user_metadata?.full_name || sessionUser.email || 'User';
  try {
    const { data, error } = await supabaseClient
      .from('profiles')
      .upsert({ user_id: sessionUser.id, display_name: fallbackName }, { onConflict: 'user_id' })
      .select('user_id, display_name, avatar_url')
      .maybeSingle();
    if (error) throw error;
    userProfile = data || userProfile;
    return userProfile;
  } catch (err) {
    console.warn('Profile ensure error:', err.message || err);
    return userProfile;
  }
}
function cleanupAuthReturnUrl() {
  const url = new URL(window.location.href);
  let changed = false;
  ['code', 'state', 'error', 'error_code', 'error_description'].forEach(key => {
    if (!url.searchParams.has(key)) return;
    url.searchParams.delete(key);
    changed = true;
  });
  if (url.hash) {
    const hashParams = new URLSearchParams(url.hash.slice(1));
    const authKeys = ['access_token', 'refresh_token', 'expires_at', 'expires_in', 'token_type', 'type', 'provider_token', 'provider_refresh_token'];
    if (authKeys.some(key => hashParams.has(key))) {
      url.hash = '';
      changed = true;
    }
  }
  if (changed) window.history.replaceState({}, document.title, url.toString());
}
function setAuthMode(mode) {
  authMode = mode === AUTH_MODES.SIGNUP ? AUTH_MODES.SIGNUP : AUTH_MODES.LOGIN;
  document.getElementById('authModeLogin')?.classList.toggle('active', authMode === AUTH_MODES.LOGIN);
  document.getElementById('authModeSignup')?.classList.toggle('active', authMode === AUTH_MODES.SIGNUP);
  document.getElementById('authDisplayNameRow')?.classList.toggle('visible', authMode === AUTH_MODES.SIGNUP);
  const password = document.getElementById('authPassword');
  if (password) password.autocomplete = authMode === AUTH_MODES.SIGNUP ? 'new-password' : 'current-password';
  const submit = document.getElementById('authSubmit');
  if (submit) submit.textContent = authMode === AUTH_MODES.SIGNUP ? t('auth.signup') : t('auth.login');
  updateGoogleButtonLabel();
  updateAppleButtonLabel();
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
  if (user) {
    user.textContent = userLabel();
    if (sessionUser) {
      user.setAttribute('href', 'profile.html');
      user.style.cursor = 'pointer';
      user.title = t('profile.eyebrow').replace('//', '').trim();
    } else {
      user.removeAttribute('href');
      user.style.cursor = 'pointer';
      user.title = t('nav.login');
    }
  }
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
  if (!supabaseClient) { sessionUser = null; userProfile = null; revealNavbar(); return; }
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    sessionUser = data.session?.user || null;
  } catch (err) {
    console.warn('Auth session error:', err.message || err);
    sessionUser = null;
  }
  if (sessionUser) {
    await fetchUserProfile();
    await ensureUserProfile();
    cleanupAuthReturnUrl();
  } else userProfile = null;
  revealNavbar();
}
function revealNavbar() {
  _sessionReady = true;
  const el = document.getElementById('navbarRight');
  if (el) el.style.visibility = '';
  updateAuthUi();
}
function ensureAuthenticated(label = 'This action') {
  if (sessionUser) return true;
  if (!_sessionReady) return false;
  openAuthModal(AUTH_MODES.LOGIN, `${label} requires login.`);
  return false;
}
async function onAuthSubmit(event) {
  event.preventDefault();
  if (!supabaseClient) { setAuthMessage('Supabase is unavailable.', 'error'); return; }
  const email = document.getElementById('authEmail')?.value.trim();
  const password = document.getElementById('authPassword')?.value || '';
  const displayName = document.getElementById('authDisplayName')?.value.trim();
  if (!email || !password) { setAuthMessage('Email and password are required.', 'error'); return; }
  setAuthBusy(true);
  setAuthMessage(authMode === AUTH_MODES.SIGNUP ? 'Creating account...' : 'Logging in...');
  try {
    if (authMode === AUTH_MODES.SIGNUP) {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: { name: displayName || email },
          emailRedirectTo: getAuthRedirectUrl(),
        },
      });
      if (error) throw error;
      if (data.session?.user) {
        sessionUser = data.session.user;
        await ensureUserProfile();
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
    setAuthMessage(err.message || 'Auth error.', 'error');
  } finally {
    setAuthBusy(false);
  }
}
async function onGoogleAuth() {
  if (!supabaseClient) { setAuthMessage('Supabase is unavailable.', 'error'); return; }
  setAuthBusy(true);
  setAuthMessage(authMode === AUTH_MODES.SIGNUP ? 'Google-Registrierung startet...' : 'Google-Login startet...');
  try {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getAuthRedirectUrl(),
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    });
    if (error) throw error;
  } catch (err) {
    setAuthBusy(false);
    setAuthMessage(err.message || 'Google login failed.', 'error');
  }
}
async function onAppleAuth() {
  if (!supabaseClient) { setAuthMessage('Supabase is unavailable.', 'error'); return; }
  setAuthBusy(true);
  setAuthMessage(authMode === AUTH_MODES.SIGNUP ? t('auth.apple_signup') + '...' : t('auth.apple_login') + '...');
  try {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: getAuthRedirectUrl(),
      },
    });
    if (error) throw error;
  } catch (err) {
    setAuthBusy(false);
    setAuthMessage(err.message || 'Apple login failed.', 'error');
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
  liveEventData = { queueStats: null, mood: null, presenceRows: [], allRatings: [] };
  livePanelExpanded = false;
  rerenderView({ preserveDateNavScroll: true });
  supabaseClient.auth.signOut().catch(err => console.warn('Logout error:', err.message || err));
}
function initAuthUi() {
  window.addEventListener('pageshow', e => {
    if (e.persisted) setAuthBusy(false);
  });
  document.getElementById('authOverlayBg')?.addEventListener('click', closeAuthModal);
  document.getElementById('authModalClose')?.addEventListener('click', closeAuthModal);
  document.getElementById('authModeLogin')?.addEventListener('click', () => setAuthMode(AUTH_MODES.LOGIN));
  document.getElementById('authModeSignup')?.addEventListener('click', () => setAuthMode(AUTH_MODES.SIGNUP));
  document.getElementById('authForm')?.addEventListener('submit', onAuthSubmit);
  document.getElementById('authGoogleBtn')?.addEventListener('click', onGoogleAuth);
  document.getElementById('authAppleBtn')?.addEventListener('click', onAppleAuth);
  document.getElementById('navUserState')?.addEventListener('click', e => {
    if (!sessionUser) { e.preventDefault(); openAuthModal(AUTH_MODES.LOGIN); }
  });
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
    if (_event === 'INITIAL_SESSION') return;
    sessionUser = session?.user || null;
    if (sessionUser) {
      await fetchUserProfile();
      await ensureUserProfile();
      cleanupAuthReturnUrl();
      closeAuthModal();
    }
    else {
      userProfile = null;
      clearUserCollections();
      stopLivePolling();
      hideLivePanel();
      liveEventData = { queueStats: null, mood: null, presenceRows: [], allRatings: [] };
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
  const prev = active.previousElementSibling;
  const targetLeft = prev
    ? Math.max(0, prev.offsetLeft - pad)
    : Math.max(0, active.offsetLeft - pad);
  nav.scrollTo({ left: targetLeft, behavior: smooth ? 'smooth' : 'auto' });
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
      renderAll({ preserveDateNavScroll: true });
    };
    nav.appendChild(btn);
  });
  if (syncToActive) syncDateNav({ smooth: smoothSync });
}
function truncateWords(text, max = 5) {
  const words = String(text || '').trim().split(/\s+/);
  return words.length <= max ? text : words.slice(0, max).join(' ') + '…';
}
function spotlightNameFontSize(name) {
  const len = (name || '').length;
  if (len <= 7)  return '22px';
  if (len <= 11) return '18px';
  if (len <= 15) return '14px';
  if (len <= 22) return '11px';
  return '9px';
}
function computeEventSpotlights(acts, allRatings) {
  if (!allRatings?.length) return null;
  const byAct = {};
  allRatings.forEach(r => {
    if (!byAct[r.act_id]) byAct[r.act_id] = { sum: 0, count: 0, surprises: 0 };
    if (r.rating && r.rating > 0) { byAct[r.act_id].sum += r.rating; byAct[r.act_id].count++; }
    if (r.was_surprise) byAct[r.act_id].surprises++;
  });
  const C = 5, PRIOR = 3.5;
  // act_id fehlt in der Event-Query → acts.id verwenden
  const enriched = (acts || [])
    .filter(a => !a.canceled && a.acts?.id && byAct[a.acts.id] && (byAct[a.acts.id].count >= 1 || byAct[a.acts.id].surprises >= 1))
    .map(a => {
      const d = byAct[a.acts.id];
      const avg = d.count > 0 ? d.sum / d.count : 0;
      const score = d.count > 0 ? (d.count / (d.count + C)) * avg + (C / (d.count + C)) * PRIOR : 0;
      return { ...a, avgRating: avg, score, surprises: d.surprises, voteCount: d.count };
    });
  if (!enriched.length) return null;
  const assigned = new Set();
  const surpriseSorted = [...enriched].sort((a, b) => b.surprises - a.surprises || b.voteCount - a.voteCount);
  const surprise = surpriseSorted[0]?.surprises >= 1 ? surpriseSorted[0] : null;
  if (surprise) assigned.add(surprise.acts.id);
  const best = [...enriched].filter(a => !assigned.has(a.acts.id) && a.voteCount >= 1).sort((a, b) => b.score - a.score)[0] || null;
  if (best) assigned.add(best.acts.id);
  const hiddenGem = [...enriched]
    .filter(a => !assigned.has(a.acts.id) && a.avgRating > 4.0 && a.voteCount >= 10 && a.voteCount <= 50)
    .sort((a, b) => b.avgRating - a.avgRating)[0] || null;
  return { best, surprise, hiddenGem };
}
function renderEventSpotlightCards(spotlights) {
  if (!spotlights) return '';
  const items = [
    [t('spotlight.best'), spotlights.best, 'best'],
    [t('spotlight.surprise'), spotlights.surprise, 'surprise'],
    [t('spotlight.gem'), spotlights.hiddenGem, 'gem'],
  ];
  return `<div class="pem-spotlights">${items.map(([label, act, type]) => {
    if (!act) {
      return `<div class="pem-spot-card pem-spot-card--${type} pem-spot-empty">
        <div class="pem-spot-label">${label}</div>
        <div class="pem-spot-name">${t('empty.no_trend')}</div>
      </div>`;
    }
    const name = act.acts?.name || '—';
    const avg = act.avgRating ? act.avgRating.toFixed(1) : '';
    return `<div class="pem-spot-card pem-spot-card--${type}">
      <div class="pem-spot-label">${label}</div>
      <div class="pem-spot-name">${name}</div>
      ${avg ? `<div class="pem-spot-rating">${avg} ★</div>` : ''}
    </div>`;
  }).join('')}</div>`;
}
function buildLivePanelSignature(ev, status, hypeTotal) {
  return JSON.stringify({
    eventId: Number(ev?.id) || null,
    status,
    expanded: !!livePanelExpanded,
    queue: myQueueStartTime?.toISOString?.() || '',
    club: myClubEntryTime?.toISOString?.() || '',
    hype: hypeTotal,
  });
}
function renderSpotlightPanel() {
  if (!spotlightActs.length) {
    return `<div class="rail-empty">${t('empty.no_trend')}</div>`;
  }
  return `<div class="popular-rail-list spotlight-list">${spotlightActs.map(act => {
    const stars = act.avg_rating ? Math.round(act.avg_rating) : 0;
    const starsHtml = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    return `
      <button class="spotlight-item spotlight-item--${act.type === 'surprise' ? 'surprise' : act.type === 'best' ? 'best' : 'gem'}"
              type="button" data-spotlight-act-id="${act.actId}" data-spotlight-act-name="${act.actName}">
        <div class="spotlight-label">${act.type === 'best' ? t('spotlight.best') : act.type === 'surprise' ? t('spotlight.surprise') : t('spotlight.gem')}</div>
        <div class="spotlight-name" style="font-size:${spotlightNameFontSize(act.actName)}">${act.actName}</div>
        <div class="spotlight-stars">${starsHtml}</div>
        <div class="spotlight-meta">${act.clubName || ''}</div>
      </button>`;
  }).join('')}</div>`;
}
function renderEventsPanel() {
  if (!popularEvents.length) return `<div class="rail-empty">${t('empty.no_events')}</div>`;
  const fallback = popularEvents.every(item => item.fallback);
  return `<div class="popular-rail-list">${popularEvents.map(item => {
    const ev = item.event, d = formatDateLabel(ev.event_date);
    return `
      <button class="popular-item" type="button" data-popular-event-id="${ev.id}" data-popular-event-date="${ev.event_date}">
        <div class="popular-item-date">${d.weekday} ${d.day}.${d.month}</div>
        <div class="popular-item-name">${truncateWords(ev.event_name)}</div>
        <div class="popular-item-meta">
          <span>${ev.clubs?.name || '-'}</span>
          <span class="popular-item-hype">${fallback ? t('empty.no_trend') : `<span class="popular-item-hype-count">${item.hype.total_hype}</span><span class="popular-item-hype-icon" aria-hidden="true">◔</span>`}</span>
        </div>
      </button>`;
  }).join('')}</div>`;
}
function renderPopularEvents() {
  const rail = document.getElementById('popularRail');
  if (!rail) return;
  const hasSpotlight = spotlightActs.length > 0;
  const hasEvents = popularEvents.length > 0;
  if (!hasSpotlight && !hasEvents) { rail.innerHTML = ''; return; }
  let activeTab = railActiveTab;
  if (activeTab === 'spotlight' && !hasSpotlight && hasEvents) activeTab = 'events';
  if (activeTab === 'events' && !hasEvents && hasSpotlight) activeTab = 'spotlight';
  const fallback = popularEvents.every(item => item.fallback);
  rail.innerHTML = `
    <div class="popular-rail-shell">
      <div class="popular-rail-header">
        <div class="rail-tabs">
          <button class="rail-tab${activeTab === 'spotlight' ? ' active' : ''}" type="button" data-rail-tab="spotlight">Artist Spotlight</button>
          <button class="rail-tab${activeTab === 'events' ? ' active' : ''}" type="button" data-rail-tab="events">Popular Events</button>
        </div>
        <span class="popular-rail-subtitle">${activeTab === 'spotlight' ? t('spotlight.last_night') : (fallback ? t('empty.no_trend') : t('spotlight.trending'))}</span>
      </div>
      ${activeTab === 'spotlight' ? renderSpotlightPanel() : renderEventsPanel()}
    </div>
  `;
}
function renderEventCard(ev, nextActKeys) {
  const acts = sortActs(ev.event_acts || []);
  const hasTime = acts.some(a => a.start_time);
  const venue = ev.clubs?.name ?? '-';
  const city = getEventCity(ev);
  const doors = fmtTime(ev.time_start);
  const close = fmtTime(ev.time_end);
  const hype = getHype(ev.id);
  const isHyped = userHypedEventIds.has(Number(ev.id));
  const isOpen = expandedEventIds.has(Number(ev.id));
  const isClubFavorite = ev.clubs?.id ? favoriteClubIds.has(Number(ev.clubs.id)) : false;
  const venueHtml = ev.clubs?.id
    ? `<span class="venue-name-group"><span class="venue-tag">${escapeHtml(venue)}</span><button class="club-follow-btn${isClubFavorite ? ' active' : ''}" type="button" data-action="toggle-favorite-club" data-club-id="${ev.clubs.id}" aria-pressed="${isClubFavorite}">${isClubFavorite ? '−' : '+'}</button></span>`
    : `<span class="venue-tag">${escapeHtml(venue)}</span>`;
  const hl = eventHighlights.get(Number(ev.id));
  const artistRows = acts.map(a => {
    const start = fmtTime(a.start_time), end = fmtTime(a.end_time), label = start && end ? `${start} - ${end}` : start ? t('act.from', { time: start }) : null;
    const actKey = `${ev.id}_${a.sort_order}`;
    const mins = nextActKeys.includes(actKey) ? getMinutesUntil(start, ev.event_date) : null;
    const countdown = mins !== null ? fmtCountdown(mins) : null;
    const actId = a.acts?.id ?? null;
    const numActId = actId ? Number(actId) : null;
    const isActFavorite = numActId ? favoriteActIds.has(numActId) : false;
    const isBestAct = numActId && hl?.bestActId === numActId;
    const isSurprise = numActId && hl?.surpriseActId === numActId;
    const isHiddenGem = numActId && hl?.hiddenGemActId === numActId;
    const actFollowBtn = actId
      ? `<button class="act-follow-btn${isActFavorite ? ' active' : ''}" type="button" data-action="toggle-favorite-act" data-act-id="${actId}" aria-pressed="${isActFavorite}">${isActFavorite ? '♥' : '♡'}</button>`
      : '';
    const existingEvRating = actId && sessionUser ? userActRatings.get(`${actId}:${ev.id}`) : null;
    const eventHasStarted = (() => { const s = getEventStartDateTime(ev); return s ? new Date() >= s : ev.event_date <= getDateStr(0); })();
    const actRateBtn = actId && sessionUser && eventHasStarted
      ? existingEvRating
        ? `<button class="act-rate-btn act-rate-btn--rated" type="button" data-action="open-rating" data-act-id="${actId}" data-act-name="${escapeHtml(a.acts?.name ?? '?')}" data-event-id="${ev.id}" data-event-name="${escapeHtml(ev.event_name)}" title="${t('act.rate_change')}">${'★'.repeat(existingEvRating.rating)}${'☆'.repeat(5 - existingEvRating.rating)}</button>`
        : `<button class="act-rate-btn" type="button" data-action="open-rating" data-act-id="${actId}" data-act-name="${escapeHtml(a.acts?.name ?? '?')}" data-event-id="${ev.id}" data-event-name="${escapeHtml(ev.event_name)}" title="${t('act.rate')}">☆☆☆☆☆</button>`
      : '';
    const flairs = [
      isBestAct    ? `<span class="act-flair act-flair--best">${t('act.best')}</span>` : '',
      isSurprise   ? `<span class="act-flair act-flair--surprise">${t('act.surprise')}</span>` : '',
      isHiddenGem  ? `<span class="act-flair act-flair--gem">${t('act.gem')}</span>` : '',
    ].filter(Boolean).join('');
    return `
      <div class="artist-row ${start ? 'has-time' : ''}${isActFavorite ? ' artist-row--followed' : ''}">
        <span class="artist-row-left">
          ${buildActLeftHtml(actId)}
          ${actFollowBtn}
        </span>
        <span class="artist-name">
          <span class="artist-name-link" ${actId ? `data-act-id="${actId}"` : ''} data-act-name="${escapeHtml(a.acts?.name ?? '?')}">${escapeHtml(a.acts?.name ?? '?')}</span>
          ${flairs ? `<span class="artist-flairs">${flairs}</span>` : ''}
        </span>
        <span class="artist-row-right">
          ${actRateBtn}
          ${countdown ? `<span class="countdown ${mins < 30 ? 'soon' : ''}">${countdown}</span>` : ''}
          ${a.canceled ? `<span class="artist-time canceled">${t('act.canceled')}</span>` : label ? `<span class="artist-time confirmed">${label}</span>` : `<span class="time-tba">${t('live.tba')}</span>`}
        </span>
      </div>
    `;
  }).join('');
  return `
    <div class="event-card${isOpen ? ' open' : ''}" data-event-id="${ev.id}">
      <div class="card-header" data-action="toggle-timetable" data-event-id="${ev.id}">
        <div class="event-heading">
          <div class="event-name">${escapeHtml(ev.event_name)}</div>
          ${city ? `<div class="event-city-emphasis">${escapeHtml(city)}</div>` : ''}
          ${buildEventScoreBadge(ev)}
        </div>
        <div class="event-meta">
          ${venueHtml}
          ${doors ? `<span class="doors-time">↳ ${doors}${close ? ' - ' + close : ''}</span>` : ''}
          <span class="status-badge ${hasTime ? 'confirmed' : 'pending'}"><span class="status-dot"></span>${hasTime ? t('status.timetable') : t('status.lineup')}</span>
          <span class="card-chevron">${isOpen ? '▾' : '▸'}</span>
        </div>
      </div>
      <div class="event-actions">
        <div class="event-actions-left">
          <button class="event-action-button hype-button${isHyped ? ' active' : ''}" type="button" data-action="toggle-hype" data-event-id="${ev.id}" aria-pressed="${isHyped}">
            <span class="spark-icon">&#10022;</span><span>${t('sort.interested')}</span><span class="hype-count">${hype.total_hype}</span>
          </button>
        </div>
        <div class="event-actions-right">${buildPresenceBtn(ev.id)}</div>
      </div>
      <div class="artist-list">${artistRows ? `<div class="lineup-header"><span class="lineup-header-left"><span class="lh-avg lh-label">Ø</span><span class="lh-follow lh-label">♡</span></span><span class="lineup-header-mid lh-label">${t('misc.artist')}</span><span class="lineup-header-right"><span class="lh-label">${t('act.rate')}</span><span class="lh-label">${t('misc.time')}</span></span></div>` : ''}${artistRows || `<span class="time-tba">${t('misc.no_info')}</span>`}${buildQueueChartRow(ev.id)}</div>
    </div>
  `;
}
function renderAll({ preserveDateNavScroll = false, syncDateNavToActive = !preserveDateNavScroll } = {}) {
  if (searchMode && activeSearch) { rerenderSearch(); return; }
  const visibleEvents = getVisibleEvents();
  const grouped = groupByDate(visibleEvents), nextActKeys = getNextActIds(visibleEvents), main = document.getElementById('mainContent');
  if (!main) return;
  if (!preserveDateNavScroll) activeDateIdx = getDefaultDateIndex(grouped);
  activeDateIdx = grouped.length ? Math.max(0, Math.min(activeDateIdx, grouped.length - 1)) : 0;
  renderDateTabs(grouped, { syncToActive: syncDateNavToActive, smoothSync: syncDateNavToActive && !preserveDateNavScroll });
  renderPopularEvents();
  updateStatusBar();
  const scrollY = window.scrollY;
  if (!grouped.length) {
    main.innerHTML = `<div class="empty-state"><span>${t('empty.no_events')}</span></div>`;
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
      ${events.length ? events.map(ev => renderEventCard(ev, nextActKeys)).join('') : `<div class="no-events">${t('empty.no_events_day')}</div>`}
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
  const grouped = groupByDate(getVisibleEvents()), idx = grouped.findIndex(([d]) => d === dateStr);
  if (idx === -1) return;
  searchMode = false;
  activeSearch = null;
  activeDateIdx = idx;
  if (eventId) expandedEventIds.add(Number(eventId));
  clearSearch({ rerender: false });
  renderAll({ preserveDateNavScroll: true });
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
  const visibleEvents = getVisibleEvents();
  const artistEvents = allEvents;
  const actMap = {}, clubMap = {};
  artistEvents.forEach(ev => {
    (ev.event_acts || []).forEach(a => { if (a.acts) { const id = a.acts.id ?? a.acts.name; if (!actMap[id]) actMap[id] = { ...a.acts, type: 'artist' }; } });
  });
  visibleEvents.forEach(ev => {
    if (ev.clubs?.name && !clubMap[ev.clubs.name]) clubMap[ev.clubs.name] = { ...ev.clubs, type: 'club' };
  });
  const artists = Object.values(actMap).filter(a => (searchFilter === 'all' || searchFilter === 'artist') && String(a.name || '').toLowerCase().includes(lower));
  const clubs = Object.values(clubMap).filter(c => (searchFilter === 'all' || searchFilter === 'club') && String(c.name || '').toLowerCase().includes(lower));
  if (!artists.length && !clubs.length) {
    results.innerHTML = `<div class="search-no-results">${t('empty.no_results', { q: escapeHtml(q) })}</div>`;
    results.classList.add('open');
    return;
  }
  let html = '';
  if (artists.length) {
    html += `<div class="search-results-header">Artists (${artists.length})</div>`;
    artists.slice(0, 6).forEach(a => {
      const upcoming = countUpcomingEvents(a.id ?? a.name, 'artist');
      html += `<div class="search-result-item" data-search-type="artist" data-id="${a.id ?? ''}" data-name="${escapeHtml(a.name)}"><span class="result-type-tag artist">DJ</span><span class="result-name">${highlight(a.name, q)}</span><span class="result-sub">${upcoming} Event${upcoming !== 1 ? 's' : ''}</span><span class="result-arrow">-></span></div>`;
    });
  }
  if (clubs.length) {
    html += `<div class="search-results-header">Clubs (${clubs.length})</div>`;
    clubs.slice(0, 4).forEach(c => {
      const upcoming = countUpcomingEvents(c.name, 'club');
      html += `<div class="search-result-item" data-search-type="club" data-id="${c.id ?? ''}" data-name="${escapeHtml(c.name)}"><span class="result-type-tag club">CLUB</span><span class="result-name">${highlight(c.name, q)}</span><span class="result-sub">${upcoming} Event${upcoming !== 1 ? 's' : ''}</span><span class="result-arrow">-></span></div>`;
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
  if (idx < 0) return escapeHtml(text);
  return escapeHtml(text.slice(0, idx)) + `<mark style="background:rgba(255,32,32,0.3);color:var(--white)">${escapeHtml(text.slice(idx, idx + q.length))}</mark>` + escapeHtml(text.slice(idx + q.length));
}
function countUpcomingEvents(idOrName, type) {
  const visibleEvents = getVisibleEvents();
  if (type === 'artist') return allEvents.filter(ev => isUpcomingOrRunningEvent(ev) && (ev.event_acts || []).some(a => a.acts && (a.acts.id == idOrName || a.acts.name === idOrName))).length;
  return visibleEvents.filter(ev => isUpcomingOrRunningEvent(ev) && ev.clubs?.name === idOrName).length;
}
async function fetchClubStats(clubName) {
  // Calls a SECURITY DEFINER RPC — returns aggregated data across all users,
  // bypasses RLS safely (no individual rows exposed). Works for anon too.
  const client = supabaseAnonClient || supabaseClient;
  if (!client) return null;
  if (clubStatsCache.has(clubName)) return clubStatsCache.get(clubName);

  const clubEventIds = allEvents
    .filter(ev => ev.clubs?.name === clubName)
    .map(ev => Number(ev.id));
  if (!clubEventIds.length) { clubStatsCache.set(clubName, null); return null; }

  try {
    const { data, error } = await client.rpc('get_club_stats', { p_event_ids: clubEventIds });
    if (error || !data?.[0]) { clubStatsCache.set(clubName, null); return null; }
    const row = data[0];
    const stats = {
      avgWait:    row.avg_wait_minutes != null ? Number(row.avg_wait_minutes) : null,
      entryRate:  row.entry_rate      != null ? Number(row.entry_rate)       : null,
      inClub:     Number(row.in_club_count  || 0),
      denied:     Number(row.denied_count   || 0),
      total:      Number(row.total_attempts || 0),
    };
    clubStatsCache.set(clubName, stats);
    return stats;
  } catch { clubStatsCache.set(clubName, null); return null; }
}

function showClubSearch(clubName) {
  activeSearch = { type: 'club', name: clubName, label: `Club: ${clubName}` };
  searchMode = true;
  renderSearchResults(activeSearch.label, groupByDate(getVisibleEvents().filter(ev => ev.clubs?.name === clubName && isUpcomingOrRunningEvent(ev))));
  // Fetch and inject stats asynchronously — doesn't block render
  fetchClubStats(clubName).then(stats => {
    const bar = document.getElementById('clubStatsBar');
    if (!bar) return;
    if (!stats) {
      bar.innerHTML = `<span class="club-stat-empty">${t('empty.no_club_data')}</span>`;
      return;
    }
    const waitStr  = stats.avgWait != null ? (stats.avgWait < 60 ? `${stats.avgWait} min` : `${Math.floor(stats.avgWait/60)}h ${stats.avgWait%60}min`) : '—';
    const rateStr  = stats.entryRate != null ? `${stats.entryRate}% (${stats.inClub}/${stats.inClub + stats.denied})` : '—';
    bar.innerHTML = `
      <div class="club-stat"><span class="club-stat-val">${waitStr}</span><span class="club-stat-label">${t('club.avg_wait')}</span></div>
      <div class="club-stat-divider"></div>
      <div class="club-stat"><span class="club-stat-val">${rateStr}</span><span class="club-stat-label">${t('club.entry_rate')}</span></div>
    `;
  });
}
function showArtistSearch(actId, actName) {
  activeSearch = { type: 'artist', id: actId, name: actName, label: `Artist: ${actName}` };
  searchMode = true;
  renderSearchResults(activeSearch.label, groupByDate(allEvents.filter(ev => isUpcomingOrRunningEvent(ev) && (ev.event_acts || []).some(a => a.acts && (a.acts.id == actId || a.acts.name === actName)))));
}
function rerenderSearch() {
  if (!activeSearch) { searchMode = false; renderAll({ preserveDateNavScroll: true }); return; }
  if (activeSearch.type === 'club') showClubSearch(activeSearch.name);
  else showArtistSearch(activeSearch.id, activeSearch.name);
}
function renderSearchResults(label, grouped) {
  const searchEvents = grouped.flatMap(([, events]) => events || []);
  const nextActKeys = getNextActIds(searchEvents), main = document.getElementById('mainContent');
  if (!main) return;
  renderPopularEvents();
  updateStatusBar();
  if (!grouped.length) {
    const statsBlock = activeSearch?.type === 'club' ? `<div class="club-stats-bar" id="clubStatsBar"><span class="club-stat-empty">${t('loading.stats')}</span></div>` : '';
    main.innerHTML = `<div class="search-active-banner"><span><strong>${escapeHtml(label)}</strong>${t('misc.search_banner_no_events')}</span><button class="search-banner-close" type="button" onclick="clearSearch()">${t('search.back')}</button></div>${statsBlock}<div class="empty-state"><span>${t('empty.no_events')}</span></div>`;
    setLastUpdated();
    return;
  }
  const isClub = activeSearch?.type === 'club';
  let html = `<div class="search-active-banner"><span>${t('search.results_for')} <strong>${escapeHtml(label)}</strong></span><button class="search-banner-close" type="button" onclick="clearSearch()">${t('search.back')}</button></div>`;
  if (isClub) {
    html += `<div class="club-stats-bar" id="clubStatsBar"><span class="club-stat-empty">${t('loading.stats')}</span></div>`;
  }
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
  if (!set || !Number.isFinite(numericId) || !ensureAuthenticated('Favorites') || !supabaseClient) return false;
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
  if (!Number.isFinite(eventId) || !ensureAuthenticated('Interested') || !supabaseClient) return false;
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
      const { error } = await supabaseClient.from('event_hypes')
        .upsert({ user_id: sessionUser.id, event_id: eventId }, { onConflict: 'user_id,event_id', ignoreDuplicates: false });
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
  button.textContent = active ? '♥' : '♡';
  button.setAttribute('aria-label', active ? t('profile.unfollow_artist') : t('profile.follow_artist'));
  button.setAttribute('title', active ? t('profile.unfollow_artist') : t('profile.follow_artist'));
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
    btn.textContent = isActive ? '♥' : '♡';
    btn.closest('.artist-row')?.classList.toggle('artist-row--followed', isActive);
  });
  syncActFavoriteButton(actId);
}
function bindActionHandlers() {
  document.getElementById('mainContent')?.addEventListener('click', async e => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    e.preventDefault();
    if (target.dataset.action === 'toggle-timetable') {
      const card = target.closest('.event-card');
      const evId = Number(target.dataset.eventId);
      if (expandedEventIds.has(evId)) expandedEventIds.delete(evId); else expandedEventIds.add(evId);
      card?.classList.toggle('open', expandedEventIds.has(evId));
      const chevron = card?.querySelector('.card-chevron');
      if (chevron) chevron.textContent = expandedEventIds.has(evId) ? '▾' : '▸';
      if (expandedEventIds.has(evId)) renderCardQueueChart(evId);
      return;
    }
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
    if (target.dataset.action === 'score-info') {
      e.stopPropagation();
      showQueueInfoToast(t('live.score_info'));
      return;
    }
    if (target.dataset.action === 'queue-locked-info') {
      showQueueInfoToast(t('live.queue_locked_info'));
      return;
    }
    if (target.dataset.action === 'set-presence') {
      await setPresenceStatus(Number(target.dataset.eventId), target.dataset.nextStatus);
    }
    if (target.dataset.action === 'open-live-panel') {
      livePanelExpanded = true;
      renderLivePanel();
      return;
    }
    if (target.dataset.action === 'open-rating') {
      await openRatingModal({
        actId: Number(target.dataset.actId),
        actName: target.dataset.actName,
        eventId: Number(target.dataset.eventId),
        eventName: target.dataset.eventName,
      });
    }
  });
  document.getElementById('popularRail')?.addEventListener('click', e => {
    const tab = e.target.closest('[data-rail-tab]');
    if (tab) {
      railActiveTab = tab.dataset.railTab;
      localStorage.setItem('setradar_rail_tab', railActiveTab);
      renderPopularEvents();
      return;
    }
    const spotlight = e.target.closest('[data-spotlight-act-id]');
    if (spotlight) {
      e.stopPropagation();
      openArtistPopup(spotlight.dataset.spotlightActId, spotlight.dataset.spotlightActName);
      return;
    }
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
  const requestId = ++artistPopupRequestId;
  content.innerHTML = `<div class="modal-artist-tag">// ARTIST</div><div class="modal-artist-name">${escapeHtml(actName)}</div><div class="modal-divider"></div><div style="color:var(--grey);font-size:11px;letter-spacing:0.1em">Loading...</div>`;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  syncBodyLock();
  let instaName = null, scUrl = null, upcomingEvents = [], pastEvents = [], ratingStats = null;
  if (supabaseClient && actId) {
    const pubClient = supabaseAnonClient || supabaseClient;
    try {
      const { data: act } = await pubClient.from('acts').select('id, name, insta_name, soundcloud_url').eq('id', actId).maybeSingle();
      if (act) { instaName = act.insta_name; scUrl = act.soundcloud_url; }
      const { data: eventActRows } = await pubClient.from('event_acts').select('id, start_time, end_time, event_id').eq('act_id', actId);
      if (eventActRows?.length) {
        const eventIds = eventActRows.map(r => r.event_id);
        const [upRes, pastRes] = await Promise.all([
          pubClient.from('events').select('id, event_name, event_date, time_start, time_end, clubs(id, name, cities(name))').in('id', eventIds).gte('event_date', getDateStr(-2)).order('event_date'),
          pubClient.from('events').select('id, event_name, event_date, time_start, time_end, clubs(id, name, cities(name))').in('id', eventIds).lt('event_date', getDateStr(0)).order('event_date', { ascending: false }).limit(8),
        ]);
        if (upRes.data) {
          const eventMap = {};
          upRes.data.forEach(ev => { eventMap[ev.id] = ev; });
          upcomingEvents = eventActRows
            .map(ea => ({ start_time: ea.start_time, end_time: ea.end_time, events: eventMap[ea.event_id] || null }))
            .filter(ea => ea.events && isUpcomingOrRunningEvent(ea.events))
            .sort((a, b) => a.events.event_date.localeCompare(b.events.event_date))
            .slice(0, 8);
        }
        if (pastRes.data) {
          const pastEventMap = {};
          pastRes.data.forEach(ev => { pastEventMap[ev.id] = ev; });
          pastEvents = eventActRows
            .map(ea => ({ start_time: ea.start_time, end_time: ea.end_time, events: pastEventMap[ea.event_id] || null }))
            .filter(ea => ea.events && !isUpcomingOrRunningEvent(ea.events))
            .sort((a, b) => b.events.event_date.localeCompare(a.events.event_date))
            .slice(0, 8);
        }
      }
      // Fetch public rating stats
      const { data: stats } = await pubClient.from('act_rating_stats').select('rating_count, avg_rating, best_act_pct, surprise_pct').eq('act_id', actId).maybeSingle();
      ratingStats = stats || null;
      // Fetch user's own ratings for this act
      if (sessionUser && supabaseClient) {
        const { data: ownRatings } = await supabaseClient.from('act_ratings').select('act_id, event_id, rating, was_best_act, was_surprise').eq('user_id', sessionUser.id).eq('act_id', actId);
        if (ownRatings) {
          ownRatings.forEach(r => {
            const key = `${r.act_id}:${r.event_id ?? 'null'}`;
            userActRatings.set(key, r);
          });
        }
      }
    } catch (err) {
      console.warn('Artist popup fetch error:', err.message || err);
    }
  } else {
    allEvents.filter(ev => isUpcomingOrRunningEvent(ev)).forEach(ev => {
      const act = (ev.event_acts || []).find(a => a.acts && (a.acts.id == actId || a.acts.name === actName));
      if (act) { upcomingEvents.push({ start_time: act.start_time, end_time: act.end_time, events: ev }); instaName = act.acts.insta_name; }
    });
  }
  if (requestId !== artistPopupRequestId) return;
  renderArtistModal(actName, instaName, upcomingEvents, actId, pastEvents, ratingStats, scUrl);
}
function renderArtistModal(name, instaName, upcomingEvents, actId, pastEvents = [], ratingStats = null, scUrl = null) {
  const content = document.getElementById('modalContent');
  if (!content) return;
  const numericActId = Number(actId), isFavorite = Number.isFinite(numericActId) && favoriteActIds.has(numericActId);
  const favHtml = Number.isFinite(numericActId)
    ? `<button class="modal-act-favorite${isFavorite ? ' active' : ''}" type="button" data-favorite-act-id="${numericActId}" aria-pressed="${isFavorite}" aria-label="${isFavorite ? t('profile.unfollow_artist') : t('profile.follow_artist')}" title="${isFavorite ? t('profile.unfollow_artist') : t('profile.follow_artist')}">${isFavorite ? '♥' : '♡'}</button>`
    : '';
  const igHtml = instaName
    ? `<a class="modal-ig-link" href="https://instagram.com/${escapeHtml(instaName)}" target="_blank" rel="noopener"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>@${escapeHtml(instaName)}</a>`
    : `<span class="modal-ig-link modal-social-placeholder">Instagram</span>`;
  const scHtml = scUrl
    ? `<a class="modal-sc-link" href="${safeUrl(scUrl)}" target="_blank" rel="noopener"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M1.175 12.225c-.041 0-.075.032-.079.074l-.55 4.754.55 4.757c.004.042.038.074.079.074.04 0 .074-.032.079-.074l.625-4.757-.625-4.754c-.005-.042-.039-.074-.079-.074zm1.558-.55c-.05 0-.09.037-.095.086l-.484 5.304.484 5.307c.005.05.045.086.095.086.05 0 .09-.036.095-.086l.549-5.307-.549-5.304c-.005-.05-.045-.086-.095-.086zm1.574-.31c-.058 0-.105.045-.11.103l-.418 5.614.418 5.617c.005.058.052.103.11.103.058 0 .106-.045.111-.103l.473-5.617-.473-5.614c-.005-.058-.053-.103-.111-.103zm1.59-.128c-.065 0-.118.052-.123.117l-.35 5.742.35 5.745c.005.065.058.117.123.117.065 0 .118-.052.123-.117l.397-5.745-.397-5.742c-.005-.065-.058-.117-.123-.117zm1.589-.077c-.073 0-.132.058-.137.13l-.283 5.819.283 5.822c.005.073.064.13.137.13.073 0 .132-.057.137-.13l.32-5.822-.32-5.819c-.005-.073-.064-.13-.137-.13zm1.591-.032c-.08 0-.145.063-.15.143l-.216 5.851.216 5.854c.005.08.07.143.15.143.08 0 .145-.063.15-.143l.244-5.854-.244-5.851c-.005-.08-.07-.143-.15-.143zm1.592-.014c-.087 0-.158.07-.163.156l-.149 5.865.149 5.868c.005.087.076.156.163.156.087 0 .158-.069.163-.156l.169-5.868-.169-5.865c-.005-.087-.076-.156-.163-.156zm1.59-.004c-.094 0-.171.076-.176.17l-.082 5.869.082 5.872c.005.094.082.17.176.17.094 0 .171-.076.176-.17l.093-5.872-.093-5.869c-.005-.094-.082-.17-.176-.17zm1.59.004c-.1 0-.181.08-.186.18l-.014 5.865.014 5.868c.005.1.086.18.186.18.1 0 .181-.08.186-.18l.016-5.868-.016-5.865c-.005-.1-.086-.18-.186-.18zm3.547-1.636C19.5 9.16 17.857 7.5 15.875 7.5c-.504 0-.983.101-1.418.283-.147-3.604-3.13-6.48-6.774-6.48-1.018 0-1.983.224-2.844.625-.31.14-.393.284-.396.41v13.31c.003.13.106.238.238.246h13.318C19.428 15.893 21 14.315 21 12.375c0-1.94-1.572-3.518-3.5-3.519z"/></svg>SoundCloud</a>`
    : `<span class="modal-sc-link modal-social-placeholder">SoundCloud</span>`;

  // Rating stats block
  let statsHtml = '';
  if (ratingStats && ratingStats.rating_count > 0) {
    const stars = '★'.repeat(Math.round(ratingStats.avg_rating)) + '☆'.repeat(5 - Math.round(ratingStats.avg_rating));
    statsHtml = `
      <div class="modal-act-stats">
        <div class="modal-act-stats-row">
          <span class="modal-act-stars" title="${ratingStats.avg_rating} / 5">${stars}</span>
          <span class="modal-act-avg">${ratingStats.avg_rating}</span>
          <span class="modal-act-count">(${ratingStats.rating_count})</span>
        </div>
        ${ratingStats.surprise_pct > 0 ? `<div class="modal-act-flags"><span class="modal-act-flag modal-act-flag--surprise">${t('rating.surprise')} ${ratingStats.surprise_pct}%</span></div>` : ''}
      </div>`;
  }

  const rows = upcomingEvents.length
    ? upcomingEvents.map(ea => {
      const ev = ea.events ?? ea, d = formatDateLabel(ev.event_date), start = fmtTime(ea.start_time), end = fmtTime(ea.end_time), slot = start && end ? `${start}-${end}` : start ? t('act.from', { time: start }) : null;
      const ratingKey = `${numericActId}:${ev.id}`;
      const existingRating = userActRatings.get(ratingKey);
      const rateBtn = sessionUser
        ? existingRating
          ? `<span class="modal-rated-stars">${'★'.repeat(existingRating.rating)}${'☆'.repeat(5 - existingRating.rating)}</span>`
          : `<button class="modal-rate-btn" type="button" data-action="open-rating" data-act-id="${numericActId}" data-act-name="${escapeHtml(name)}" data-event-id="${ev.id}" data-event-name="${escapeHtml(ev.event_name)}">★</button>`
        : '';
      const city = ev.clubs?.cities?.name;
      const venue = city ? `${city} — ${ev.clubs?.name ?? ''}` : (ev.clubs?.name ?? '-');
        return `<div class="modal-event-row modal-event-row--link" data-event-date="${ev.event_date}" data-event-id="${ev.id}"><div class="modal-event-date"><span class="med">${d.day}</span><span class="mmonth">${d.monthShort}</span><span class="mwday">${d.weekday}</span></div><div class="modal-event-info"><div class="modal-event-name">${escapeHtml(ev.event_name)}</div><div class="modal-event-venue">${escapeHtml(venue)}</div></div><div class="modal-event-right">${rateBtn}${slot ? `<div class="modal-event-time">${slot}</div>` : ''}<span class="modal-event-goto">-></span></div></div>`;
    }).join('')
    : `<div class="modal-no-events">${t('empty.no_upcoming')}</div>`;

  // Past events with rating buttons (only when logged in)
  let pastHtml = '';
  if (pastEvents.length) {
    const pastRows = pastEvents.map(ea => {
      const ev = ea.events ?? ea, d = formatDateLabel(ev.event_date);
      const ratingKey = `${numericActId}:${ev.id}`;
      const existingRating = userActRatings.get(ratingKey);
      const rateBtn = sessionUser
        ? existingRating
          ? `<span class="modal-rated-stars">${'★'.repeat(existingRating.rating)}${'☆'.repeat(5 - existingRating.rating)}</span>`
          : `<button class="modal-rate-btn" type="button" data-action="open-rating" data-act-id="${numericActId}" data-act-name="${escapeHtml(name)}" data-event-id="${ev.id}" data-event-name="${escapeHtml(ev.event_name)}">Bewerten</button>`
        : '';
      const city = ev.clubs?.cities?.name;
      const venue = city ? `${city} — ${ev.clubs?.name ?? ''}` : (ev.clubs?.name ?? '-');
      return `<div class="modal-event-row modal-event-row--past"><div class="modal-event-date"><span class="med">${d.day}</span><span class="mmonth">${d.monthShort}</span><span class="mwday">${d.weekday}</span></div><div class="modal-event-info"><div class="modal-event-name">${escapeHtml(ev.event_name)}</div><div class="modal-event-venue">${escapeHtml(venue)}</div></div><div class="modal-event-right">${rateBtn}</div></div>`;
    }).join('');
    pastHtml = `<div class="modal-events-label modal-events-label--past">Vergangene Events (${pastEvents.length})</div>${pastRows}`;
  }

  const socialRow = `<div class="modal-social-row">${igHtml}${scHtml}</div>`;
  content.innerHTML = `
    <div class="modal-artist-tag">// ARTIST</div>
    <div class="artist-modal-header"><div class="modal-artist-name">${escapeHtml(name)}</div><div class="modal-head-actions">${favHtml}</div></div>
    <div class="modal-divider"></div>
    ${socialRow}
    ${statsHtml}
    <div class="modal-events-label">Kommende Events (${upcomingEvents.length})</div>
    ${rows}
    ${pastHtml}
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
      await toggleFavorite('act', actId, { rerender: false, onChange: () => syncActFollowButtons(actId) });
      return;
    }
    const rateBtn = e.target.closest('[data-action="open-rating"]');
    if (rateBtn) {
      e.preventDefault();
      await openRatingModal({
        actId: Number(rateBtn.dataset.actId),
        actName: rateBtn.dataset.actName,
        eventId: Number(rateBtn.dataset.eventId),
        eventName: rateBtn.dataset.eventName,
      });
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
  let suppressClickUntil = 0;
  const isOverlayOpen = () => document.getElementById('artistOverlay')?.classList.contains('open') || document.getElementById('authOverlay')?.classList.contains('open');
  const isSwipeBlockedTarget = target => target?.closest('.date-nav, .popular-rail, .live-panel, button, a, input, textarea, select, [data-favorite-act-id], .artist-name-link');
  const reset = () => { main.style.transition = 'transform 0.25s cubic-bezier(0.25,1,0.5,1), opacity 0.2s'; main.style.transform = ''; main.style.opacity = ''; };
  const out = (dir, cb) => { main.style.transition = 'transform 0.17s cubic-bezier(0.4,0,1,1), opacity 0.17s'; main.style.transform = `translateX(${dir * -110}%) rotate(${dir * -3}deg)`; main.style.opacity = '0'; setTimeout(cb, 170); };
  const inp = dir => { main.style.transition = 'none'; main.style.transform = `translateX(${dir * 75}%) rotate(${dir * 2}deg)`; main.style.opacity = '0'; void main.offsetWidth; main.style.transition = 'transform 0.28s cubic-bezier(0.25,1,0.5,1), opacity 0.22s'; main.style.transform = ''; main.style.opacity = ''; };
  const beginSwipe = (x, y) => {
    startX = x;
    startY = y;
    curX = x;
    swiping = false;
  };
  const moveSwipe = (x, y, preventDefault = null) => {
    if (startX === null || isOverlayOpen()) return;
    const dx = x - startX, dy = y - startY;
    if (!swiping) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) { startX = null; return; }
      swiping = true;
    }
    if (Math.abs(dx) > 10 && preventDefault) preventDefault();
    curX = x;
    const grouped = groupByDate(getVisibleEvents()), atStart = activeDateIdx === 0, atEnd = activeDateIdx >= grouped.length - 1;
    let clamped = dx;
    if ((dx > 0 && atStart) || (dx < 0 && atEnd)) clamped = dx > 0 ? Math.min(dx * 0.18, MAX_RESIST) : Math.max(dx * 0.18, -MAX_RESIST);
    main.style.transition = 'none';
    main.style.transform = `translateX(${clamped}px) rotate(${clamped * 0.012}deg)`;
    main.style.opacity = String(1 - Math.min(Math.abs(clamped) / 280, 0.28));
  };
  const endSwipe = () => {
    if (startX === null || !swiping) { startX = null; return; }
    const dx = curX - startX, grouped = groupByDate(getVisibleEvents()), canNext = activeDateIdx < grouped.length - 1, canPrev = activeDateIdx > 0;
    if (searchMode) { reset(); startX = null; swiping = false; return; }
    if (Math.abs(dx) > 10) suppressClickUntil = Date.now() + 250;
    if (dx < -THRESHOLD && canNext) out(-1, () => { activeDateIdx += 1; renderAll({ preserveDateNavScroll: true, syncDateNavToActive: true }); inp(1); });
    else if (dx > THRESHOLD && canPrev) out(1, () => { activeDateIdx -= 1; renderAll({ preserveDateNavScroll: true, syncDateNavToActive: true }); inp(-1); });
    else reset();
    startX = null; swiping = false;
  };
  main.addEventListener('click', e => {
    if (Date.now() < suppressClickUntil) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
  document.addEventListener('touchstart', e => {
    if (isOverlayOpen() || isSwipeBlockedTarget(e.target)) return;
    beginSwipe(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    moveSwipe(e.changedTouches[0].clientX, e.changedTouches[0].clientY, () => e.preventDefault());
  }, { passive: false });
  document.addEventListener('touchend', endSwipe);
  main.addEventListener('mousedown', e => {
    if (e.button !== 0 || isOverlayOpen() || isSwipeBlockedTarget(e.target)) return;
    beginSwipe(e.clientX, e.clientY);
  });
  document.addEventListener('mousemove', e => {
    if (startX === null) return;
    moveSwipe(e.clientX, e.clientY, () => e.preventDefault());
  });
  document.addEventListener('mouseup', endSwipe);
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
async function loadQueueTimeline(events = allEvents) {
  if (demoMode) return;
  const client = supabaseAnonClient || supabaseClient;
  if (!client) return;
  const ids = visibleEventIds(events);
  if (!ids.length) return;
  try {
    const { data } = await client
      .from('event_queue_timeline')
      .select('event_id, bucket_start, avg_wait_minutes, sample_count')
      .in('event_id', ids)
      .order('bucket_start');
    const grouped = new Map();
    (data || []).forEach(row => {
      const eid = Number(row.event_id);
      if (!grouped.has(eid)) grouped.set(eid, []);
      grouped.get(eid).push({
        ts:      new Date(row.bucket_start).getTime(),
        avgWait: Number(row.avg_wait_minutes),
        count:   Number(row.sample_count || 1),
      });
    });
    grouped.forEach((pts, eid) => queueTimelineByEventId.set(eid, pts));
  } catch (err) {
    console.warn('Queue timeline fetch error:', err.message || err);
  }
}

async function loadEventHighlights(events = allEvents) {
  const ids = visibleEventIds(events);
  const pubClient = supabaseAnonClient || supabaseClient;
  if (!pubClient || !ids.length) { eventHighlights = new Map(); return; }
  try {
    const { data, error } = await pubClient
      .from('event_act_highlights')
      .select('event_id, best_act_id, surprise_act_id, hidden_gem_act_id')
      .in('event_id', ids);
    if (error) throw error;
    eventHighlights = new Map();
    (data || []).forEach(row => {
      eventHighlights.set(Number(row.event_id), {
        bestActId: row.best_act_id ? Number(row.best_act_id) : null,
        surpriseActId: row.surprise_act_id ? Number(row.surprise_act_id) : null,
        hiddenGemActId: row.hidden_gem_act_id ? Number(row.hidden_gem_act_id) : null,
      });
    });
  } catch (err) {
    console.warn('Highlights fetch error:', err.message || err);
    eventHighlights = new Map();
  }
}
async function loadActSpotlight() {
  const pubClient = supabaseAnonClient || supabaseClient;
  if (!pubClient) { spotlightActs = []; return; }
  const from = getDateStr(-2), to = getDateStr(-1);
  try {
    const { data: rawEvents, error: evErr } = await pubClient
      .from('events')
      .select('id, event_name, clubs(name, cities(name)), event_acts(acts(id, name, insta_name))')
      .gte('event_date', from)
      .lte('event_date', to);
    if (evErr) throw evErr;
    const recentEvents = (rawEvents || []).filter(ev => normalizeCityName(ev.clubs?.cities?.name) === normalizeCityName(selectedCity));
    if (!recentEvents.length) { spotlightActs = []; return; }
    const actEventMap = new Map();
    for (const ev of recentEvents) {
      for (const ea of (ev.event_acts || [])) {
        const act = ea.acts;
        if (!act?.id) continue;
        if (!actEventMap.has(act.id)) {
          actEventMap.set(act.id, { actName: act.name, instaName: act.insta_name, eventName: ev.event_name, clubName: ev.clubs?.name });
        }
      }
    }
    const actIds = [...actEventMap.keys()];
    if (!actIds.length) { spotlightActs = []; return; }
    const { data: stats, error: statErr } = await pubClient
      .from('act_rating_stats')
      .select('act_id, avg_rating, rating_count, surprise_pct, best_act_pct')
      .in('act_id', actIds);
    if (statErr) throw statErr;
    const scoredActs = (stats || [])
      .filter(s => s.rating_count >= 1)
      .map(s => ({ ...s, actId: Number(s.act_id), ...actEventMap.get(Number(s.act_id)) }));
    if (!scoredActs.length) { spotlightActs = []; return; }
    const weightedScore = s => s.avg_rating * Math.log(s.rating_count + 1);
    const bestFallback = (pool, usedIds) =>
      pool.filter(s => !usedIds.has(s.actId)).sort((a, b) => weightedScore(b) - weightedScore(a))[0] || null;
    const usedIds = new Set();
    const result = [];
    // Slot 1: Überraschung — highest surprise_pct (min 2 ratings), fallback: best available
    const surprisePick = scoredActs
      .filter(s => s.rating_count >= 2 && s.surprise_pct > 0)
      .sort((a, b) => b.surprise_pct - a.surprise_pct)[0]
      || bestFallback(scoredActs, usedIds);
    if (surprisePick) { usedIds.add(surprisePick.actId); result.push({ ...surprisePick, type: 'surprise' }); }
    // Slot 2: Bester Act — highest weighted score (min 2 ratings), fallback: best available
    const bestPick = scoredActs
      .filter(s => !usedIds.has(s.actId) && s.rating_count >= 2)
      .sort((a, b) => weightedScore(b) - weightedScore(a))[0]
      || bestFallback(scoredActs, usedIds);
    if (bestPick) { usedIds.add(bestPick.actId); result.push({ ...bestPick, type: 'best' }); }
    // Slot 3: Geheimtipp — ≥4.5 Sterne, 10–50 Ratings; fallback: best available
    const geheimPick = scoredActs
      .filter(s => !usedIds.has(s.actId) && s.avg_rating >= 4.5 && s.rating_count >= 10 && s.rating_count <= 50)
      .sort((a, b) => b.avg_rating - a.avg_rating)[0]
      || bestFallback(scoredActs, usedIds);
    if (geheimPick) result.push({ ...geheimPick, type: 'gem' });
    spotlightActs = result;
  } catch (err) {
    console.warn('Spotlight fetch error:', err.message || err);
    spotlightActs = [];
  }
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
  // Bulk-load all user act ratings (for historical avg display in lineup)
  try {
    const { data: ratingsData } = await supabaseClient
      .from('act_ratings')
      .select('act_id, event_id, rating, was_best_act, was_surprise')
      .eq('user_id', sessionUser.id);
    (ratingsData || []).forEach(r => {
      userActRatings.set(`${r.act_id}:${r.event_id ?? 'null'}`, r);
    });
    loadPersonalScoreData();
  } catch (err) {
    console.warn('Act ratings fetch error:', err.message || err);
  }
  await loadPresence();
}
async function loadFromSupabase() {
  const { data, error } = await (supabaseAnonClient || supabaseClient)
    .from('events')
    .select(`
      id, event_name, event_date, time_start, time_end,
      clubs ( id, name, cities ( name ) ),
      event_acts ( start_time, end_time, sort_order, canceled, acts ( id, name, insta_name ) )
    `)
    .gte('event_date', getDateStr(-2))
    .lte('event_date', getDateStr(60))
    .order('event_date');
  if (error) throw error;
  return data || [];
}
async function loadAvailableCities() {
  const publicClient = supabaseAnonClient || supabaseClient;
  if (!publicClient) {
    availableCities = [...new Set(DEMO_EVENTS.map(ev => normalizeCityName(ev.clubs?.cities?.name)).filter(Boolean))];
    if (!availableCities.length) availableCities = ['Berlin'];
    syncCitySelectorUi();
    return;
  }
  try {
    const { data, error } = await publicClient
      .from('cities')
      .select('name')
      .order('name');
    if (error) throw error;
    availableCities = [...new Set((data || []).map(row => normalizeCityName(row.name)).filter(Boolean))];
  } catch (err) {
    console.warn('Cities fetch error:', err.message || err);
    availableCities = [...new Set(allEvents.map(ev => normalizeCityName(ev.clubs?.cities?.name)).filter(Boolean))];
  }
  if (!availableCities.length) availableCities = ['Berlin'];
  syncCitySelectorUi();
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
  if (demoMode && !availableCities.length) {
    availableCities = ['Berlin'];
    syncCitySelectorUi();
  }
  const eventCities = [...new Set(allEvents.map(ev => normalizeCityName(ev.clubs?.cities?.name)).filter(Boolean))];
  if (eventCities.length) {
    availableCities = [...new Set([...availableCities, ...eventCities])].sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));
    syncCitySelectorUi();
  }
  if (demoMode) loadDemoHypes();
  else { await loadPublicHypes(allEvents); await loadEventHighlights(allEvents); await loadActSpotlight(); await loadQueueTimeline(allEvents); }
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
  panel.classList.remove('open', 'fullscreen');
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = '';
  livePanelRenderSignature = '';
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
    const raw = (data && data.event_id && data.status !== 'left') ? data : null;
    // Auto-clear stale presence for past events no longer in allEvents
    if (raw && !allEvents.some(e => Number(e.id) === Number(raw.event_id))) {
      await deletePresence();
      userPresence = null;
    } else {
      userPresence = raw;
    }
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
    // Log every status change for stats & badges (table: user_presence_log)
    supabaseClient.from('user_presence_log').insert({
      user_id: sessionUser.id,
      event_id: eventId,
      status,
    }).then(({ error: logErr }) => {
      if (logErr) console.warn('Presence log insert error:', logErr.message);
    });
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

  if (nextStatus === 'queue') {
    const ev = allEvents.find(e => Number(e.id) === Number(eventId));
    const eventStart = ev ? getEventStartDateTime(ev) : null;
    const queueOpenAt = eventStart ? new Date(eventStart.getTime() - 10 * 60 * 60 * 1000) : null;
    if (queueOpenAt && new Date() < queueOpenAt) {
      showQueueInfoToast(t('live.queue_locked_info'));
      return;
    }
  }

  if (nextStatus === 'left' || nextStatus === null) {
    stopLivePolling();
    const leftEv = allEvents.find(e => Number(e.id) === Number(eventId)) || null;
    userPresence = null;
    liveEventData = { queueStats: null, mood: null, presenceRows: [], allRatings: [] };
    // Preserve myQueueStartTime / myClubEntryTime so "Deine Nacht" stays readable
    // Set goodbye state BEFORE rerenderView so event card shows "Live ▲"
    liveGoodbyeEvent = leftEv || null;
    liveGoodbyeScreen = livePanelExpanded && !!leftEv; // show goodbye msg only if panel was open
    if (!liveGoodbyeEvent) livePanelExpanded = false;
    rerenderView({ preserveDateNavScroll: true });
    await deletePresence();
    if (liveGoodbyeEvent && livePanelExpanded) {
      renderLivePanel();
    } else if (!liveGoodbyeEvent) {
      hideLivePanel();
    }
    return;
  }

  const ok = await upsertPresence(eventId, nextStatus);
  if (!ok) return;
  // Clear goodbye state when joining a new queue
  liveGoodbyeEvent = null;
  liveGoodbyeScreen = false;
  userPresence = { user_id: sessionUser.id, event_id: Number(eventId), status: nextStatus };
  if (nextStatus === 'queue')   { myQueueStartTime = new Date(); myClubEntryTime = null; }
  if (nextStatus === 'in_club' && !myClubEntryTime) myClubEntryTime = new Date();

  livePanelExpanded = true; // direkt geöffnet beim Betreten
  await fetchLiveData(eventId);
  renderLivePanel();
  rerenderView({ preserveDateNavScroll: true });

  if (!livePollingId) startLivePolling(eventId);
}

async function handleDenied(eventId) {
  if (!ensureAuthenticated('Live Mode') || !supabaseClient) return;
  // Only count denial if user was in queue for at least 2 minutes.
  // Prevents stat manipulation by quickly joining + denying + reloading.
  const MIN_QUEUE_MS = 2 * 60 * 1000;
  const queueSince = myQueueStartTime
    || (userPresence?.updated_at ? new Date(userPresence.updated_at) : null);
  const countDenial = queueSince && (Date.now() - queueSince.getTime() >= MIN_QUEUE_MS);
  if (countDenial) {
    try {
      await supabaseClient.from('user_presence_log').insert({
        user_id: sessionUser.id,
        event_id: eventId,
        status: 'denied',
      });
    } catch (err) {
      console.warn('Denial log error:', err.message || err);
    }
  }
  await setPresenceStatus(eventId, 'left');
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
    const pubClient = supabaseAnonClient || supabaseClient;
    const [tlRes, mRes, pRes, rRes] = await Promise.all([
      pubClient.from('event_queue_timeline')
        .select('bucket_start, avg_wait_minutes, sample_count')
        .eq('event_id', eventId).order('bucket_start'),
      supabaseClient.from('event_mood_current').select('*').eq('event_id', eventId).maybeSingle(),
      sessionUser
        ? supabaseClient.from('user_presence_log')
            .select('id, status, created_at')
            .eq('event_id', eventId)
            .eq('user_id', sessionUser.id)
            .order('created_at')
        : Promise.resolve({ data: [] }),
      pubClient.from('act_ratings').select('act_id, rating, was_surprise').eq('event_id', eventId),
    ]);
    const presenceRows = pRes.data || [];
    const queueRows = presenceRows.filter(r => r.status === 'queue');
    const clubRows  = presenceRows.filter(r => r.status === 'in_club');
    const lastQueue = queueRows.length ? queueRows[queueRows.length - 1] : null;
    const lastClub  = clubRows.length  ? clubRows[clubRows.length - 1]   : null;
    if (lastQueue?.created_at) myQueueStartTime = new Date(lastQueue.created_at);
    if (lastClub?.created_at)  myClubEntryTime  = new Date(lastClub.created_at);
    // Parse timeline and keep card map in sync
    const queueTimeline = (tlRes.data || []).map(r => ({
      ts:      new Date(r.bucket_start).getTime(),
      avgWait: Number(r.avg_wait_minutes),
      count:   Number(r.sample_count || 1),
    }));
    queueTimelineByEventId.set(Number(eventId), queueTimeline);
    liveEventData = { queueTimeline, mood: mRes.data || null, presenceRows, allRatings: rRes.data || [] };
  } catch (err) {
    console.warn('Live data fetch error:', err.message || err);
  }
}

function startLivePolling(eventId) {
  stopLivePolling();
  if (!eventId) return;
  livePollingId = setInterval(async () => {
    await fetchLiveData(eventId);
    const currentEvent = allEvents.find(e => Number(e.id) === Number(eventId));
    if (!currentEvent || !userPresence) return;
    const sig = buildLivePanelSignature(currentEvent, userPresence.status, getHype(currentEvent.id).total_hype);
    if (sig === livePanelRenderSignature) {
      renderLiveQueueChart();
      updateLiveSpotlights();
      return;
    }
    renderLivePanel();
  }, 3 * 60 * 1000);
}

/**
 * Renders a queue wait-time line chart into `el`.
 * `points` = [{ ts, avgWait, count }] — already sorted ascending.
 * `ev`     = event object (for start/end boundaries).
 * `mini`   = true → compact height for event cards.
 */
/**
 * Pure renderer — draws whatever points it receives. No personal-data injection here.
 */
function renderQueueChart(points, ev, el, { mini = false } = {}) {
  if (!el) return;
  if (!points.length) {
    el.innerHTML = `<div class="pem-q-empty">${t('queue.nobody_yet')}</div>`;
    return;
  }
  const W = mini ? 280 : 280;
  const H = mini ? 48  : 84;
  const ml = mini ? 28  : 34, mr = 8, mt = mini ? 6 : 10, mb = mini ? 14 : 22;
  const cw = W - ml - mr, ch = H - mt - mb;
  const maxWait = Math.max(...points.map(p => p.avgWait), 0);
  const MAX_VAL = Math.max(60, Math.ceil(maxWait / 30) * 30 || 60);
  const colorFor = v => v < 30 ? '#22c55e' : v < 60 ? '#f59e0b' : v < 90 ? '#f97316' : '#ef4444';
  const eventStart = getEventStartDateTime(ev) || new Date(points[0].ts);
  const eventEnd   = getEventEndDateTime(ev)   || new Date(points[points.length - 1].ts);
  const t0 = eventStart.getTime();
  const t1 = Math.max(t0 + 1, eventEnd.getTime());
  const toX = ts => ml + ((Math.min(Math.max(ts, t0), t1) - t0) / (t1 - t0)) * cw;
  const toY = v  => mt + ch - Math.min(v / MAX_VAL, 1) * ch;
  const fmtAxis = d => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  // Y grid lines (only in full mode)
  const gridVals = mini ? [] : [0, MAX_VAL * 0.5, MAX_VAL].map(v => Math.round(v / 10) * 10);
  const gridLines = gridVals.map(v => {
    const y = toY(v).toFixed(1);
    return `<line x1="${ml}" y1="${y}" x2="${W - mr}" y2="${y}" stroke="#1a1a1a" stroke-width="1"/>
            <text x="${ml - 3}" y="${(+y + 3).toFixed(1)}" text-anchor="end" fill="#333" font-size="6.5" font-family="monospace">${v}m</text>`;
  }).join('');
  // Fill area
  let fillPath = '';
  if (points.length > 1) {
    const ptStr   = points.map(p => `${toX(p.ts).toFixed(1)},${toY(p.avgWait).toFixed(1)}`).join(' ');
    const bottom  = toY(0).toFixed(1);
    const firstX  = toX(points[0].ts).toFixed(1);
    const lastX   = toX(points[points.length - 1].ts).toFixed(1);
    fillPath = `<polygon points="${ptStr} ${lastX},${bottom} ${firstX},${bottom}" fill="rgba(255,32,32,0.06)" stroke="none"/>`;
  }
  // Line segments coloured by avg wait
  let lineSegs = '';
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i], p2 = points[i + 1];
    lineSegs += `<line x1="${toX(p1.ts).toFixed(1)}" y1="${toY(p1.avgWait).toFixed(1)}"
                       x2="${toX(p2.ts).toFixed(1)}" y2="${toY(p2.avgWait).toFixed(1)}"
                       stroke="${colorFor((p1.avgWait + p2.avgWait) / 2)}" stroke-width="2" stroke-linecap="round"/>`;
  }
  // Dots
  const dots = points.map(p => {
    const d = new Date(p.ts);
    return `<circle cx="${toX(p.ts).toFixed(1)}" cy="${toY(p.avgWait).toFixed(1)}" r="${mini ? 2.5 : 3}"
              fill="${colorFor(p.avgWait)}" stroke="#111" stroke-width="1.2">
            <title>${fmtAxis(d)} — ${Math.round(p.avgWait)} min (n=${p.count})</title></circle>`;
  }).join('');
  // X axis labels
  const xLabels = `
    <text x="${ml}" y="${H - 2}" text-anchor="start" fill="#333" font-size="6.5" font-family="monospace">${fmtAxis(eventStart)}</text>
    <text x="${W - mr}" y="${H - 2}" text-anchor="end" fill="#333" font-size="6.5" font-family="monospace">${fmtAxis(eventEnd)}</text>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="pem-q-svg" aria-label="${t('live.queue_chart_aria')}">
    ${gridLines}${fillPath}${lineSegs}${dots}${xLabels}
  </svg>`;
}

/** Merges server timeline with the current user's personal data point. */
function withPersonalPoint(serverPoints, eventId) {
  if (!myQueueStartTime) return [...serverPoints];
  // Only include personal data for the event the user actually joined
  if (!userPresence || Number(userPresence.event_id) !== Number(eventId)) return [...serverPoints];
  const end = myClubEntryTime || new Date();
  const waitMinutes = Math.max(1, Math.round((end - myQueueStartTime) / 60000));
  const ts = myQueueStartTime.getTime();
  // Remove any server bucket that overlaps with our exact personal point, then add ours
  const filtered = serverPoints.filter(p => Math.abs(p.ts - ts) >= 15 * 60000);
  return [...filtered, { ts, avgWait: waitMinutes, count: 1 }].sort((a, b) => a.ts - b.ts);
}

function renderLiveQueueChart() {
  const el = document.getElementById('liveQueueChart');
  if (!el) return;
  const eventId = getPresenceEventId();
  const ev = allEvents.find(e => Number(e.id) === Number(eventId));
  const points = withPersonalPoint(liveEventData.queueTimeline || [], eventId);
  renderQueueChart(points, ev, el);
}

function renderCardQueueChart(evId) {
  const el = document.querySelector(`.event-card[data-event-id="${evId}"] .event-queue-chart`);
  if (!el) return;
  const server = queueTimelineByEventId.get(Number(evId)) || [];
  const points = withPersonalPoint(server, evId);
  const ev = allEvents.find(e => Number(e.id) === Number(evId));
  renderQueueChart(points, ev, el, { mini: true });
}

function buildQueueChartRow(evId) {
  const server = queueTimelineByEventId.get(Number(evId)) || [];
  const points = withPersonalPoint(server, evId);
  const empty  = !points.length;
  return `<div class="event-queue-row">
    <span class="eqs-label">${t('queue.label')}</span>
    <div class="event-queue-chart${empty ? ' event-queue-chart--empty' : ''}">${empty ? `<span class="eqs-empty">${t('queue.nobody_yet')} — ${t('queue.join_hint')}</span>` : ''}</div>
  </div>`;
}

function buildMergedRatingsForEvent(eventId) {
  const userRatingsForEvent = [];
  for (const [key, value] of userActRatings.entries()) {
    if (!value) continue;
    const colon = key.lastIndexOf(':');
    if (colon !== -1 && Number(key.slice(colon + 1)) === eventId) userRatingsForEvent.push(value);
  }
  const userActIds = new Set(userRatingsForEvent.map(r => r.act_id));
  return [
    ...(liveEventData.allRatings || []).filter(r => !userActIds.has(r.act_id)),
    ...userRatingsForEvent,
  ];
}

function syncEventHighlightsFromLocalRatings(eventId) {
  const ev = allEvents.find(e => Number(e.id) === Number(eventId));
  if (!ev) return;
  const acts = sortActs(ev.event_acts || []);
  const spotlights = computeEventSpotlights(acts, buildMergedRatingsForEvent(Number(eventId)));
  if (!spotlights) {
    eventHighlights.delete(Number(eventId));
    return;
  }
  eventHighlights.set(Number(eventId), {
    bestActId: spotlights.best?.acts?.id ? Number(spotlights.best.acts.id) : null,
    surpriseActId: spotlights.surprise?.acts?.id ? Number(spotlights.surprise.acts.id) : null,
    hiddenGemActId: spotlights.hiddenGem?.acts?.id ? Number(spotlights.hiddenGem.acts.id) : null,
  });
}

function rerenderEventCardInPlace(eventId) {
  const cardEl = document.querySelector(`.event-card[data-event-id="${eventId}"]`);
  const ev = allEvents.find(e => Number(e.id) === Number(eventId));
  if (!cardEl || !ev) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderEventCard(ev, getNextActIds(allEvents)).trim();
  const nextCard = wrapper.firstElementChild;
  if (!nextCard) return;
  cardEl.className = nextCard.className;
  cardEl.innerHTML = nextCard.innerHTML;
}

function updateLiveSpotlights() {
  const container = document.getElementById('liveSpotlightCards');
  const eventId = getPresenceEventId();
  const ev = allEvents.find(e => Number(e.id) === eventId);
  if (!container || !ev) return;
  const acts = sortActs(ev.event_acts || []);
  const spotlights = computeEventSpotlights(acts, buildMergedRatingsForEvent(eventId));
  container.innerHTML = renderEventSpotlightCards(spotlights || { best: null, surprise: null, hiddenGem: null });
}

function renderLivePanel() {
  const panel = document.getElementById('livePanel');
  if (!panel) return;
  // Don't interrupt user editing a time input
  if (document.activeElement?.classList.contains('live-time-input')) return;
  const previousScrollTop = panel.querySelector('.live-panel-body')?.scrollTop ?? 0;

  // Goodbye screen: shown right after leaving, before user closes with X
  if (liveGoodbyeScreen && liveGoodbyeEvent && livePanelExpanded) {
    const gev = liveGoodbyeEvent;
    panel.innerHTML = `
      <div class="live-panel-topbar live-panel-fullscreen-header">
        <span class="live-panel-dot"></span>
        <div class="live-panel-info">
          <span class="live-panel-event-name">${gev.event_name}</span>
          <span class="live-panel-venue">${gev.clubs?.name ?? ''}</span>
        </div>
        <button class="live-close-btn" data-live-action="toggle-expand" aria-label="${t('common.close')}">×</button>
      </div>
      <div class="live-panel-body" style="display:block">
        <div class="live-section live-goodbye-section">
          <div class="live-goodbye-icon">✓</div>
          <div class="live-goodbye-title">${t('live.goodbye_title')}</div>
          <div class="live-goodbye-sub">${t('live.goodbye_sub', { event: gev.event_name })}</div>
        </div>
      </div>`;
    panel.setAttribute('aria-hidden', 'false');
    panel.classList.add('open', 'fullscreen');
    document.body.classList.add('live-mode-active');
    return;
  }

  // Full read-only view: after goodbye screen was closed, reopened via "Live ▲"
  const isGoodbyeMode = !!liveGoodbyeEvent && !userPresence && !liveGoodbyeScreen;

  const eventId = isGoodbyeMode ? Number(liveGoodbyeEvent.id) : getPresenceEventId();
  // In goodbye mode: only show panel when expanded (no collapsed bar)
  if (!eventId || (!userPresence && !isGoodbyeMode) || (isGoodbyeMode && !livePanelExpanded)) { hideLivePanel(); return; }

  const ev = isGoodbyeMode ? (allEvents.find(e => Number(e.id) === eventId) || liveGoodbyeEvent) : allEvents.find(e => Number(e.id) === eventId);
  if (!ev) { hideLivePanel(); return; }

  const status = userPresence?.status ?? 'left';
  const statusLabel = status === 'queue' ? t('live.status_queue') : t('live.status_inclub');

  // timetable
  const acts = sortActs(ev.event_acts || []);
  const mergedRatings = buildMergedRatingsForEvent(eventId);
  const spotlights = computeEventSpotlights(acts, mergedRatings);
  const spotlightHtml = renderEventSpotlightCards(spotlights || { best: null, surprise: null, hiddenGem: null });
  const timetableHtml = acts.length
    ? acts.map(a => {
        const s = fmtTime(a.start_time), e2 = fmtTime(a.end_time);
        const timeStr = s && e2 ? `${s}–${e2}` : s ? t('act.from', { time: s }) : t('live.tba');
        const actId = a.acts?.id ?? null;
        const numActId = actId ? Number(actId) : null;
        const isActFavorite = numActId ? favoriteActIds.has(numActId) : false;
        const avgHtml = buildActLeftHtml(actId);
        const followBtn = actId
          ? `<button class="act-follow-btn${isActFavorite ? ' active' : ''}" type="button" data-action="toggle-favorite-act" data-act-id="${actId}" aria-pressed="${isActFavorite}">${isActFavorite ? '♥' : '♡'}</button>`
          : '';
        const existingLiveRating = actId && sessionUser ? userActRatings.get(`${actId}:${ev.id}`) : null;
        const stars = [1,2,3,4,5].map(i =>
          `<span class="pem-star${existingLiveRating?.rating >= i ? ' filled' : ''}" data-star="${i}">★</span>`
        ).join('');
        const isSurprise = numActId && !!userActRatings.get(`${numActId}:${ev.id}`)?.was_surprise;
        const rateBtn = !a.canceled && actId && sessionUser
          ? `<div class="pem-act-rating-col live-act-rating-col">
               <div class="pem-stars" data-live-act-id="${actId}" data-act-id="${actId}">${stars}</div>
               <button class="pem-surprise-btn${isSurprise ? ' active' : ''}" data-live-surprise-act-id="${actId}" data-act-id="${actId}" type="button" title="${t('rating.surprise')}">${t('live.surprise_btn')}</button>
             </div>`
          : '<span class="live-act-rating-placeholder"></span>';
        return `
          <div class="live-act-row${isActFavorite ? ' artist-row--followed' : ''}${a.canceled ? ' act-canceled' : ''}">
            <div class="live-act-meta">
              ${avgHtml}
              ${followBtn || '<span class="live-act-follow-placeholder"></span>'}
            </div>
            <div class="artist-name live-act-name-wrap">
              <span class="artist-name-link live-act-name" ${actId ? `data-act-id="${actId}"` : ''} data-act-name="${a.acts?.name ?? '?'}">${a.acts?.name ?? '?'}</span>
              <div class="pem-act-time live-inline-act-time">${a.canceled ? t('act.canceled') : timeStr}</div>
            </div>
            <div class="artist-row-right live-act-side">
              ${rateBtn}
            </div>
          </div>`;
      }).join('')
    : `<span class="time-tba">${t('empty.no_acts')}</span>`;

  const personalHtml = (() => {
    if (isGoodbyeMode) {
      const qVal = formatTimeInput(myQueueStartTime);
      const cVal = formatTimeInput(myClubEntryTime);
      const waitResult = myQueueStartTime && myClubEntryTime
        ? `<div class="live-wait-result"><span class="live-wait-label">${t('live.wait_time')}</span><strong>${fmtWaitTime(myQueueStartTime, myClubEntryTime)}</strong></div>`
        : '';
      return `
        <div class="live-section live-section--personal">
          <div class="live-section-head">
            <div class="live-section-label">${t('live.section_night')}</div>
            <span class="live-left-badge">${t('live.status_left')}</span>
          </div>
          <div class="live-time-row">
            ${myQueueStartTime ? `<div class="live-time-field"><label class="live-time-label">${t('live.queue_entry')}</label><input type="time" class="live-time-input" id="liveQueueTimeInput" value="${qVal}"></div>` : ''}
            ${myClubEntryTime  ? `<div class="live-time-field"><label class="live-time-label">${t('live.club_entry')}</label><input type="time" class="live-time-input" id="liveClubTimeInput" value="${cVal}"></div>` : ''}
          </div>
          ${waitResult}
        </div>`;
    }
    const qVal = formatTimeInput(myQueueStartTime);
    const cVal = formatTimeInput(myClubEntryTime);
    const waitResult = myQueueStartTime && status === 'in_club' && myClubEntryTime
      ? `<div class="live-wait-result"><span class="live-wait-label">${t('live.wait_time')}</span><strong>${fmtWaitTime(myQueueStartTime, myClubEntryTime)}</strong></div>`
      : myQueueStartTime
      ? `<div class="live-wait-result"><span class="live-wait-label">${t('live.in_queue_since')}</span><strong>${fmtWaitTime(myQueueStartTime, null)}</strong></div>`
      : '';
    const topAction = status === 'queue'
      ? `<div class="live-entry-actions">
           <button class="event-action-button live-denied-btn" data-live-action="denied" data-event-id="${eventId}">${t('live.denied')}</button>
           <button class="event-action-button live-next-btn" data-live-action="next-status" data-event-id="${eventId}">${t('live.enter_club')}</button>
         </div>`
      : `<button class="event-action-button live-leave-btn live-leave-btn--top" data-live-action="leave" data-event-id="${eventId}">${t('live.leave_club')}</button>`;
    return `
      <div class="live-section live-section--personal">
        <div class="live-section-head">
          <div class="live-section-label">${t('live.section_night')}</div>
          ${topAction}
        </div>
        <div class="live-time-row">
          <div class="live-time-field">
            <label class="live-time-label">${t('live.queue_entry')}</label>
            <input type="time" class="live-time-input" id="liveQueueTimeInput" value="${qVal}">
          </div>
          ${status === 'in_club' ? `
          <div class="live-time-field">
            <label class="live-time-label">${t('live.club_entry')}</label>
            <input type="time" class="live-time-input" id="liveClubTimeInput" value="${cVal}">
          </div>` : ''}
        </div>
        ${waitResult}
      </div>`;
  })();

  const markup = `
    <div class="live-panel-topbar${livePanelExpanded ? ' live-panel-fullscreen-header' : ''}"
         ${livePanelExpanded ? '' : 'data-live-action="toggle-expand"'}
         >
      <span class="live-panel-dot"></span>
      <div class="live-panel-info">
        <span class="live-panel-event-name">${ev.event_name}</span>
        <span class="live-panel-venue">${ev.clubs?.name ?? ''}</span>
      </div>
      ${livePanelExpanded
        ? `<button class="live-close-btn" data-live-action="toggle-expand" aria-label="${t('common.close')}">×</button>`
        : `<div class="live-bar-cta">
             <span class="live-status-chip live-status-${status}">${statusLabel}</span>
             <span class="live-bar-open-hint">${t('live.open_hint')}</span>
           </div>`
      }
    </div>
    <div class="live-panel-body" style="display:${livePanelExpanded ? 'block' : 'none'}">
      ${personalHtml}
      <div class="live-section">
        <div class="live-section-label">${t('live.section_queue')}</div>
        <div class="pem-q-chart-wrap" id="liveQueueChart"></div>
      </div>
      <div class="live-section">
        <div class="live-section-label">${t('live.section_spotlights')}</div>
        <div id="liveSpotlightCards">${spotlightHtml}</div>
      </div>
      <div class="live-section">
        <div class="live-section-label">${t('live.section_timetable')}</div>
        <div class="pem-rating-hint">${t('live.surprise_hint')}</div>
        <div class="live-timetable">${timetableHtml}</div>
      </div>
    </div>
  `;

  const signature = buildLivePanelSignature(ev, status, getHype(ev.id).total_hype);

  if (signature !== livePanelRenderSignature) {
    panel.innerHTML = markup;
    const body = panel.querySelector('.live-panel-body');
    if (body) body.scrollTop = previousScrollTop;
  }
  livePanelRenderSignature = signature;
  renderLiveQueueChart();
  panel.setAttribute('aria-hidden', 'false');
  panel.classList.add('open');
  panel.classList.toggle('fullscreen', livePanelExpanded);
  document.body.classList.add('live-mode-active');

  if (livePanelExpanded) setTimeout(renderQueueGraph, 10);
}

function initLivePanel() {
  const panel = document.getElementById('livePanel');
  if (!panel) return;
  panel.addEventListener('mouseover', e => {
    const star = e.target.closest('.pem-star');
    const starsEl = e.target.closest('.pem-stars');
    if (!star || !starsEl) return;
    const allStars = starsEl.querySelectorAll('.pem-star');
    const idx = Number(star.dataset.star) - 1;
    allStars.forEach((s, i) => s.classList.toggle('preview', i <= idx));
  });
  panel.addEventListener('mouseout', e => {
    const starsEl = e.target.closest('.pem-stars');
    if (!starsEl || starsEl.contains(e.relatedTarget)) return;
    starsEl.querySelectorAll('.pem-star').forEach(s => s.classList.remove('preview'));
  });
  panel.addEventListener('click', async e => {
    const star = e.target.closest('.pem-star');
    if (star) {
      const starsEl = star.closest('.pem-stars');
      const actId = Number(starsEl?.dataset.liveActId || starsEl?.dataset.actId);
      const eventId = Number(getPresenceEventId() || liveGoodbyeEvent?.id);
      if (!actId || !eventId || !sessionUser || !supabaseClient) return;
      const rating = Number(star.dataset.star);
      const allStars = starsEl.querySelectorAll('.pem-star');
      allStars.forEach((s, i) => s.classList.toggle('filled', i < rating));
      allStars.forEach(s => s.classList.remove('preview'));
      const cacheKey = `${actId}:${eventId}`;
      const existingRating = userActRatings.get(cacheKey);
      const wasSurprise = existingRating?.was_surprise ?? false;
      const payload = { user_id: sessionUser.id, act_id: actId, event_id: eventId, rating, was_surprise: wasSurprise, was_best_act: false };
      userActRatings.set(cacheKey, payload);
      syncEventHighlightsFromLocalRatings(eventId);
      rerenderEventCardInPlace(eventId);
      updateLiveSpotlights();
      try {
        if (existingRating) {
          await supabaseClient.from('act_ratings').update(payload)
            .eq('user_id', sessionUser.id).eq('act_id', actId).eq('event_id', eventId);
        } else {
          await supabaseClient.from('act_ratings').insert(payload);
        }
      } catch (err) {
        console.warn('Live rating save error:', err.message || err);
      }
      return;
    }

    const surpriseBtn = e.target.closest('.pem-surprise-btn[data-live-surprise-act-id]');
    if (surpriseBtn) {
      const actId = Number(surpriseBtn.dataset.liveSurpriseActId || surpriseBtn.dataset.actId);
      const eventId = Number(getPresenceEventId() || liveGoodbyeEvent?.id);
      if (!actId || !eventId || !sessionUser || !supabaseClient) return;
      const wasActive = surpriseBtn.classList.contains('active');
      const newState = !wasActive;
      const cacheKey = `${actId}:${eventId}`;
      const dbExisting = userActRatings.get(cacheKey); // vor lokalem Update erfassen

      // Sofortiges DOM-Update (kein renderLivePanel → kein Flickern)
      const panel = document.getElementById('livePanel');
      panel?.querySelectorAll('.pem-surprise-btn[data-live-surprise-act-id]').forEach(b => b.classList.remove('active'));
      if (newState) surpriseBtn.classList.add('active');

      // Lokalen Cache aktualisieren
      clearLocalSurpriseForEvent(eventId, newState ? actId : null);
      if (newState) {
        userActRatings.set(cacheKey, { ...(dbExisting || { act_id: actId, event_id: eventId, rating: 0 }), was_surprise: true });
      }
      syncEventHighlightsFromLocalRatings(eventId);
      rerenderEventCardInPlace(eventId);
      updateLiveSpotlights();

      try {
        await supabaseClient.from('act_ratings')
          .update({ was_surprise: false })
          .eq('user_id', sessionUser.id)
          .eq('event_id', eventId);

        if (newState) {
          if (dbExisting) {
            await supabaseClient.from('act_ratings')
              .update({ was_surprise: true })
              .eq('user_id', sessionUser.id).eq('act_id', actId).eq('event_id', eventId);
          } else {
            await supabaseClient.from('act_ratings').insert(
              { user_id: sessionUser.id, act_id: actId, event_id: eventId, rating: 0, was_surprise: true, was_best_act: false }
            );
          }
        }
      } catch (err) {
        console.warn('Live surprise update error:', err.message || err);
      }
      return;
    }

    // Handle act follow/rate actions inside live panel
    const actionTarget = e.target.closest('[data-action]');
    if (actionTarget) {
      const action = actionTarget.dataset.action;
      if (action === 'toggle-favorite-act') {
        const actId = Number(actionTarget.dataset.actId);
        await toggleFavorite('act', actId, { rerender: false, onChange: () => { syncActFollowButtons(actId); renderLivePanel(); } });
        return;
      }
    }
    const target = e.target.closest('[data-live-action]');
    if (!target) return;
    e.stopPropagation();
    const action = target.dataset.liveAction;
    const eventId = Number(target.dataset.eventId || getPresenceEventId());

    if (action === 'toggle-expand') {
      if (livePanelExpanded || liveGoodbyeScreen) {
        const p = document.getElementById('livePanel');
        p.classList.add('live-panel--closing');
        const onEnd = (e) => {
          if (e.propertyName !== 'transform') return;
          p.removeEventListener('transitionend', onEnd);
          p.classList.remove('live-panel--closing');
          livePanelExpanded = false;
          liveGoodbyeScreen = false; // goodbye msg shown — next open shows full view
          // liveGoodbyeEvent stays so "Live ▲" button remains on card
          renderLivePanel();         // hides panel (userPresence=null, goodbye screen=false)
        };
        p.addEventListener('transitionend', onEnd);
      } else {
        livePanelExpanded = true;
        renderLivePanel();
      }
      return;
    }
    if (action === 'queue-report') { await submitQueueReport(eventId, target.dataset.level); return; }
    if (action === 'hype')         { await toggleHype(eventId); renderLivePanel();           return; }
    if (action === 'denied')       { await handleDenied(eventId); return; }
    if (action === 'next-status') {
      const next = userPresence?.status === 'queue' ? 'in_club' : null;
      if (next) await setPresenceStatus(eventId, next);
      return;
    }
    if (action === 'leave') { await setPresenceStatus(eventId, 'left'); return; }
  });

  panel.addEventListener('change', e => {
    const input = e.target.closest('.live-time-input');
    if (!input) return;
    if (input.id === 'liveQueueTimeInput') {
      myQueueStartTime = parseTimeInputToDate(input.value) || myQueueStartTime;
      renderLivePanel();
    }
    if (input.id === 'liveClubTimeInput') {
      myClubEntryTime = parseTimeInputToDate(input.value) || myClubEntryTime;
      renderLivePanel();
    }
  });
}

// ── helper: build presence button HTML for event card ────────────────────
function buildPresenceBtn(evId) {
  if (!sessionUser || demoMode) return '';
  const eventId = Number(evId);
  const pid = getPresenceEventId();
  // After leaving: show "Live ▲" only for the event just left
  if (!pid) {
    if (liveGoodbyeEvent && Number(liveGoodbyeEvent.id) === eventId) {
      return `<button class="event-action-button presence-btn presence-live-open" type="button" data-action="open-live-panel"><span class="live-btn-dot"></span>Live ▲</button>`;
    }
    const ev = allEvents.find(e => Number(e.id) === eventId);
    const eventStart = ev ? getEventStartDateTime(ev) : null;
    const queueOpenAt = eventStart ? new Date(eventStart.getTime() - 10 * 60 * 60 * 1000) : null;
    if (queueOpenAt && new Date() < queueOpenAt) {
      return `<button class="event-action-button presence-btn presence-locked" type="button" data-action="queue-locked-info" data-event-id="${eventId}">${t('live.queue_locked')}</button>`;
    }
    return `<button class="event-action-button presence-btn presence-cta" type="button" data-action="set-presence" data-event-id="${eventId}" data-next-status="queue"><span class="live-btn-dot"></span>${t('live.join_queue')}</button>`;
  }
  if (pid === eventId) {
    if (userPresence?.status === 'queue') {
      return `<button class="event-action-button presence-btn presence-live-open" type="button" data-action="open-live-panel"><span class="live-btn-dot"></span>${t('live.queue_open')}</button>`;
    }
    if (userPresence?.status === 'in_club') {
      return `<button class="event-action-button presence-btn presence-live-open" type="button" data-action="open-live-panel"><span class="live-btn-dot live-btn-dot--club"></span>${t('live.in_club_open')}</button>`;
    }
  }
  return '';
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3: ACT RATINGS
// ═══════════════════════════════════════════════════════════════════════════

async function openRatingModal({ actId, actName, eventId, eventName }) {
  if (!ensureAuthenticated('Ratings')) return;
  ratingState = { actId, actName, eventId, eventName };
  selectedRating = 0;

  const cacheKey = `${actId}:${eventId}`;
  let existing = userActRatings.get(cacheKey);

  // Fetch from DB if not already cached (e.g. opened directly from event card)
  if (!existing && supabaseClient && sessionUser) {
    try {
      const { data } = await supabaseClient
        .from('act_ratings')
        .select('act_id, event_id, rating, was_best_act, was_surprise')
        .eq('user_id', sessionUser.id)
        .eq('act_id', actId)
        .eq('event_id', eventId)
        .maybeSingle();
      if (data) { userActRatings.set(cacheKey, data); existing = data; }
    } catch (_) {}
  }

  document.getElementById('ratingActName').textContent = actName;
  document.getElementById('ratingEventName').textContent = eventName;
  document.getElementById('ratingFlagSurprise').checked = existing?.was_surprise ?? false;
  document.getElementById('ratingMessage').textContent = '';

  selectedRating = existing?.rating ?? 0;
  updateRatingStars(selectedRating);

  const overlay = document.getElementById('ratingOverlay');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  syncBodyLock();
}

function closeRatingModal() {
  ratingState = null;
  selectedRating = 0;
  const overlay = document.getElementById('ratingOverlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  syncBodyLock();
}

function updateRatingStars(value) {
  selectedRating = value;
  document.querySelectorAll('.rating-star').forEach(btn => {
    const star = Number(btn.dataset.star);
    btn.classList.toggle('active', star <= value);
  });
  const submit = document.getElementById('ratingSubmit');
  if (submit) submit.disabled = value === 0;
}

function clearLocalSurpriseForEvent(eventId, keepActId = null) {
  for (const [key, value] of userActRatings.entries()) {
    if (!value) continue;
    const colon = key.lastIndexOf(':');
    if (colon === -1) continue;
    if (Number(key.slice(colon + 1)) !== Number(eventId)) continue;
    if (keepActId !== null && Number(value.act_id) === Number(keepActId)) continue;
    userActRatings.set(key, { ...value, was_surprise: false });
  }
}

async function submitActRating() {
  if (!ratingState || selectedRating === 0 || !supabaseClient || !sessionUser) return;
  const submit = document.getElementById('ratingSubmit');
  if (submit) submit.disabled = true;
  const msgEl = document.getElementById('ratingMessage');
  if (msgEl) msgEl.textContent = t('rating.saving');

  const { actId, actName, eventId } = ratingState;
  const wasSurprise = document.getElementById('ratingFlagSurprise')?.checked ?? false;

  try {
    // Check if rating already exists for this (user, act, event)
    const { data: existingRow } = await supabaseClient
      .from('act_ratings')
      .select('id')
      .eq('user_id', sessionUser.id)
      .eq('act_id', actId)
      .eq('event_id', eventId)
      .maybeSingle();

    if (wasSurprise) {
      const { error: clearSurpriseError } = await supabaseClient
        .from('act_ratings')
        .update({ was_surprise: false })
        .eq('user_id', sessionUser.id)
        .eq('event_id', eventId);
      if (clearSurpriseError) throw clearSurpriseError;
      clearLocalSurpriseForEvent(eventId, actId);
    }

    if (existingRow) {
      const { error } = await supabaseClient
        .from('act_ratings')
        .update({ rating: selectedRating, was_best_act: false, was_surprise: wasSurprise })
        .eq('user_id', sessionUser.id)
        .eq('act_id', actId)
        .eq('event_id', eventId);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient
        .from('act_ratings')
        .insert({ user_id: sessionUser.id, act_id: actId, event_id: eventId, rating: selectedRating, was_best_act: false, was_surprise: wasSurprise });
      if (error) throw error;
    }

    // Update local cache
    const key = `${actId}:${eventId}`;
    userActRatings.set(key, { act_id: actId, event_id: eventId, rating: selectedRating, was_best_act: false, was_surprise: wasSurprise });

    // Refresh the visible card immediately without replacing the whole node.
    syncEventHighlightsFromLocalRatings(eventId);
    rerenderEventCardInPlace(eventId);

    if (msgEl) msgEl.textContent = t('rating.saved');
    setTimeout(() => {
      closeRatingModal();
      // Reopen artist popup to refresh stats
      openArtistPopup(actId, actName);
    }, 700);
  } catch (err) {
    console.warn('Rating submit error:', err.message || err);
    if (msgEl) msgEl.textContent = t('rating.error');
    if (submit) submit.disabled = false;
  }
}

function initRatingModal() {
  document.getElementById('ratingOverlayBg')?.addEventListener('click', closeRatingModal);
  document.getElementById('ratingModalClose')?.addEventListener('click', closeRatingModal);
  document.getElementById('ratingSubmit')?.addEventListener('click', submitActRating);
  document.getElementById('ratingStars')?.addEventListener('click', e => {
    const star = e.target.closest('.rating-star');
    if (star) updateRatingStars(Number(star.dataset.star));
  });
  document.getElementById('ratingStars')?.addEventListener('mouseover', e => {
    const star = e.target.closest('.rating-star');
    if (!star) return;
    const val = Number(star.dataset.star);
    document.querySelectorAll('.rating-star').forEach(btn => {
      btn.classList.toggle('hover', Number(btn.dataset.star) <= val);
    });
  });
  document.getElementById('ratingStars')?.addEventListener('mouseleave', () => {
    document.querySelectorAll('.rating-star').forEach(btn => btn.classList.remove('hover'));
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('ratingOverlay')?.classList.contains('open')) closeRatingModal();
  });
}

async function init() {
  if (window.componentsReady?.then) await window.componentsReady;
  document.addEventListener('setradar:citychange', e => applySelectedCity(e.detail?.city));
  initAuthUi();
  initSortControls();
  initSearch();
  initArtistPopup();
  initRatingModal();
  initSwipe();
  initLivePanel();
  bindActionHandlers();
  const hasUrl = !isPlaceholderValue(SUPABASE_URL), hasKey = !isPlaceholderValue(SUPABASE_KEY), legacy = isLegacyJwtKey(SUPABASE_KEY), configured = hasUrl && hasKey && !legacy;
  if (configured) {
    if (!window.supabase?.createClient) {
      console.warn('Supabase SDK nicht geladen.');
      availableCities = ['Berlin'];
      syncCitySelectorUi();
      await refreshEventData();
      setInterval(refreshAmbientUi, 30 * 1000);
      return;
    }
    const { createClient } = window.supabase;
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { storageKey: 'setradar-auth' },
    });
    supabaseAnonClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'setradar-anon-auth' },
    });
    await hydrateSession();
    subscribeAuthState();
    await loadAvailableCities();
  } else if (legacy) {
    console.warn('Supabase Legacy-Key erkannt. Bitte einen Publishable Key (sb_publishable_...) setzen.');
    availableCities = ['Berlin'];
    syncCitySelectorUi();
  } else {
    availableCities = ['Berlin'];
    syncCitySelectorUi();
  }
  await refreshEventData();
  // Jump to specific date/event or club from profile navigation
  const _hash = window.location.hash.slice(1);
  if (_hash) {
    const _params = new URLSearchParams(_hash);
    const _date = _params.get('date');
    const _evId = _params.get('event');
    const _club = _params.get('club');
    if (_date) jumpToEvent(_date, _evId || null);
    else if (_club) showClubSearch(_club);
  }
  if (supabaseClient && !demoMode) subscribeRealtime();
  setInterval(refreshAmbientUi, 30 * 1000);
}
init();
