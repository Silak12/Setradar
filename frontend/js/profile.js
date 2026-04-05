/**
 * profile.js - Setradar Profilseite
 */

const SUPABASE_URL = CONFIG.SUPABASE_URL;
const SUPABASE_KEY = CONFIG.SUPABASE_PUBLISHABLE_KEY || CONFIG.SUPABASE_ANON;
const EventCardUtils = window.SetradarEventCards || {};

// ── Level System ─────────────────────────────────────────────────────────────
const LEVELS = [
  { name: 'Newcomer',  min: 0  },
  { name: 'Scout',     min: 5  },
  { name: 'Explorer',  min: 15 },
  { name: 'Regular',   min: 30 },
  { name: 'Veteran',   min: 60 },
  { name: 'Legend',    min: 100 },
];

function computeLevel(score) {
  let lvl = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (score >= LEVELS[i].min) lvl = i;
  }
  const current = LEVELS[lvl];
  const next = LEVELS[lvl + 1] || null;
  const progress = next
    ? Math.round(((score - current.min) / (next.min - current.min)) * 100)
    : 100;
  const progressLabel = next
    ? `${score - current.min} / ${next.min - current.min}`
    : 'Max';
  return { index: lvl + 1, name: current.name, progress, progressLabel };
}

// ── Badges (client-side computed from stats) ─────────────────────────────────
function computeBadges({ hyeCount, actCount, clubCount }) {
  const earned = [];
  if (hyeCount >= 1)  earned.push({ icon: '⚡', name: 'Erstes Interesse',  desc: 'Erstes Event interessiert' });
  if (actCount >= 1)  earned.push({ icon: '🎵', name: 'Act-Fan',          desc: 'Erstem Act gefolgt' });
  if (actCount >= 5)  earned.push({ icon: '🎛️', name: 'Scout',            desc: '5 Acts gefolgt' });
  if (actCount >= 10) earned.push({ icon: '📡', name: 'Radar',            desc: '10 Acts gefolgt' });
  if (clubCount >= 1) earned.push({ icon: '🏴', name: 'Club-Stamm',       desc: 'Erstem Club gefolgt' });
  if (clubCount >= 3) earned.push({ icon: '🏛️', name: 'Club-Crawler',     desc: '3 Clubs gefolgt' });
  if (hyeCount >= 10) earned.push({ icon: '🔥', name: 'Interesse-Maschine', desc: '10 Events interessiert' });
  if (hyeCount >= 30) earned.push({ icon: '💀', name: 'Veteran',          desc: '30 Events interessiert' });
  return earned;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatSince(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return 'Seit ' + d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

function formatEventDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(`${dateStr}T00:00:00`);
  const weekdays = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  return `${weekdays[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getTodayLocalDateStr() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fmtTime(value) {
  return value ? String(value).slice(0, 5) : null;
}

function zeroHype() {
  return { seed_hype: 0, real_hype: 0, total_hype: 0 };
}

function getHype(eventId) {
  return hypeTotalsByEventId.get(Number(eventId)) || zeroHype();
}

function setHype(eventId, stats) {
  hypeTotalsByEventId.set(Number(eventId), {
    seed_hype: Number(stats.seed_hype) || 0,
    real_hype: Number(stats.real_hype) || 0,
    total_hype: Number(stats.total_hype) || 0,
  });
}

function bumpHype(eventId, delta) {
  const current = getHype(eventId);
  setHype(eventId, {
    seed_hype: current.seed_hype,
    real_hype: Math.max(0, current.real_hype + delta),
    total_hype: Math.max(0, current.total_hype + delta),
  });
}

function visibleEventIds(events = []) {
  return [...new Set((events || []).map(ev => Number(ev?.id)).filter(Number.isFinite))];
}

function getMinutesUntil(startTimeStr, eventDateStr) {
  if (!startTimeStr || !eventDateStr || eventDateStr !== getTodayLocalDateStr()) return null;
  const now = new Date();
  const [hours, minutes] = startTimeStr.slice(0, 5).split(':').map(Number);
  const setTime = new Date();
  setTime.setHours(hours, minutes, 0, 0);
  if (hours < 14) setTime.setDate(setTime.getDate() + 1);
  const diffMin = Math.round((setTime - now) / 60000);
  return diffMin < 0 ? null : diffMin;
}

function fmtCountdown(mins) {
  if (mins < 60) return `in ${mins}min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return `in ${hours}:${String(rest).padStart(2, '0')}h`;
}

function getNextActIds(events) {
  const upcoming = [];
  events.forEach(ev => {
    if (ev.event_date !== getTodayLocalDateStr()) return;
    (ev.event_acts || []).forEach(act => {
      const mins = getMinutesUntil(fmtTime(act.start_time), ev.event_date);
      if (mins !== null) upcoming.push({ sortKey: mins, key: `${ev.id}_${act.sort_order}` });
    });
  });
  upcoming.sort((a, b) => a.sortKey - b.sortKey);
  return upcoming.slice(0, 3).map(item => item.key);
}

function getUserActAvg(actId) {
  if (!actId || !userActRatings.size) return null;
  const ratings = [];
  for (const [key, row] of userActRatings.entries()) {
    if (key.startsWith(`${actId}:`) && row.rating) ratings.push(row.rating);
  }
  return ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null;
}

function buildActLeftHtml(actId) {
  if (!actId || !sessionUser) return '<span class="artist-act-avg empty"></span>';
  const avg = getUserActAvg(actId);
  return avg !== null
    ? `<span class="artist-act-avg rated">${avg.toFixed(1)}</span>`
    : '<span class="artist-act-avg empty">—</span>';
}

// ── State ────────────────────────────────────────────────────────────────────
let supabaseClient = null;
let supabaseAnonClient = null;  // stateless anon client for public queries
let sessionUser = null;
let activeTab = 'acts';
let favoriteClubIds = new Set();
let userHypedEventIds = new Set();
let hypeTotalsByEventId = new Map();
let eventHighlights = new Map();
let expandedEventIds = new Set();
let profileHypedRows = [];

// Rated acts section state
let allRatedActs = [];
let ratedFilter = 0;      // 0 = all, 1–5 = exact star match
let ratedSort = 'avg-desc';
let ratedPageIdx = 0;
const RATED_PAGE_SIZE = 10;

// Followed acts section state
let allFollowedActs = [];
let followedPageIdx = 0;
const FOLLOWED_PAGE_SIZE = 10;

// Artist popup state
let favoriteActIds = new Set();
let userActRatings = new Map();   // key: `${actId}:${eventId}` → rating row
let ratingState = null;
let selectedRating = 0;

// ── Tabs ─────────────────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.profile-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.profile-tab').forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', String(b === btn));
      });
      document.querySelectorAll('.profile-tab-panel').forEach(panel => {
        const isActive = panel.id === `tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`;
        panel.classList.toggle('active', isActive);
        if (isActive) panel.removeAttribute('hidden');
        else panel.setAttribute('hidden', '');
      });
      activeTab = tab;
    });
  });
}

// ── Navbar auth ───────────────────────────────────────────────────────────────
function initNavbarAuth() {
  const btn = document.getElementById('navAuthButton');
  const pill = document.getElementById('navUserState');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!sessionUser) { window.location.href = 'index.html'; return; }
    await supabaseClient.auth.signOut().catch(() => {});
    window.location.href = 'index.html';
  });
  if (pill) {
    pill.removeAttribute('href');
    pill.style.cursor = 'default';
  }
}

function updateNavbar(displayName) {
  const pill = document.getElementById('navUserState');
  const btn = document.getElementById('navAuthButton');
  if (pill) pill.textContent = displayName || 'Angemeldet';
  if (btn) btn.textContent = 'Logout';
}

// ── Render helpers ────────────────────────────────────────────────────────────
function renderEmpty(container, message) {
  container.innerHTML = `<div class="profile-empty">${message}</div>`;
}

async function loadNavbarCities() {
  if (!window.SetradarCitySelector) return;
  const publicClient = supabaseAnonClient || supabaseClient;
  if (!publicClient) {
    window.SetradarCitySelector.setOptions(['Berlin']);
    return;
  }
  try {
    const { data, error } = await publicClient
      .from('cities')
      .select('name')
      .order('name');
    if (error) throw error;
    const cities = [...new Set((data || []).map(row => String(row.name || '').trim()).filter(Boolean))];
    window.SetradarCitySelector.setOptions(cities.length ? cities : ['Berlin']);
  } catch (err) {
    console.warn('Cities fetch error:', err.message || err);
    window.SetradarCitySelector.setOptions(['Berlin']);
  }
}

async function loadPublicHypes(events = []) {
  const ids = visibleEventIds(events);
  const nextMap = new Map();
  ids.forEach(id => nextMap.set(id, zeroHype()));
  const publicClient = supabaseAnonClient || supabaseClient;
  if (!publicClient || !ids.length) {
    hypeTotalsByEventId = nextMap;
    return;
  }
  try {
    const { data, error } = await publicClient
      .from('event_hype_totals')
      .select('event_id,total_hype,real_hype,seed_hype')
      .in('event_id', ids);
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

async function loadEventHighlights(events = []) {
  const ids = visibleEventIds(events);
  const publicClient = supabaseAnonClient || supabaseClient;
  if (!publicClient || !ids.length) {
    eventHighlights = new Map();
    return;
  }
  try {
    const { data, error } = await publicClient
      .from('event_act_highlights')
      .select('event_id, best_act_id, surprise_act_id')
      .in('event_id', ids);
    if (error) throw error;
    eventHighlights = new Map();
    (data || []).forEach(row => {
      eventHighlights.set(Number(row.event_id), {
        bestActId: row.best_act_id ? Number(row.best_act_id) : null,
        surpriseActId: row.surprise_act_id ? Number(row.surprise_act_id) : null,
      });
    });
  } catch (err) {
    console.warn('Highlights fetch error:', err.message || err);
    eventHighlights = new Map();
  }
}

function buildProfilePresenceBtn() {
  return '';
}

function getProfileEventCardContext(events) {
  return {
    nextActKeys: getNextActIds(events),
    expandedEventIds,
    eventHighlights,
    favoriteActIds,
    favoriteClubIds,
    sessionUser,
    userActRatings,
    userHypedEventIds,
    buildActLeftHtml,
    buildPresenceBtn: buildProfilePresenceBtn,
    fmtCountdown,
    fmtTime,
    getHype,
    getMinutesUntil,
    renderHeaderMeta(ev) {
      const parts = [];
      const dateLabel = formatEventDate(ev.event_date);
      const city = ev.clubs?.cities?.name;
      if (dateLabel && dateLabel !== '—') parts.push(dateLabel);
      if (city) parts.push(city);
      if (!parts.length) return '';
      return `<div class="event-header-meta event-header-meta--profile">${escapeHtml(parts.join(' • '))}</div>`;
    },
  };
}

function renderFollowedActsPage(animDir = 0) {
  const page    = document.getElementById('followedActsPage');
  const nav     = document.getElementById('followedActsNav');
  const counter = document.getElementById('followedActsCounter');
  const prevBtn = document.getElementById('followedActsPrev');
  const nextBtn = document.getElementById('followedActsNext');
  const totalEl = document.getElementById('followedActsTotal');
  if (!page) return;

  const acts = allFollowedActs;
  const totalPages = Math.ceil(acts.length / FOLLOWED_PAGE_SIZE) || 1;
  followedPageIdx = Math.max(0, Math.min(followedPageIdx, totalPages - 1));

  if (totalEl) totalEl.textContent = acts.length ? `(${acts.length})` : '';

  const showNav = acts.length > FOLLOWED_PAGE_SIZE;
  nav.style.display = showNav ? 'flex' : 'none';
  if (showNav) {
    const endIdx = Math.min((followedPageIdx + 1) * FOLLOWED_PAGE_SIZE, acts.length);
    counter.textContent = `${endIdx} / ${acts.length}`;
    prevBtn.disabled = followedPageIdx === 0;
    nextBtn.disabled = followedPageIdx === totalPages - 1;
  }

  const offset = followedPageIdx * FOLLOWED_PAGE_SIZE;
  const slice  = acts.slice(offset, offset + FOLLOWED_PAGE_SIZE);

  const doRender = () => {
    if (!acts.length) {
      page.innerHTML = `<div class="profile-empty">Noch keine Acts gefolgt.</div>`;
      return;
    }
    page.innerHTML = slice.map(a => `
      <div class="profile-list-item profile-act-link" data-act-id="${a.id}" data-act-name="${a.name}">
        <span class="profile-list-name">${a.name}</span>
        ${a.insta_name ? `<span class="profile-list-meta">@${a.insta_name}</span>` : ''}
      </div>
    `).join('');
  };

  if (animDir === 0) {
    page.style.transition = '';
    page.style.transform  = '';
    page.style.opacity    = '';
    doRender();
    return;
  }

  page.style.transition = 'transform 0.17s cubic-bezier(0.4,0,1,1), opacity 0.17s';
  page.style.transform  = `translateX(${animDir * -110}%) rotate(${animDir * -2}deg)`;
  page.style.opacity    = '0';
  setTimeout(() => {
    doRender();
    page.style.transition = 'none';
    page.style.transform  = `translateX(${animDir * 75}%) rotate(${animDir * 1.5}deg)`;
    page.style.opacity    = '0';
    void page.offsetWidth;
    page.style.transition = 'transform 0.28s cubic-bezier(0.25,1,0.5,1), opacity 0.22s';
    page.style.transform  = '';
    page.style.opacity    = '';
  }, 170);
}

function initFollowedActsSection(acts) {
  allFollowedActs = acts;
  followedPageIdx = 0;

  document.getElementById('followedActsPrev')?.addEventListener('click', () => {
    if (followedPageIdx > 0) { followedPageIdx--; renderFollowedActsPage(-1); }
  });
  document.getElementById('followedActsNext')?.addEventListener('click', () => {
    const total = Math.ceil(allFollowedActs.length / FOLLOWED_PAGE_SIZE);
    if (followedPageIdx < total - 1) { followedPageIdx++; renderFollowedActsPage(1); }
  });

  const slider = document.getElementById('followedActsSlider');
  if (slider) {
    let startX = null, startY = null, curX = null, swiping = false;
    const THRESHOLD = 50, MAX_RESIST = 40;

    slider.addEventListener('touchstart', e => {
      startX = e.changedTouches[0].clientX;
      startY = e.changedTouches[0].clientY;
      curX   = startX;
      swiping = false;
    }, { passive: true });

    slider.addEventListener('touchmove', e => {
      if (startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (!swiping) {
        if (Math.abs(dy) > Math.abs(dx) + 5) { startX = null; return; }
        if (Math.abs(dx) > 8) swiping = true;
        else return;
      }
      e.preventDefault();
      curX = e.changedTouches[0].clientX;
      const totalPages = Math.ceil(allFollowedActs.length / FOLLOWED_PAGE_SIZE);
      const page = document.getElementById('followedActsPage');
      if (!page) return;
      const atStart = followedPageIdx === 0;
      const atEnd   = followedPageIdx === totalPages - 1;
      let clamped = dx;
      if ((dx > 0 && atStart) || (dx < 0 && atEnd)) {
        clamped = dx > 0 ? Math.min(dx * 0.15, MAX_RESIST) : Math.max(dx * 0.15, -MAX_RESIST);
      }
      page.style.transition = 'none';
      page.style.transform  = `translateX(${clamped}px) rotate(${clamped * 0.005}deg)`;
      page.style.opacity    = String(1 - Math.min(Math.abs(clamped) / 250, 0.18));
    }, { passive: false });

    slider.addEventListener('touchend', () => {
      if (startX === null || !swiping) { startX = null; return; }
      const dx = curX - startX;
      const totalPages = Math.ceil(allFollowedActs.length / FOLLOWED_PAGE_SIZE);

      if (dx < -THRESHOLD && followedPageIdx < totalPages - 1) {
        followedPageIdx++;
        renderFollowedActsPage(1);
      } else if (dx > THRESHOLD && followedPageIdx > 0) {
        followedPageIdx--;
        renderFollowedActsPage(-1);
      } else {
        const page = document.getElementById('followedActsPage');
        if (page) {
          page.style.transition = 'transform 0.25s cubic-bezier(0.25,1,0.5,1), opacity 0.15s';
          page.style.transform  = '';
          page.style.opacity    = '';
        }
      }
      startX = null; swiping = false;
    });
  }

  renderFollowedActsPage(0);
}

function getFilteredSortedActs() {
  let acts = allRatedActs.filter(a => ratedFilter === 0 || Math.round(a.avg) === ratedFilter);
  if (ratedSort === 'avg-desc')   acts.sort((a, b) => b.avg - a.avg || b.count - a.count);
  else if (ratedSort === 'avg-asc')   acts.sort((a, b) => a.avg - b.avg || b.count - a.count);
  else if (ratedSort === 'count-desc') acts.sort((a, b) => b.count - a.count || b.avg - a.avg);
  else if (ratedSort === 'name-asc')  acts.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return acts;
}

function renderRatedActsPage(animDir = 0) {
  const page    = document.getElementById('ratedActsPage');
  const nav     = document.getElementById('ratedActsNav');
  const counter = document.getElementById('ratedActsCounter');
  const prevBtn = document.getElementById('ratedActsPrev');
  const nextBtn = document.getElementById('ratedActsNext');
  const totalEl = document.getElementById('ratedActsTotal');
  if (!page) return;

  const acts = getFilteredSortedActs();
  const totalPages = Math.ceil(acts.length / RATED_PAGE_SIZE) || 1;
  ratedPageIdx = Math.max(0, Math.min(ratedPageIdx, totalPages - 1));

  if (totalEl) totalEl.textContent = acts.length ? `(${acts.length})` : '';

  const showNav = acts.length > RATED_PAGE_SIZE;
  nav.style.display = showNav ? 'flex' : 'none';
  if (showNav) {
    const endIdx = Math.min((ratedPageIdx + 1) * RATED_PAGE_SIZE, acts.length);
    counter.textContent = `${endIdx} / ${acts.length}`;
    prevBtn.disabled = ratedPageIdx === 0;
    nextBtn.disabled = ratedPageIdx === totalPages - 1;
  }

  const offset = ratedPageIdx * RATED_PAGE_SIZE;
  const slice  = acts.slice(offset, offset + RATED_PAGE_SIZE);

  const doRender = () => {
    if (!acts.length) {
      page.innerHTML = `<div class="profile-empty">Keine Acts mit dieser Bewertung.</div>`;
      return;
    }
    page.innerHTML = slice.map((a, i) => {
      const rounded = Math.round(a.avg);
      const stars = '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
      return `
        <div class="profile-list-item profile-list-item--top-act profile-act-link" data-act-id="${a.id}" data-act-name="${a.name}">
          <span class="profile-top-act-rank">${offset + i + 1}</span>
          <span class="profile-list-name">${a.name}</span>
          <span class="profile-top-act-rating">
            <span class="profile-top-act-stars">${stars}</span>
            <span class="profile-top-act-avg">${a.avg.toFixed(1)}</span>
            ${a.count > 1 ? `<span class="profile-top-act-count">(${a.count}×)</span>` : ''}
          </span>
        </div>`;
    }).join('');
  };

  if (animDir === 0) {
    page.style.transition = '';
    page.style.transform  = '';
    page.style.opacity    = '';
    doRender();
    return;
  }

  // Animate out from current drag position, then render and animate in
  page.style.transition = 'transform 0.17s cubic-bezier(0.4,0,1,1), opacity 0.17s';
  page.style.transform  = `translateX(${animDir * -110}%) rotate(${animDir * -2}deg)`;
  page.style.opacity    = '0';
  setTimeout(() => {
    doRender();
    page.style.transition = 'none';
    page.style.transform  = `translateX(${animDir * 75}%) rotate(${animDir * 1.5}deg)`;
    page.style.opacity    = '0';
    void page.offsetWidth;
    page.style.transition = 'transform 0.28s cubic-bezier(0.25,1,0.5,1), opacity 0.22s';
    page.style.transform  = '';
    page.style.opacity    = '';
  }, 170);
}

function initRatedActsSection(topActs) {
  allRatedActs = topActs;
  ratedFilter  = 0;
  ratedSort    = 'avg-desc';
  ratedPageIdx = 0;

  // Filter buttons
  document.getElementById('ratedActsFilters')?.addEventListener('click', e => {
    const btn = e.target.closest('.rated-filter-btn');
    if (!btn) return;
    document.querySelectorAll('.rated-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ratedFilter  = Number(btn.dataset.stars);
    ratedPageIdx = 0;
    renderRatedActsPage(0);
  });

  // Sort select
  document.getElementById('ratedActsSort')?.addEventListener('change', e => {
    ratedSort    = e.target.value;
    ratedPageIdx = 0;
    renderRatedActsPage(0);
  });

  // Arrow buttons
  document.getElementById('ratedActsPrev')?.addEventListener('click', () => {
    if (ratedPageIdx > 0) { ratedPageIdx--; renderRatedActsPage(-1); }
  });
  document.getElementById('ratedActsNext')?.addEventListener('click', () => {
    const total = Math.ceil(getFilteredSortedActs().length / RATED_PAGE_SIZE);
    if (ratedPageIdx < total - 1) { ratedPageIdx++; renderRatedActsPage(1); }
  });

  // Touch swipe
  const slider = document.getElementById('ratedActsSlider');
  if (slider) {
    let startX = null, startY = null, curX = null, swiping = false;
    const THRESHOLD = 50, MAX_RESIST = 40;

    slider.addEventListener('touchstart', e => {
      startX = e.changedTouches[0].clientX;
      startY = e.changedTouches[0].clientY;
      curX   = startX;
      swiping = false;
    }, { passive: true });

    slider.addEventListener('touchmove', e => {
      if (startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (!swiping) {
        if (Math.abs(dy) > Math.abs(dx) + 5) { startX = null; return; }
        if (Math.abs(dx) > 8) swiping = true;
        else return;
      }
      e.preventDefault();
      curX = e.changedTouches[0].clientX;
      const acts = getFilteredSortedActs();
      const totalPages = Math.ceil(acts.length / RATED_PAGE_SIZE);
      const page = document.getElementById('ratedActsPage');
      if (!page) return;
      const atStart = ratedPageIdx === 0;
      const atEnd   = ratedPageIdx === totalPages - 1;
      let clamped = dx;
      if ((dx > 0 && atStart) || (dx < 0 && atEnd)) {
        clamped = dx > 0 ? Math.min(dx * 0.15, MAX_RESIST) : Math.max(dx * 0.15, -MAX_RESIST);
      }
      page.style.transition = 'none';
      page.style.transform  = `translateX(${clamped}px) rotate(${clamped * 0.005}deg)`;
      page.style.opacity    = String(1 - Math.min(Math.abs(clamped) / 250, 0.18));
    }, { passive: false });

    slider.addEventListener('touchend', () => {
      if (startX === null || !swiping) { startX = null; return; }
      const dx = curX - startX;
      const acts = getFilteredSortedActs();
      const totalPages = Math.ceil(acts.length / RATED_PAGE_SIZE);

      if (dx < -THRESHOLD && ratedPageIdx < totalPages - 1) {
        ratedPageIdx++;
        renderRatedActsPage(1);
      } else if (dx > THRESHOLD && ratedPageIdx > 0) {
        ratedPageIdx--;
        renderRatedActsPage(-1);
      } else {
        const page = document.getElementById('ratedActsPage');
        if (page) {
          page.style.transition = 'transform 0.25s cubic-bezier(0.25,1,0.5,1), opacity 0.15s';
          page.style.transform  = '';
          page.style.opacity    = '';
        }
      }
      startX = null; swiping = false;
    });
  }

  renderRatedActsPage(0);
}

// ── Artist Popup ──────────────────────────────────────────────────────────────
function fmtTime(t) { return t ? String(t).slice(0, 5) : null; }
function formatDateLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return {
    day: String(d.getDate()).padStart(2, '0'),
    month: String(d.getMonth() + 1).padStart(2, '0'),
    monthShort: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'][d.getMonth()],
    weekday: ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA'][d.getDay()],
  };
}
function getDateStr(daysOffset = 0) {
  const d = new Date(); d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split('T')[0];
}

function syncBodyLock() {
  const artistOpen   = document.getElementById('artistOverlay')?.classList.contains('open');
  const ratingOpen   = document.getElementById('ratingOverlay')?.classList.contains('open');
  const settingsOpen = document.getElementById('settingsOverlay')?.classList.contains('open');
  document.body.style.overflow = artistOpen || ratingOpen || settingsOpen ? 'hidden' : '';
}

async function openArtistPopup(actId, actName) {
  const overlay = document.getElementById('artistOverlay');
  const content = document.getElementById('modalContent');
  if (!overlay || !content) return;
  content.innerHTML = `<div class="modal-artist-tag">// ARTIST</div><div class="modal-artist-name">${actName}</div><div class="modal-divider"></div><div style="color:var(--grey);font-size:11px;letter-spacing:0.1em">Loading...</div>`;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  syncBodyLock();

  let instaName = null, scUrl = null, upcomingEvents = [], pastEvents = [], ratingStats = null;
  if (supabaseClient && actId) {
    const pubClient = supabaseAnonClient || supabaseClient;
    try {
      const { data: act } = await pubClient
        .from('acts')
        .select('id, name, insta_name, soundcloud_url')
        .eq('id', actId).maybeSingle();
      if (act) { instaName = act.insta_name; scUrl = act.soundcloud_url; }

      const { data: eventActRows } = await pubClient
        .from('event_acts').select('id, start_time, end_time, event_id').eq('act_id', actId);
      if (eventActRows?.length) {
        const eventIds = eventActRows.map(r => r.event_id);
        const [upRes, pastRes] = await Promise.all([
          pubClient.from('events')
            .select('id, event_name, event_date, time_start, clubs(id, name, cities(name))')
            .in('id', eventIds).gte('event_date', getDateStr(0)).order('event_date'),
          pubClient.from('events')
            .select('id, event_name, event_date, clubs(id, name, cities(name))')
            .in('id', eventIds).lt('event_date', getDateStr(0))
            .order('event_date', { ascending: false }).limit(8),
        ]);
        if (upRes.data) {
          const m = {}; upRes.data.forEach(ev => { m[ev.id] = ev; });
          upcomingEvents = eventActRows
            .map(ea => ({ start_time: ea.start_time, end_time: ea.end_time, events: m[ea.event_id] || null }))
            .filter(ea => ea.events)
            .sort((a, b) => a.events.event_date.localeCompare(b.events.event_date))
            .slice(0, 8);
        }
        if (pastRes.data) {
          const m = {}; pastRes.data.forEach(ev => { m[ev.id] = ev; });
          pastEvents = eventActRows
            .map(ea => ({ start_time: ea.start_time, end_time: ea.end_time, events: m[ea.event_id] || null }))
            .filter(ea => ea.events)
            .sort((a, b) => b.events.event_date.localeCompare(a.events.event_date))
            .slice(0, 8);
        }
      }
      const { data: stats } = await pubClient
        .from('act_rating_stats')
        .select('rating_count, avg_rating, best_act_pct, surprise_pct')
        .eq('act_id', actId).maybeSingle();
      ratingStats = stats || null;

      if (sessionUser) {
        const { data: ownRatings } = await supabaseClient
          .from('act_ratings')
          .select('act_id, event_id, rating, was_best_act, was_surprise')
          .eq('user_id', sessionUser.id).eq('act_id', actId);
        if (ownRatings) {
          ownRatings.forEach(r => {
            userActRatings.set(`${r.act_id}:${r.event_id ?? 'null'}`, r);
          });
        }
      }
    } catch (err) {
      console.warn('Artist popup fetch error:', err.message || err);
    }
  }
  renderArtistModal(actName, instaName, upcomingEvents, actId, pastEvents, ratingStats, scUrl);
}

function renderArtistModal(name, instaName, upcomingEvents, actId, pastEvents = [], ratingStats = null, scUrl = null) {
  const content = document.getElementById('modalContent');
  if (!content) return;
  const numericActId = Number(actId);
  const isFavorite = Number.isFinite(numericActId) && favoriteActIds.has(numericActId);
  const favHtml = Number.isFinite(numericActId)
    ? `<button class="modal-act-favorite${isFavorite ? ' active' : ''}" type="button" data-favorite-act-id="${numericActId}" aria-pressed="${isFavorite}"><span class="modal-act-favorite-label">${isFavorite ? 'Saved' : 'Save'}</span></button>`
    : '';
  const igHtml = instaName
    ? `<a class="modal-ig-link" href="https://instagram.com/${instaName}" target="_blank" rel="noopener"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>@${instaName}</a>`
    : `<span class="modal-ig-link modal-social-placeholder">Instagram</span>`;
  const scHtml = scUrl
    ? `<a class="modal-sc-link" href="${scUrl}" target="_blank" rel="noopener"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M1.175 12.225c-.041 0-.075.032-.079.074l-.55 4.754.55 4.757c.004.042.038.074.079.074.04 0 .074-.032.079-.074l.625-4.757-.625-4.754c-.005-.042-.039-.074-.079-.074zm1.558-.55c-.05 0-.09.037-.095.086l-.484 5.304.484 5.307c.005.05.045.086.095.086.05 0 .09-.036.095-.086l.549-5.307-.549-5.304c-.005-.05-.045-.086-.095-.086zm1.574-.31c-.058 0-.105.045-.11.103l-.418 5.614.418 5.617c.005.058.052.103.11.103.058 0 .106-.045.111-.103l.473-5.617-.473-5.614c-.005-.058-.053-.103-.111-.103zm1.59-.128c-.065 0-.118.052-.123.117l-.35 5.742.35 5.745c.005.065.058.117.123.117.065 0 .118-.052.123-.117l.397-5.745-.397-5.742c-.005-.065-.058-.117-.123-.117zm1.589-.077c-.073 0-.132.058-.137.13l-.283 5.819.283 5.822c.005.073.064.13.137.13.073 0 .132-.057.137-.13l.32-5.822-.32-5.819c-.005-.073-.064-.13-.137-.13zm1.591-.032c-.08 0-.145.063-.15.143l-.216 5.851.216 5.854c.005.08.07.143.15.143.08 0 .145-.063.15-.143l.244-5.854-.244-5.851c-.005-.08-.07-.143-.15-.143zm1.592-.014c-.087 0-.158.07-.163.156l-.149 5.865.149 5.868c.005.087.076.156.163.156.087 0 .158-.069.163-.156l.169-5.868-.169-5.865c-.005-.087-.076-.156-.163-.156zm1.59-.004c-.094 0-.171.076-.176.17l-.082 5.869.082 5.872c.005.094.082.17.176.17.094 0 .171-.076.176-.17l.093-5.872-.093-5.869c-.005-.094-.082-.17-.176-.17zm1.59.004c-.1 0-.181.08-.186.18l-.014 5.865.014 5.868c.005.1.086.18.186.18.1 0 .181-.08.186-.18l.016-5.868-.016-5.865c-.005-.1-.086-.18-.186-.18zm3.547-1.636C19.5 9.16 17.857 7.5 15.875 7.5c-.504 0-.983.101-1.418.283-.147-3.604-3.13-6.48-6.774-6.48-1.018 0-1.983.224-2.844.625-.31.14-.393.284-.396.41v13.31c.003.13.106.238.238.246h13.318C19.428 15.893 21 14.315 21 12.375c0-1.94-1.572-3.518-3.5-3.519z"/></svg>SoundCloud</a>`
    : `<span class="modal-sc-link modal-social-placeholder">SoundCloud</span>`;

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
        ${ratingStats.surprise_pct > 0 ? `<div class="modal-act-flags"><span class="modal-act-flag modal-act-flag--surprise">Überraschung des Abends ${ratingStats.surprise_pct}%</span></div>` : ''}
      </div>`;
  }

  const rows = upcomingEvents.length
    ? upcomingEvents.map(ea => {
        const ev = ea.events ?? ea;
        const d = formatDateLabel(ev.event_date);
        const start = fmtTime(ea.start_time), end = fmtTime(ea.end_time);
        const slot = start && end ? `${start}–${end}` : start ? `ab ${start}` : null;
        const ratingKey = `${numericActId}:${ev.id}`;
        const existingRating = userActRatings.get(ratingKey);
        const rateBtn = sessionUser
          ? existingRating
            ? `<span class="modal-rated-stars">${'★'.repeat(existingRating.rating)}${'☆'.repeat(5 - existingRating.rating)}</span>`
            : `<button class="modal-rate-btn" type="button" data-action="open-rating" data-act-id="${numericActId}" data-act-name="${name}" data-event-id="${ev.id}" data-event-name="${ev.event_name}">★</button>`
          : '';
        const city = ev.clubs?.cities?.name;
        const venue = city ? `${city} — ${ev.clubs?.name ?? ''}` : (ev.clubs?.name ?? '-');
        return `<div class="modal-event-row modal-event-row--link" data-event-date="${ev.event_date}" data-event-id="${ev.id}"><div class="modal-event-date"><span class="med">${d.day}</span><span class="mmonth">${d.monthShort}</span><span class="mwday">${d.weekday}</span></div><div class="modal-event-info"><div class="modal-event-name">${ev.event_name}</div><div class="modal-event-venue">${venue}</div></div><div class="modal-event-right">${rateBtn}${slot ? `<div class="modal-event-time">${slot}</div>` : ''}<span class="modal-event-goto">-></span></div></div>`;
      }).join('')
    : `<div class="modal-no-events">Keine kommenden Events gefunden</div>`;

  let pastHtml = '';
  if (pastEvents.length) {
    const pastRows = pastEvents.map(ea => {
      const ev = ea.events ?? ea, d = formatDateLabel(ev.event_date);
      const ratingKey = `${numericActId}:${ev.id}`;
      const existingRating = userActRatings.get(ratingKey);
      const rateBtn = sessionUser
        ? existingRating
          ? `<span class="modal-rated-stars">${'★'.repeat(existingRating.rating)}${'☆'.repeat(5 - existingRating.rating)}</span>`
          : `<button class="modal-rate-btn" type="button" data-action="open-rating" data-act-id="${numericActId}" data-act-name="${name}" data-event-id="${ev.id}" data-event-name="${ev.event_name}">Bewerten</button>`
        : '';
      const city = ev.clubs?.cities?.name;
      const venue = city ? `${city} — ${ev.clubs?.name ?? ''}` : (ev.clubs?.name ?? '-');
      return `<div class="modal-event-row modal-event-row--past"><div class="modal-event-date"><span class="med">${d.day}</span><span class="mmonth">${d.monthShort}</span><span class="mwday">${d.weekday}</span></div><div class="modal-event-info"><div class="modal-event-name">${ev.event_name}</div><div class="modal-event-venue">${venue}</div></div><div class="modal-event-right">${rateBtn}</div></div>`;
    }).join('');
    pastHtml = `<div class="modal-events-label modal-events-label--past">Vergangene Events (${pastEvents.length})</div>${pastRows}`;
  }

  const socialRow = `<div class="modal-social-row">${igHtml}${scHtml}</div>`;

  content.innerHTML = `
    <div class="modal-artist-tag">// ARTIST</div>
    <div class="artist-modal-header"><div class="modal-artist-name">${name}</div><div class="modal-head-actions">${favHtml}</div></div>
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

  // Favorite toggle + rating button delegation
  document.getElementById('modalContent')?.addEventListener('click', async e => {
    const fav = e.target.closest('[data-favorite-act-id]');
    if (fav) {
      const numericId = Number(fav.dataset.favoriteActId);
      if (!Number.isFinite(numericId) || !supabaseClient || !sessionUser) return;
      const already = favoriteActIds.has(numericId);
      fav.disabled = true;
      try {
        if (already) {
          await supabaseClient.from('favorites').delete()
            .eq('user_id', sessionUser.id).eq('entity_type', 'act').eq('entity_id', numericId);
          favoriteActIds.delete(numericId);
        } else {
          await supabaseClient.from('favorites').insert({ user_id: sessionUser.id, entity_type: 'act', entity_id: numericId });
          favoriteActIds.add(numericId);
        }
        fav.classList.toggle('active', !already);
        fav.setAttribute('aria-pressed', String(!already));
        fav.querySelector('.modal-act-favorite-label').textContent = !already ? 'Saved' : 'Save';
      } catch (err) {
        console.warn('Favorite toggle error:', err.message || err);
      }
      fav.disabled = false;
    }

    const rateBtn = e.target.closest('[data-action="open-rating"]');
    if (rateBtn) {
      await openRatingModal({
        actId: Number(rateBtn.dataset.actId),
        actName: rateBtn.dataset.actName,
        eventId: Number(rateBtn.dataset.eventId),
        eventName: rateBtn.dataset.eventName,
      });
    }
  });

  // Navigate to event page when clicking event row
  document.getElementById('artistModal')?.addEventListener('click', e => {
    const row = e.target.closest('.modal-event-row--link');
    if (row && !e.target.closest('[data-action="open-rating"]') && !e.target.closest('.modal-rated-stars')) {
      const date = row.dataset.eventDate;
      const evId = row.dataset.eventId;
      closeArtistPopup();
      window.location.href = `index.html${date ? '#date=' + date + (evId ? '&event=' + evId : '') : ''}`;
    }
  });

  // Delegated click on acts lists
  document.addEventListener('click', e => {
    const item = e.target.closest('.profile-act-link');
    if (!item) return;
    if (e.target.closest('a')) return;
    const actId = item.dataset.actId;
    const actName = item.dataset.actName;
    if (actId && actName) openArtistPopup(actId, actName);
  });

  // Delegated click on club items → navigate to club events
  document.addEventListener('click', e => {
    const item = e.target.closest('.profile-club-link');
    if (!item) return;
    const clubName = item.dataset.clubName;
    if (clubName) {
      closeArtistPopup();
      window.location.href = `index.html#club=${encodeURIComponent(clubName)}`;
    }
  });

  // Delegated click on event items → navigate to event
  document.addEventListener('click', e => {
    const item = e.target.closest('.profile-event-link');
    if (!item) return;
    if (e.target.closest('a')) return;
    const date = item.dataset.eventDate;
    const evId = item.dataset.eventId;
    if (date) {
      closeArtistPopup();
      window.location.href = `index.html#date=${date}${evId ? '&event=' + evId : ''}`;
    }
  });
}

function syncProfileStatHypes() {
  const el = document.getElementById('statHypes');
  if (el) el.textContent = String(profileHypedRows.length);
}

function syncProfileHypeButtons(eventId) {
  const isHyped = userHypedEventIds.has(Number(eventId));
  const hype = getHype(eventId);
  document.querySelectorAll(`#hypesList [data-action="toggle-hype"][data-event-id="${eventId}"]`).forEach(btn => {
    btn.classList.toggle('active', isHyped);
    btn.setAttribute('aria-pressed', String(isHyped));
    const count = btn.querySelector('.hype-count');
    if (count) count.textContent = hype.total_hype;
  });
}

function syncProfileClubButtons(clubId) {
  const isActive = favoriteClubIds.has(Number(clubId));
  document.querySelectorAll(`#hypesList [data-action="toggle-favorite-club"][data-club-id="${clubId}"]`).forEach(btn => {
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
    btn.textContent = isActive ? '−' : '+';
  });
}

function syncProfileActButtons(actId) {
  const isActive = favoriteActIds.has(Number(actId));
  document.querySelectorAll(`#hypesList [data-action="toggle-favorite-act"][data-act-id="${actId}"]`).forEach(btn => {
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
    btn.textContent = isActive ? '♥' : '♡';
    btn.closest('.artist-row')?.classList.toggle('artist-row--followed', isActive);
  });
}

async function toggleProfileFavorite(type, id, onChange) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || !supabaseClient || !sessionUser) return false;
  const activeSet = type === 'club' ? favoriteClubIds : type === 'act' ? favoriteActIds : null;
  if (!activeSet) return false;
  const isActive = activeSet.has(numericId);

  if (isActive) activeSet.delete(numericId);
  else activeSet.add(numericId);
  if (onChange) onChange();

  try {
    if (isActive) {
      const { error } = await supabaseClient
        .from('favorites')
        .delete()
        .eq('user_id', sessionUser.id)
        .eq('entity_type', type)
        .eq('entity_id', numericId);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient
        .from('favorites')
        .insert({ user_id: sessionUser.id, entity_type: type, entity_id: numericId });
      if (error) throw error;
    }
    return true;
  } catch (err) {
    if (isActive) activeSet.add(numericId);
    else activeSet.delete(numericId);
    if (onChange) onChange();
    console.warn('Favorite toggle error:', err.message || err);
    return false;
  }
}

async function toggleProfileHype(id) {
  const eventId = Number(id);
  if (!Number.isFinite(eventId) || !supabaseClient || !sessionUser) return false;
  const active = userHypedEventIds.has(eventId);
  const previousRows = [...profileHypedRows];

  if (active) {
    userHypedEventIds.delete(eventId);
    bumpHype(eventId, -1);
    profileHypedRows = profileHypedRows.filter(row => Number(row.event_id) !== eventId);
    expandedEventIds.delete(eventId);
  } else {
    userHypedEventIds.add(eventId);
    bumpHype(eventId, 1);
  }

  syncProfileHypeButtons(eventId);
  syncProfileStatHypes();
  if (active) renderHypesList(profileHypedRows);

  try {
    if (active) {
      const { error } = await supabaseClient
        .from('event_hypes')
        .delete()
        .eq('user_id', sessionUser.id)
        .eq('event_id', eventId);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient
        .from('event_hypes')
        .insert({ user_id: sessionUser.id, event_id: eventId });
      if (error) throw error;
    }
    return true;
  } catch (err) {
    if (active) {
      userHypedEventIds.add(eventId);
      bumpHype(eventId, 1);
    } else {
      userHypedEventIds.delete(eventId);
      bumpHype(eventId, -1);
    }
    profileHypedRows = previousRows;
    console.warn('Hype toggle error:', err.message || err);
    renderHypesList(profileHypedRows);
    syncProfileStatHypes();
    return false;
  }
}

function initProfileEventCards() {
  const container = document.getElementById('hypesList');
  if (!container) return;

  container.addEventListener('click', async e => {
    const artist = e.target.closest('.artist-name-link[data-act-id]');
    if (artist) {
      e.stopPropagation();
      openArtistPopup(artist.dataset.actId, artist.dataset.actName);
      return;
    }

    const target = e.target.closest('[data-action]');
    if (!target) return;
    e.preventDefault();

    if (target.dataset.action === 'toggle-timetable') {
      const eventId = Number(target.dataset.eventId);
      if (expandedEventIds.has(eventId)) expandedEventIds.delete(eventId);
      else expandedEventIds.add(eventId);
      const card = target.closest('.event-card');
      card?.classList.toggle('open', expandedEventIds.has(eventId));
      const chevron = card?.querySelector('.card-chevron');
      if (chevron) chevron.textContent = expandedEventIds.has(eventId) ? '▾' : '▸';
      return;
    }

    if (target.dataset.action === 'toggle-hype') {
      await toggleProfileHype(target.dataset.eventId);
      return;
    }
    if (target.dataset.action === 'toggle-favorite-club') {
      const clubId = Number(target.dataset.clubId);
      await toggleProfileFavorite('club', clubId, () => syncProfileClubButtons(clubId));
      return;
    }
    if (target.dataset.action === 'toggle-favorite-act') {
      const actId = Number(target.dataset.actId);
      await toggleProfileFavorite('act', actId, () => syncProfileActButtons(actId));
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
}

// ── Rating Modal ──────────────────────────────────────────────────────────────
async function openRatingModal({ actId, actName, eventId, eventName }) {
  if (!sessionUser) return;
  ratingState = { actId, actName, eventId, eventName };
  selectedRating = 0;

  const cacheKey = `${actId}:${eventId}`;
  let existing = userActRatings.get(cacheKey);
  if (!existing && supabaseClient && sessionUser) {
    try {
      const { data } = await supabaseClient.from('act_ratings')
        .select('act_id, event_id, rating, was_best_act, was_surprise')
        .eq('user_id', sessionUser.id).eq('act_id', actId).eq('event_id', eventId).maybeSingle();
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
  ratingState = null; selectedRating = 0;
  const overlay = document.getElementById('ratingOverlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  syncBodyLock();
}

function updateRatingStars(value) {
  selectedRating = value;
  document.querySelectorAll('.rating-star').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.star) <= value);
  });
  const submit = document.getElementById('ratingSubmit');
  if (submit) submit.disabled = value === 0;
}

async function submitActRating() {
  if (!ratingState || selectedRating === 0 || !supabaseClient || !sessionUser) return;
  const submit = document.getElementById('ratingSubmit');
  if (submit) submit.disabled = true;
  const msgEl = document.getElementById('ratingMessage');
  if (msgEl) msgEl.textContent = 'Wird gespeichert...';
  const { actId, actName, eventId } = ratingState;
  const wasSurprise = document.getElementById('ratingFlagSurprise')?.checked ?? false;
  try {
    const { data: existingRow } = await supabaseClient.from('act_ratings')
      .select('id').eq('user_id', sessionUser.id).eq('act_id', actId).eq('event_id', eventId).maybeSingle();
    if (existingRow) {
      const { error } = await supabaseClient.from('act_ratings')
        .update({ rating: selectedRating, was_best_act: false, was_surprise: wasSurprise })
        .eq('user_id', sessionUser.id).eq('act_id', actId).eq('event_id', eventId);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient.from('act_ratings')
        .insert({ user_id: sessionUser.id, act_id: actId, event_id: eventId, rating: selectedRating, was_best_act: false, was_surprise: wasSurprise });
      if (error) throw error;
    }
    userActRatings.set(`${actId}:${eventId}`, { act_id: actId, event_id: eventId, rating: selectedRating, was_best_act: false, was_surprise: wasSurprise });
    renderHypesList(profileHypedRows);
    if (msgEl) msgEl.textContent = 'Gespeichert!';
    setTimeout(() => { closeRatingModal(); openArtistPopup(actId, actName); }, 700);
  } catch (err) {
    console.warn('Rating submit error:', err.message || err);
    if (msgEl) msgEl.textContent = 'Fehler beim Speichern.';
    if (submit) submit.disabled = false;
  }
}

function initRatingModal() {
  document.getElementById('ratingOverlayBg')?.addEventListener('click', closeRatingModal);
  document.getElementById('ratingModalClose')?.addEventListener('click', closeRatingModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('ratingOverlay')?.classList.contains('open')) closeRatingModal();
  });
  document.getElementById('ratingStars')?.addEventListener('click', e => {
    const star = e.target.closest('.rating-star');
    if (star) updateRatingStars(Number(star.dataset.star));
  });
  document.getElementById('ratingSubmit')?.addEventListener('click', submitActRating);
}

function renderRecommendations(recs) {
  const el = document.getElementById('recommendationsList');
  if (!el) return;
  if (!recs.length) { renderEmpty(el, 'Keine Empfehlungen verfügbar.'); return; }
  el.innerHTML = recs.map(a => `
    <div class="profile-list-item profile-list-item--rec">
      <span class="profile-list-name">${a.name}</span>
      ${a.insta_name ? `<a class="profile-list-meta" href="https://instagram.com/${a.insta_name}" target="_blank" rel="noopener">@${a.insta_name}</a>` : ''}
      <span class="profile-rec-score">${a.score} Match${a.score > 1 ? 'es' : ''}</span>
    </div>
  `).join('');
}

function renderClubsList(clubs) {
  const el = document.getElementById('clubsList');
  if (!el) return;
  if (!clubs.length) { renderEmpty(el, 'Noch keine Clubs gefolgt.'); return; }
  el.innerHTML = clubs.map(c => `
    <div class="profile-list-item profile-club-link" data-club-name="${c.name.replace(/"/g, '&quot;')}">
      <span class="profile-list-name">${c.name}</span>
      <span class="profile-event-goto">→</span>
    </div>
  `).join('');
}

function renderHypesList(hyped) {
  const el = document.getElementById('hypesList');
  if (!el) return;
  profileHypedRows = [...hyped];
  if (!hyped.length) { renderEmpty(el, 'Noch keine Events als Interessiert markiert.'); return; }

  const today = getTodayLocalDateStr();
  const upcoming = hyped.filter(h => h.events?.event_date >= today);
  const past     = hyped.filter(h => h.events?.event_date < today);
  const renderCards = rows => {
    const events = rows.map(row => row.events).filter(Boolean);
    const context = getProfileEventCardContext(events);
    return events.map(ev => EventCardUtils.renderEventCard(ev, context)).join('');
  };

  let html = '';

  if (upcoming.length) {
    html += `<div class="profile-section-sublabel">Kommende Events</div>`;
    html += `<div class="profile-event-cards">${renderCards(upcoming)}</div>`;
  }

  if (past.length) {
    html += `<div class="profile-section-sublabel${upcoming.length ? ' profile-section-sublabel--mt' : ''}">Vergangene Events</div>`;
    html += `<div class="profile-event-cards">${renderCards(past)}</div>`;
  }

  el.innerHTML = html;
}

function renderBadges(badges) {
  const el = document.getElementById('badgesGrid');
  if (!el) return;
  if (!badges.length) {
    el.innerHTML = `<div class="profile-empty">Noch keine Badges verdient.<br><span style="color:var(--grey);font-size:10px">Markiere Events als interessiert und folge Acts, um Badges zu verdienen.</span></div>`;
    return;
  }
  el.innerHTML = badges.map(b => `
    <div class="profile-badge">
      <div class="profile-badge-icon">${b.icon}</div>
      <div class="profile-badge-name">${b.name}</div>
      <div class="profile-badge-desc">${b.desc}</div>
    </div>
  `).join('');
}

// ── Main data load ────────────────────────────────────────────────────────────
async function loadProfile() {
  // 1. Profile row
  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('user_id, display_name, created_at')
    .eq('user_id', sessionUser.id)
    .maybeSingle();

  const displayName = profile?.display_name
    || sessionUser.user_metadata?.name
    || sessionUser.email
    || 'Angemeldet';

  updateNavbar(displayName);

  document.getElementById('profileName').textContent = displayName.toUpperCase();
  document.getElementById('profileSince').textContent = formatSince(
    profile?.created_at || sessionUser.created_at
  );

  // 2. Favorites
  const { data: favorites = [] } = await supabaseClient
    .from('favorites')
    .select('entity_type, entity_id')
    .eq('user_id', sessionUser.id);

  const actIds   = favorites.filter(f => f.entity_type === 'act').map(f => Number(f.entity_id));
  const clubIds  = favorites.filter(f => f.entity_type === 'club').map(f => Number(f.entity_id));
  const eventIds = favorites.filter(f => f.entity_type === 'event').map(f => Number(f.entity_id));
  favoriteActIds = new Set(actIds);
  favoriteClubIds = new Set(clubIds);

  // 3. Hype count
  const { count: hyeCount = 0 } = await supabaseClient
    .from('event_hypes')
    .select('event_id', { count: 'exact', head: true })
    .eq('user_id', sessionUser.id);

  // Stats
  document.getElementById('statHypes').textContent    = hyeCount || 0;
  document.getElementById('statActs').textContent      = actIds.length;
  document.getElementById('statClubs').textContent     = clubIds.length;
  document.getElementById('statFavEvents').textContent = eventIds.length;

  // Level
  const score = (hyeCount || 0) + actIds.length + clubIds.length;
  const lvl = computeLevel(score);
  document.getElementById('levelLabel').textContent    = `Level ${lvl.index} — ${lvl.name}`;
  document.getElementById('levelProgress').textContent = lvl.progressLabel;
  document.getElementById('levelBarFill').style.width  = `${lvl.progress}%`;

  // 4. Act details
  let acts = [];
  if (actIds.length) {
    const { data } = await supabaseClient
      .from('acts')
      .select('id, name, insta_name')
      .in('id', actIds);
    acts = data || [];
  }

  // 5. Club details
  let clubs = [];
  if (clubIds.length) {
    const { data } = await supabaseClient
      .from('clubs')
      .select('id, name')
      .in('id', clubIds);
    clubs = data || [];
  }

  // 6. Hyped events (last 20) — zwei Schritte statt nested join
  const { data: hyeRows = [] } = await supabaseClient
    .from('event_hypes')
    .select('event_id, created_at')
    .eq('user_id', sessionUser.id)
    .order('created_at', { ascending: false });

  const hyeEventIds = hyeRows.map(h => Number(h.event_id)).filter(Boolean);
  let hyeEventDetails = [];
  if (hyeEventIds.length) {
    const { data } = await supabaseClient
      .from('events')
      .select(`
        id, event_name, event_date, time_start, time_end,
        clubs ( id, name, cities ( name ) ),
        event_acts ( start_time, end_time, sort_order, canceled, acts ( id, name, insta_name ) )
      `)
      .in('id', hyeEventIds);
    hyeEventDetails = data || [];
  }
  const hypedRows = hyeRows
    .map(h => ({ ...h, events: hyeEventDetails.find(e => Number(e.id) === Number(h.event_id)) || null }))
    .filter(h => h.events);
  profileHypedRows = hypedRows;
  userHypedEventIds = new Set(hyeEventIds);

  await Promise.all([
    loadPublicHypes(hypedRows.map(row => row.events)),
    loadEventHighlights(hypedRows.map(row => row.events)),
  ]);

  // 7. Badges (client-side computed)
  const badges = computeBadges({ hyeCount: hyeCount || 0, actCount: actIds.length, clubCount: clubIds.length });

  // 8. Top acts (by user's own average rating)
  userActRatings = new Map();
  const { data: myRatings = [] } = await supabaseClient
    .from('act_ratings')
    .select('act_id, event_id, rating, was_best_act, was_surprise, acts(name, insta_name)')
    .eq('user_id', sessionUser.id);

  const actRatingMap = new Map();
  (myRatings || []).forEach(r => {
    if (!r.act_id) return;
    userActRatings.set(`${r.act_id}:${r.event_id ?? 'null'}`, r);
    if (!actRatingMap.has(r.act_id)) {
      actRatingMap.set(r.act_id, { ratings: [], name: r.acts?.name || '?', insta: r.acts?.insta_name || null });
    }
    actRatingMap.get(r.act_id).ratings.push(r.rating);
  });
  const topActs = [...actRatingMap.entries()]
    .map(([id, v]) => ({
      id,
      name: v.name,
      insta_name: v.insta,
      avg: v.ratings.reduce((a, b) => a + b, 0) / v.ratings.length,
      count: v.ratings.length,
    }))
    .sort((a, b) => b.avg - a.avg || b.count - a.count);

  // 9. Collaborative filtering recommendations
  let recommendations = [];
  const myRatedActIds = [...actRatingMap.keys()];
  if (myRatedActIds.length) {
    const { data: otherRatings = [] } = await supabaseClient
      .from('act_ratings')
      .select('user_id, act_id')
      .in('act_id', myRatedActIds)
      .neq('user_id', sessionUser.id);

    // Count how many of the user's rated acts each other user has also rated
    const similarityMap = new Map();
    (otherRatings || []).forEach(r => {
      similarityMap.set(r.user_id, (similarityMap.get(r.user_id) || 0) + 1);
    });

    const topSimilarUsers = [...similarityMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([uid]) => uid);

    if (topSimilarUsers.length) {
      let favsQuery = supabaseClient
        .from('favorites')
        .select('entity_id')
        .eq('entity_type', 'act')
        .in('user_id', topSimilarUsers);

      if (actIds.length) {
        favsQuery = favsQuery.not('entity_id', 'in', `(${actIds.join(',')})`);
      }
      const { data: theirFavs = [] } = await favsQuery;

      const recScoreMap = new Map();
      (theirFavs || []).forEach(f => {
        const id = Number(f.entity_id);
        recScoreMap.set(id, (recScoreMap.get(id) || 0) + 1);
      });

      const topRecIds = [...recScoreMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([id]) => id);

      if (topRecIds.length) {
        const { data: recActDetails = [] } = await supabaseClient
          .from('acts')
          .select('id, name, insta_name')
          .in('id', topRecIds);

        recommendations = topRecIds
          .map(id => recActDetails.find(a => Number(a.id) === id))
          .filter(Boolean)
          .map(a => ({ ...a, score: recScoreMap.get(Number(a.id)) }));
      }
    }
  }

  // Render all tabs
  initFollowedActsSection(acts);
  renderClubsList(clubs);
  renderHypesList(hypedRows || []);
  renderBadges(badges);
  initRatedActsSection(topActs);
  renderRecommendations(recommendations);
}

// ── Push Notifications ────────────────────────────────────────────────────────

// Replace with your real VAPID public key after running: npm install -g web-push && web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = window.SETRADAR_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    return reg;
  } catch (err) {
    console.warn('SW registration failed:', err);
    return null;
  }
}

async function subscribeToPush(reg) {
  if (!VAPID_PUBLIC_KEY) {
    console.warn('No VAPID key configured');
    return null;
  }
  try {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    return sub;
  } catch (err) {
    console.warn('Push subscribe failed:', err);
    return null;
  }
}

async function savePushSubscription(sub) {
  if (!supabaseClient || !sessionUser || !sub) return;
  const json = sub.toJSON();
  await supabaseClient.from('push_subscriptions').upsert({
    user_id:    sessionUser.id,
    endpoint:   json.endpoint,
    p256dh:     json.keys.p256dh,
    auth:       json.keys.auth,
    user_agent: navigator.userAgent.slice(0, 200),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,endpoint' });
}

async function deletePushSubscription(sub) {
  if (!supabaseClient || !sessionUser || !sub) return;
  await sub.unsubscribe();
  await supabaseClient.from('push_subscriptions')
    .delete()
    .eq('user_id', sessionUser.id)
    .eq('endpoint', sub.endpoint);
}

async function loadNotificationPrefs() {
  if (!supabaseClient || !sessionUser) return null;
  const { data } = await supabaseClient
    .from('notification_preferences')
    .select('*')
    .eq('user_id', sessionUser.id)
    .maybeSingle();
  return data;
}

async function saveNotificationPref(key, value) {
  if (!supabaseClient || !sessionUser) return;
  await supabaseClient.from('notification_preferences').upsert({
    user_id:    sessionUser.id,
    [key]:      value,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

async function initPushSettings() {
  const statusEl    = document.getElementById('settingsPushStatus');
  const enableBtn   = document.getElementById('settingsPushEnableBtn');
  const notifList   = document.getElementById('settingsNotifList');
  const feedbackEl  = document.getElementById('settingsNotifFeedback');
  if (!statusEl) return;

  const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;

  if (!supported) {
    statusEl.textContent = 'Push-Benachrichtigungen werden von diesem Browser nicht unterstützt.';
    statusEl.classList.add('settings-push-status--warn');
    return;
  }

  const permission = Notification.permission;

  if (permission === 'denied') {
    statusEl.innerHTML = 'Benachrichtigungen blockiert. <br><span style="font-size:10px;color:var(--grey-lt)">Bitte in den Browser-Einstellungen freigeben.</span>';
    statusEl.classList.add('settings-push-status--warn');
    return;
  }

  if (permission === 'default') {
    statusEl.textContent = 'Nicht aktiviert';
    enableBtn.style.display = '';
    enableBtn.addEventListener('click', async () => {
      enableBtn.disabled = true;
      enableBtn.textContent = 'Wird aktiviert…';
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        const reg = await registerServiceWorker();
        if (reg) {
          const sub = await subscribeToPush(reg);
          if (sub) await savePushSubscription(sub);
        }
        enableBtn.style.display = 'none';
        statusEl.textContent = 'Aktiviert';
        statusEl.classList.add('settings-push-status--ok');
        await showNotifToggles(notifList, feedbackEl);
      } else {
        enableBtn.disabled = false;
        enableBtn.textContent = 'Benachrichtigungen aktivieren →';
        statusEl.textContent = 'Berechtigung verweigert.';
        statusEl.classList.add('settings-push-status--warn');
      }
    });
    return;
  }

  // Already granted
  const reg = await registerServiceWorker();
  if (reg) {
    const existingSub = await reg.pushManager.getSubscription();
    if (!existingSub && VAPID_PUBLIC_KEY) {
      const sub = await subscribeToPush(reg);
      if (sub) await savePushSubscription(sub);
    }
  }
  statusEl.textContent = 'Aktiviert';
  statusEl.classList.add('settings-push-status--ok');
  await showNotifToggles(notifList, feedbackEl);
}

async function showNotifToggles(notifList, feedbackEl) {
  if (!notifList) return;
  notifList.style.display = '';

  const prefs = await loadNotificationPrefs();

  // Set toggle states from DB
  notifList.querySelectorAll('.settings-toggle-input').forEach(input => {
    const key = input.dataset.pref;
    if (prefs && key in prefs) {
      input.checked = prefs[key];
    } else {
      // Default: most on, reminder off
      input.checked = key !== 'notify_event_day_reminder';
    }
  });

  // Save on change
  notifList.querySelectorAll('.settings-toggle-input').forEach(input => {
    input.addEventListener('change', async () => {
      await saveNotificationPref(input.dataset.pref, input.checked);
      if (feedbackEl) {
        feedbackEl.textContent = 'Gespeichert.';
        setTimeout(() => { if (feedbackEl) feedbackEl.textContent = ''; }, 1500);
      }
    });
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
// ── Settings Modal ────────────────────────────────────────────────────────────
function setFeedback(id, msg, isErr = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('err', isErr);
}

function openSettings() {
  const overlay = document.getElementById('settingsOverlay');
  if (!overlay) return;
  overlay.classList.add('open');
  syncBodyLock();
  // Pre-fill name with current display name
  const nameEl = document.getElementById('profileName');
  const nameInput = document.getElementById('settingsNameInput');
  if (nameEl && nameInput) {
    nameInput.value = nameEl.textContent !== '—' ? nameEl.textContent : '';
  }
  // Mark active language
  const currentLang = localStorage.getItem('setradar_lang') || 'de';
  document.querySelectorAll('.settings-lang-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === currentLang);
  });
}

function closeSettings() {
  const overlay = document.getElementById('settingsOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  syncBodyLock();
  document.getElementById('settingsDeleteConfirm')?.classList.remove('open');
}

function initSettings() {
  const btn = document.getElementById('profileSettingsBtn');
  if (!btn) return;

  btn.addEventListener('click', openSettings);
  document.getElementById('settingsClose')?.addEventListener('click', closeSettings);
  document.getElementById('settingsOverlayBg')?.addEventListener('click', closeSettings);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('settingsOverlay')?.classList.contains('open')) closeSettings();
  });

  // Change display name
  document.getElementById('settingsNameSave')?.addEventListener('click', async () => {
    const input = document.getElementById('settingsNameInput');
    const val = input?.value.trim();
    if (!val) { setFeedback('settingsNameFeedback', 'Bitte Namen eingeben.', true); return; }
    const saveBtn = document.getElementById('settingsNameSave');
    saveBtn.disabled = true;
    setFeedback('settingsNameFeedback', '');
    const { error } = await supabaseClient
      .from('profiles')
      .update({ display_name: val })
      .eq('user_id', sessionUser.id);
    saveBtn.disabled = false;
    if (error) {
      setFeedback('settingsNameFeedback', 'Fehler: ' + error.message, true);
    } else {
      document.getElementById('profileName').textContent = val.toUpperCase();
      updateNavbar(val);
      setFeedback('settingsNameFeedback', 'Name gespeichert.');
    }
  });

  // Change email
  document.getElementById('settingsEmailSave')?.addEventListener('click', async () => {
    const input = document.getElementById('settingsEmailInput');
    const val = input?.value.trim();
    if (!val) { setFeedback('settingsEmailFeedback', 'Bitte E-Mail eingeben.', true); return; }
    const saveBtn = document.getElementById('settingsEmailSave');
    saveBtn.disabled = true;
    setFeedback('settingsEmailFeedback', '');
    const { error } = await supabaseClient.auth.updateUser({ email: val });
    saveBtn.disabled = false;
    if (error) {
      setFeedback('settingsEmailFeedback', 'Fehler: ' + error.message, true);
    } else {
      setFeedback('settingsEmailFeedback', 'Bestätigungsmail gesendet.');
      input.value = '';
    }
  });

  // Change password
  document.getElementById('settingsPasswordSave')?.addEventListener('click', async () => {
    const input = document.getElementById('settingsPasswordInput');
    const val = input?.value;
    if (!val || val.length < 6) { setFeedback('settingsPasswordFeedback', 'Min. 6 Zeichen erforderlich.', true); return; }
    const saveBtn = document.getElementById('settingsPasswordSave');
    saveBtn.disabled = true;
    setFeedback('settingsPasswordFeedback', '');
    const { error } = await supabaseClient.auth.updateUser({ password: val });
    saveBtn.disabled = false;
    if (error) {
      setFeedback('settingsPasswordFeedback', 'Fehler: ' + error.message, true);
    } else {
      setFeedback('settingsPasswordFeedback', 'Passwort geändert.');
      input.value = '';
    }
  });

  // Language
  document.getElementById('settingsLangOptions')?.addEventListener('click', e => {
    const btn = e.target.closest('.settings-lang-btn');
    if (!btn) return;
    const lang = btn.dataset.lang;
    localStorage.setItem('setradar_lang', lang);
    document.querySelectorAll('.settings-lang-btn').forEach(b => b.classList.toggle('active', b === btn));
    setFeedback('settingsLangFeedback', lang === 'de' ? 'Sprache gespeichert.' : 'Language saved.');
  });

  // Logout
  document.getElementById('settingsLogout')?.addEventListener('click', async () => {
    await supabaseClient.auth.signOut().catch(() => {});
    window.location.href = 'index.html';
  });

  // Delete — step 1
  document.getElementById('settingsDeleteBtn')?.addEventListener('click', () => {
    document.getElementById('settingsDeleteConfirm')?.classList.add('open');
    setFeedback('settingsDeleteFeedback', '');
  });

  // Delete — cancel
  document.getElementById('settingsCancelDelete')?.addEventListener('click', () => {
    document.getElementById('settingsDeleteConfirm')?.classList.remove('open');
  });

  // Delete — confirm
  document.getElementById('settingsConfirmDelete')?.addEventListener('click', async () => {
    const confirmBtn = document.getElementById('settingsConfirmDelete');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Wird gelöscht…';
    setFeedback('settingsDeleteFeedback', '');
    try {
      await Promise.all([
        supabaseClient.from('favorites').delete().eq('user_id', sessionUser.id),
        supabaseClient.from('event_hypes').delete().eq('user_id', sessionUser.id),
        supabaseClient.from('act_ratings').delete().eq('user_id', sessionUser.id),
        supabaseClient.from('profiles').delete().eq('user_id', sessionUser.id),
      ]);
      const { error: rpcErr } = await supabaseClient.rpc('delete_my_account');
      if (rpcErr) throw rpcErr;
      await supabaseClient.auth.signOut().catch(() => {});
      window.location.href = 'index.html';
    } catch (err) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Ja, Account endgültig löschen';
      setFeedback('settingsDeleteFeedback', 'Fehler: ' + (err.message || 'Unbekannter Fehler'), true);
    }
  });
}

async function init() {
  if (window.componentsReady?.then) await window.componentsReady;

  initTabs();
  initArtistPopup();
  initRatingModal();
  initProfileEventCards();

  // Init Supabase
  const hasUrl = CONFIG.SUPABASE_URL && !/^DEIN/i.test(CONFIG.SUPABASE_URL);
  const hasKey = SUPABASE_KEY && !/^DEIN/i.test(SUPABASE_KEY);

  if (hasUrl && hasKey) {
    const { createClient } = supabase;
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { storageKey: 'setradar-auth' },
    });
    supabaseAnonClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'setradar-anon-auth' },
    });
  }

  await loadNavbarCities();

  initNavbarAuth();

  if (!supabaseClient) {
    document.getElementById('profileLoading').style.display = 'none';
    document.getElementById('profileNotLoggedIn').style.display = '';
    return;
  }

  // Check session
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    sessionUser = data.session?.user || null;
  } catch {
    sessionUser = null;
  }

  const loading = document.getElementById('profileLoading');
  const notLoggedIn = document.getElementById('profileNotLoggedIn');
  const content = document.getElementById('profileContent');

  if (!sessionUser) {
    loading.style.display = 'none';
    notLoggedIn.style.display = '';
    return;
  }

  loading.style.display = 'none';
  content.style.display = '';

  try {
    await loadProfile();
  } catch (err) {
    console.error('Profil laden Fehler:', err);
  }

  initSettings();
  initPushSettings();
}

init();
