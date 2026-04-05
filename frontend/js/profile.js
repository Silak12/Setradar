/**
 * profile.js - Setradar Profilseite
 */

const SUPABASE_URL = CONFIG.SUPABASE_URL;
const SUPABASE_KEY = CONFIG.SUPABASE_PUBLISHABLE_KEY || CONFIG.SUPABASE_ANON;

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
  if (hyeCount >= 1)  earned.push({ icon: '⚡', name: 'First Hype',    desc: 'Erstes Hype vergeben' });
  if (actCount >= 1)  earned.push({ icon: '🎵', name: 'Act-Fan',       desc: 'Erstem Act gefolgt' });
  if (actCount >= 5)  earned.push({ icon: '🎛️', name: 'Scout',         desc: '5 Acts gefolgt' });
  if (actCount >= 10) earned.push({ icon: '📡', name: 'Radar',         desc: '10 Acts gefolgt' });
  if (clubCount >= 1) earned.push({ icon: '🏴', name: 'Club-Stamm',    desc: 'Erstem Club gefolgt' });
  if (clubCount >= 3) earned.push({ icon: '🏛️', name: 'Club-Crawler',  desc: '3 Clubs gefolgt' });
  if (hyeCount >= 10) earned.push({ icon: '🔥', name: 'Hype-Machine',  desc: '10 Events gehyped' });
  if (hyeCount >= 30) earned.push({ icon: '💀', name: 'Veteran',       desc: '30 Events gehyped' });
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

// ── State ────────────────────────────────────────────────────────────────────
let supabaseClient = null;
let supabaseAnonClient = null;  // stateless anon client for public queries
let sessionUser = null;
let activeTab = 'acts';

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
        return `<div class="modal-event-row modal-event-row--link" data-event-date="${ev.event_date}" data-event-id="${ev.id}"><div class="modal-event-date"><span class="med">${d.day}</span><span class="mwday">${d.weekday}</span></div><div class="modal-event-info"><div class="modal-event-name">${ev.event_name}</div><div class="modal-event-venue">${venue}</div></div><div class="modal-event-right">${rateBtn}${slot ? `<div class="modal-event-time">${slot}</div>` : ''}<span class="modal-event-goto">-></span></div></div>`;
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
      return `<div class="modal-event-row modal-event-row--past"><div class="modal-event-date"><span class="med">${d.day}</span><span class="mwday">${d.weekday}</span></div><div class="modal-event-info"><div class="modal-event-name">${ev.event_name}</div><div class="modal-event-venue">${venue}</div></div><div class="modal-event-right">${rateBtn}</div></div>`;
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
    if (e.target.closest('a')) return; // don't intercept actual links
    const actId = item.dataset.actId;
    const actName = item.dataset.actName;
    if (actId && actName) openArtistPopup(actId, actName);
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
    <div class="profile-list-item">
      <span class="profile-list-name">${c.name}</span>
    </div>
  `).join('');
}

function renderHypesList(hyped) {
  const el = document.getElementById('hypesList');
  if (!el) return;
  if (!hyped.length) { renderEmpty(el, 'Noch keine Events gehyped.'); return; }
  el.innerHTML = hyped.map(h => {
    const ev = h.events;
    if (!ev) return '';
    return `
      <div class="profile-list-item profile-list-item--event">
        <div class="profile-list-event-date">${formatEventDate(ev.event_date)}</div>
        <div class="profile-list-name">${ev.event_name}</div>
        <div class="profile-list-meta">${ev.clubs?.name || '—'}</div>
      </div>
    `;
  }).join('');
}

function renderBadges(badges) {
  const el = document.getElementById('badgesGrid');
  if (!el) return;
  if (!badges.length) {
    el.innerHTML = `<div class="profile-empty">Noch keine Badges verdient.<br><span style="color:var(--grey);font-size:10px">Hype Events und folge Acts um Badges zu verdienen.</span></div>`;
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
    .order('created_at', { ascending: false })
    .limit(20);

  const hyeEventIds = hyeRows.map(h => Number(h.event_id)).filter(Boolean);
  let hyeEventDetails = [];
  if (hyeEventIds.length) {
    const { data } = await supabaseClient
      .from('events')
      .select('id, event_name, event_date, clubs(name)')
      .in('id', hyeEventIds);
    hyeEventDetails = data || [];
  }
  const hypedRows = hyeRows
    .map(h => ({ ...h, events: hyeEventDetails.find(e => Number(e.id) === Number(h.event_id)) || null }))
    .filter(h => h.events);

  // 7. Badges (client-side computed)
  const badges = computeBadges({ hyeCount: hyeCount || 0, actCount: actIds.length, clubCount: clubIds.length });

  // 8. Top acts (by user's own average rating)
  const { data: myRatings = [] } = await supabaseClient
    .from('act_ratings')
    .select('act_id, rating, acts(name, insta_name)')
    .eq('user_id', sessionUser.id);

  const actRatingMap = new Map();
  (myRatings || []).forEach(r => {
    if (!r.act_id) return;
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

  // Init Supabase
  const hasUrl = CONFIG.SUPABASE_URL && !/^DEIN/i.test(CONFIG.SUPABASE_URL);
  const hasKey = SUPABASE_KEY && !/^DEIN/i.test(SUPABASE_KEY);

  if (hasUrl && hasKey) {
    const { createClient } = supabase;
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
    supabaseAnonClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

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
}

init();
