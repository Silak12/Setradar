/**
 * home.js — Setradar
 */

const SUPABASE_URL  = CONFIG.SUPABASE_URL;
const SUPABASE_KEY  = CONFIG.SUPABASE_PUBLISHABLE_KEY || CONFIG.SUPABASE_ANON;

function isPlaceholderValue(value) {
  return !value || /^DEIN(?:E)?_SUPABASE_/i.test(value);
}

function isLegacyJwtKey(value) {
  return typeof value === 'string' && value.startsWith('eyJ') && value.split('.').length === 3;
}

// ── Demo-Daten ────────────────────────────────────────────────────────────────
const DEMO_EVENTS = [
  {
    id: 1,
    event_name: 'Candyflip x Wyldhearts',
    event_date: getDateStr(0),
    time_start: '23:00:00',
    time_end: '09:00:00',
    clubs: { name: 'Lokschuppen' },
    event_acts: [
      { start_time: '02:00:00', end_time: '03:30:00', sort_order: 1, acts: { id: 1, name: 'DATSKO', insta_name: 'datsko_official' } },
      { start_time: null,       end_time: null,        sort_order: 2, acts: { id: 2, name: 'SZG', insta_name: null } },
      { start_time: null,       end_time: null,        sort_order: 3, acts: { id: 3, name: 'BabaBass3000', insta_name: 'babybass3k' } },
      { start_time: '23:00:00', end_time: '01:00:00',  sort_order: 4, acts: { id: 4, name: 'DJ Tallboy', insta_name: 'dj_tallboy' } },
    ]
  },
  {
    id: 2,
    event_name: 'Dystopia',
    event_date: getDateStr(1),
    time_start: '22:00:00',
    time_end: '08:00:00',
    clubs: { name: 'Tresor' },
    event_acts: [
      { start_time: '00:00:00', end_time: '02:00:00', sort_order: 1, acts: { id: 1, name: 'DATSKO', insta_name: 'datsko_official' } },
      { start_time: '02:00:00', end_time: '04:00:00', sort_order: 2, acts: { id: 5, name: 'Alignment', insta_name: 'alignment_music' } },
    ]
  }
];

// ── Utils ─────────────────────────────────────────────────────────────────────
function getDateStr(daysOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split('T')[0];
}

function fmtTime(t) {
  if (!t) return null;
  return t.slice(0, 5);
}

function timeToMinutes(t) {
  if (!t) return Infinity;
  const [h, m] = t.split(':').map(Number);
  const mins = h * 60 + m;
  return mins < 14 * 60 ? mins + 1440 : mins;
}

function sortActs(acts) {
  const withTime    = acts.filter(a => a.start_time)
    .sort((a, b) => timeToMinutes(fmtTime(a.start_time)) - timeToMinutes(fmtTime(b.start_time)));
  const withoutTime = acts.filter(a => !a.start_time)
    .sort((a, b) => a.sort_order - b.sort_order);
  return [...withTime, ...withoutTime];
}

function formatDateLabel(dateStr) {
  const d       = new Date(dateStr + 'T00:00:00');
  const day     = String(d.getDate()).padStart(2, '0');
  const month   = String(d.getMonth() + 1).padStart(2, '0');
  const weekday = ['SO','MO','DI','MI','DO','FR','SA'][d.getDay()];
  return { day, month, weekday };
}

function formatTabLabel(dateStr) {
  const today    = getDateStr(0);
  const tomorrow = getDateStr(1);
  const d        = new Date(dateStr + 'T00:00:00');
  const weekdays = ['So','Mo','Di','Mi','Do','Fr','Sa'];
  if (dateStr === today)    return 'Heute';
  if (dateStr === tomorrow) return 'Morgen';
  return `${weekdays[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
}

function groupByDate(events) {
  const map = {};
  events.forEach(ev => {
    if (!map[ev.event_date]) map[ev.event_date] = [];
    map[ev.event_date].push(ev);
  });
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
}

// ── Countdown ─────────────────────────────────────────────────────────────────
function getMinutesUntil(startTimeStr, eventDateStr) {
  if (!startTimeStr || !eventDateStr) return null;
  if (eventDateStr !== getDateStr(0)) return null;
  const now    = new Date();
  const [h, m] = startTimeStr.slice(0, 5).split(':').map(Number);
  const setTime = new Date();
  setTime.setHours(h, m, 0, 0);
  if (h < 14) setTime.setDate(setTime.getDate() + 1);
  const diffMin = Math.round((setTime - now) / 60000);
  if (diffMin < 0) return null;
  return diffMin;
}

function fmtCountdown(mins) {
  if (mins < 60) return `in ${mins}min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `in ${h}:${String(m).padStart(2, '0')}h`;
}

function getNextActIds(events) {
  const today = getDateStr(0);
  const upcoming = [];
  events.forEach(ev => {
    if (ev.event_date !== today) return;
    (ev.event_acts || []).forEach(a => {
      const mins = getMinutesUntil(a.start_time, ev.event_date);
      if (mins !== null) {
        upcoming.push({ sortKey: timeToMinutes(fmtTime(a.start_time)), mins, key: `${ev.id}_${a.sort_order}` });
      }
    });
  });
  upcoming.sort((a, b) => a.sortKey - b.sortKey);
  return upcoming.slice(0, 3).map(u => u.key);
}

// ── Status Bar ────────────────────────────────────────────────────────────────
function updateStatusBar() {
  const bar = document.getElementById('statusBar');
  if (!bar) return;
  const todayEvents = allEvents.filter(ev => ev.event_date === getDateStr(0));
  const time = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  bar.innerHTML = `
    <div class="status-bar-left">
      <span class="status-live-dot"></span>
      <span>Live — ${todayEvents.length} Event${todayEvents.length !== 1 ? 's' : ''} heute</span>
    </div>
    <div class="status-bar-right">${time}</div>
  `;
}

// ── State ─────────────────────────────────────────────────────────────────────
let allEvents      = [];
let activeDateIdx  = 0;
let supabaseClient = null;
let searchMode     = false; // true wenn Suchergebnis-Ansicht aktiv
let searchFilter   = 'all'; // 'all' | 'artist' | 'club'

// ── Render ────────────────────────────────────────────────────────────────────
function renderDateTabs(grouped) {
  const nav = document.getElementById('dateNav');
  nav.innerHTML = '';
  grouped.forEach(([dateStr], i) => {
    const btn = document.createElement('button');
    btn.className   = 'date-tab' + (i === activeDateIdx ? ' active' : '');
    btn.textContent = formatTabLabel(dateStr);
    btn.onclick = () => {
      activeDateIdx = i;
      searchMode = false;
      clearSearch();
      renderAll();
    };
    nav.appendChild(btn);
  });
}

function renderEventCard(ev, nextActKeys) {
  const acts      = sortActs(ev.event_acts || []);
  const hasTime   = acts.some(a => a.start_time);
  const venueName = ev.clubs?.name ?? '—';
  const doorsTime = fmtTime(ev.time_start);
  const closeTime = fmtTime(ev.time_end);

  const artistRows = acts.map(a => {
    const start     = fmtTime(a.start_time);
    const end       = fmtTime(a.end_time);
    const timeLabel = start && end ? `${start} – ${end}` : start ? `ab ${start}` : null;
    const actKey    = `${ev.id}_${a.sort_order}`;
    const isNext    = nextActKeys.includes(actKey);
    const mins      = isNext ? getMinutesUntil(start, ev.event_date) : null;
    const countdown = mins !== null ? fmtCountdown(mins) : null;
    const actId     = a.acts?.id ?? null;

    return `
      <div class="artist-row ${start ? 'has-time' : ''}">
        <span class="artist-name">
          <span class="artist-name-link" ${actId ? `data-act-id="${actId}"` : ''} data-act-name="${a.acts?.name ?? '?'}">${a.acts?.name ?? '?'}</span>
          ${countdown ? `<span class="countdown ${mins < 30 ? 'soon' : ''}">${countdown}</span>` : ''}
        </span>
        ${timeLabel
          ? `<span class="artist-time confirmed">${timeLabel}</span>`
          : `<span class="time-tba">TBA</span>`
        }
      </div>
    `;
  }).join('');

  return `
    <div class="event-card" data-event-id="${ev.id}">
      <div class="card-header">
        <div class="event-name">${ev.event_name}</div>
        <div class="event-meta">
          <span class="venue-tag">${venueName}</span>
          ${doorsTime ? `<span class="doors-time">↳ ${doorsTime}${closeTime ? ' – ' + closeTime : ''}</span>` : ''}
          <span class="status-badge ${hasTime ? 'confirmed' : 'pending'}">
            <span class="status-dot"></span>
            ${hasTime ? 'Timetable' : 'Lineup'}
          </span>
        </div>
      </div>
      <div class="artist-list">
        <div class="artist-list-label">Artists</div>
        ${artistRows || '<span class="time-tba">Noch keine Infos</span>'}
      </div>
    </div>
  `;
}

function renderAll() {
  if (searchMode) return; // Suchansicht bleibt
  const grouped     = groupByDate(allEvents);
  const nextActKeys = getNextActIds(allEvents);
  renderDateTabs(grouped);
  updateStatusBar();

  const main = document.getElementById('mainContent');
  if (!grouped.length) {
    main.innerHTML = `<div class="empty-state"><span>Keine Events gefunden</span></div>`;
    return;
  }

  const [dateStr, events] = grouped[activeDateIdx] ?? grouped[0];
  const { day, month, weekday } = formatDateLabel(dateStr);

  main.innerHTML = `
    <div class="day-section">
      <div class="day-label">
        <div>
          <div class="weekday">${weekday}</div>
          ${day}.${month}
        </div>
      </div>
      <div class="day-divider"></div>
      ${events.length
        ? events.map(ev => renderEventCard(ev, nextActKeys)).join('')
        : '<div class="no-events">Keine Events an diesem Tag</div>'
      }
    </div>
  `;

  const updated = document.getElementById('lastUpdated');
  if (updated) updated.textContent = 'Stand: ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  // Artist-click events delegieren
  bindArtistClicks();
}


// ── Search ────────────────────────────────────────────────────────────────────

function initSearch() {
  const input   = document.getElementById('searchInput');
  const results = document.getElementById('searchResults');
  const clear   = document.getElementById('searchClear');
  const typeBtns = document.querySelectorAll('.type-btn');

  typeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      typeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      searchFilter = btn.dataset.type;
      if (input.value.trim().length > 0) doSearch(input.value.trim());
    });
  });

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clear.classList.toggle('visible', q.length > 0);
    if (q.length === 0) {
      results.classList.remove('open');
      results.innerHTML = '';
      return;
    }
    if (q.length >= 1) doSearch(q);
  });

  input.addEventListener('focus', () => {
    if (input.value.trim().length > 0) results.classList.add('open');
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { clearSearch(); input.blur(); }
  });

  clear.addEventListener('click', () => { clearSearch(); input.focus(); });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) results.classList.remove('open');
  });
}

function clearSearch() {
  const input   = document.getElementById('searchInput');
  const results = document.getElementById('searchResults');
  const clear   = document.getElementById('searchClear');
  input.value = '';
  results.classList.remove('open');
  results.innerHTML = '';
  clear.classList.remove('visible');
  if (searchMode) {
    searchMode = false;
    renderAll();
  }
}

function doSearch(q) {
  const lower   = q.toLowerCase();
  const results = document.getElementById('searchResults');

  // Alle einzigartigen Acts aus Events
  const actMap = {};
  allEvents.forEach(ev => {
    (ev.event_acts || []).forEach(a => {
      if (!a.acts) return;
      const id = a.acts.id ?? a.acts.name;
      if (!actMap[id]) actMap[id] = { ...a.acts, type: 'artist' };
    });
  });

  // Alle Clubs
  const clubMap = {};
  allEvents.forEach(ev => {
    const name = ev.clubs?.name;
    if (name && !clubMap[name]) clubMap[name] = { name, type: 'club' };
  });

  const artists = Object.values(actMap).filter(a =>
    (searchFilter === 'all' || searchFilter === 'artist') &&
    a.name.toLowerCase().includes(lower)
  );

  const clubs = Object.values(clubMap).filter(c =>
    (searchFilter === 'all' || searchFilter === 'club') &&
    c.name.toLowerCase().includes(lower)
  );

  const total = artists.length + clubs.length;

  if (total === 0) {
    results.innerHTML = `<div class="search-no-results">Keine Ergebnisse für "${q}"</div>`;
    results.classList.add('open');
    return;
  }

  let html = '';
  if (artists.length > 0) {
    html += `<div class="search-results-header">Artists (${artists.length})</div>`;
    artists.slice(0, 6).forEach(a => {
      const upcoming = countUpcomingEvents(a.id ?? a.name, 'artist');
      html += `
        <div class="search-result-item" data-search-type="artist" data-id="${a.id ?? ''}" data-name="${a.name}">
          <span class="result-type-tag artist">DJ</span>
          <span class="result-name">${highlight(a.name, q)}</span>
          <span class="result-sub">${upcoming} Event${upcoming !== 1 ? 's' : ''}</span>
          <span class="result-arrow">→</span>
        </div>
      `;
    });
  }

  if (clubs.length > 0) {
    html += `<div class="search-results-header">Clubs (${clubs.length})</div>`;
    clubs.slice(0, 4).forEach(c => {
      const upcoming = countUpcomingEvents(c.name, 'club');
      html += `
        <div class="search-result-item" data-search-type="club" data-name="${c.name}">
          <span class="result-type-tag club">CLUB</span>
          <span class="result-name">${highlight(c.name, q)}</span>
          <span class="result-sub">${upcoming} Event${upcoming !== 1 ? 's' : ''}</span>
          <span class="result-arrow">→</span>
        </div>
      `;
    });
  }

  results.innerHTML = html;
  results.classList.add('open');

  // Click handlers
  results.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const type = item.dataset.searchType;
      const name = item.dataset.name;
      const id   = item.dataset.id || null;
      document.getElementById('searchResults').classList.remove('open');
      if (type === 'artist') showArtistSearch(id, name);
      else if (type === 'club') showClubSearch(name);
    });
  });
}

function highlight(text, q) {
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return text.slice(0, idx) + `<mark style="background:rgba(255,32,32,0.3);color:var(--white)">${text.slice(idx, idx + q.length)}</mark>` + text.slice(idx + q.length);
}

function countUpcomingEvents(idOrName, type) {
  const today = getDateStr(0);
  if (type === 'artist') {
    return allEvents.filter(ev =>
      ev.event_date >= today &&
      (ev.event_acts || []).some(a => a.acts && (a.acts.id == idOrName || a.acts.name === idOrName))
    ).length;
  } else {
    return allEvents.filter(ev => ev.event_date >= today && ev.clubs?.name === idOrName).length;
  }
}

// Suche: Filtere Events nach Club, zeige in Main
function showClubSearch(clubName) {
  const today   = getDateStr(0);
  const grouped = groupByDate(allEvents.filter(ev =>
    ev.clubs?.name === clubName && ev.event_date >= today
  ));
  searchMode = true;
  renderSearchResults(`Club: ${clubName}`, grouped);
}

// Suche: Filtere Events nach Artist
function showArtistSearch(actId, actName) {
  const today   = getDateStr(0);
  const grouped = groupByDate(allEvents.filter(ev =>
    ev.event_date >= today &&
    (ev.event_acts || []).some(a => a.acts && (a.acts.id == actId || a.acts.name === actName))
  ));
  searchMode = true;
  renderSearchResults(`Artist: ${actName}`, grouped);
}

function renderSearchResults(label, grouped) {
  const nextActKeys = getNextActIds(allEvents);

  const main = document.getElementById('mainContent');
  if (!grouped.length) {
    main.innerHTML = `
      <div class="search-active-banner">
        <span><strong>${label}</strong> — Keine kommenden Events</span>
        <button class="search-banner-close" onclick="clearSearch()">✕ Zurück</button>
      </div>
      <div class="empty-state"><span>Keine Events gefunden</span></div>
    `;
    return;
  }

  let html = `
    <div class="search-active-banner">
      <span>Ergebnisse für <strong>${label}</strong></span>
      <button class="search-banner-close" onclick="clearSearch()">✕ Zurück</button>
    </div>
  `;

  grouped.forEach(([dateStr, events]) => {
    const { day, month, weekday } = formatDateLabel(dateStr);
    html += `
      <div class="day-section">
        <div class="day-label">
          <div>
            <div class="weekday">${weekday}</div>
            ${day}.${month}
          </div>
        </div>
        <div class="day-divider"></div>
        ${events.map(ev => renderEventCard(ev, nextActKeys)).join('')}
      </div>
    `;
  });

  main.innerHTML = html;
  bindArtistClicks();

  const updated = document.getElementById('lastUpdated');
  if (updated) updated.textContent = 'Stand: ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}


// ── Artist Popup ──────────────────────────────────────────────────────────────

function bindArtistClicks() {
  document.querySelectorAll('.artist-name-link[data-act-id]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const actId   = el.dataset.actId;
      const actName = el.dataset.actName;
      openArtistPopup(actId, actName);
    });
  });
}

async function openArtistPopup(actId, actName) {
  const overlay = document.getElementById('artistOverlay');
  const content = document.getElementById('modalContent');

  // Direkt öffnen — Content laden wir dann
  content.innerHTML = `
    <div class="modal-artist-tag">// ARTIST</div>
    <div class="modal-artist-name">${actName}</div>
    <div class="modal-divider"></div>
    <div style="color:var(--grey);font-size:11px;letter-spacing:0.1em">Loading...</div>
  `;
  overlay.setAttribute('aria-hidden', 'false');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Act-Daten laden
  let instaName = null;
  let upcomingEvents = [];

  if (supabaseClient && actId) {
    try {
      // Query 1: Act-Info
      const { data: act } = await supabaseClient
        .from('acts')
        .select('id, name, insta_name')
        .eq('id', actId)
        .single();
      if (act) instaName = act.insta_name;

      // Query 2: event_acts für diesen Act
      const { data: eventActRows } = await supabaseClient
        .from('event_acts')
        .select('id, start_time, end_time, event_id')
        .eq('act_id', actId);

      if (eventActRows && eventActRows.length > 0) {
        const today    = getDateStr(0);
        const eventIds = eventActRows.map(r => r.event_id);

        // Query 3: Events separat – kein nested-JOIN RLS-Problem
        const { data: eventRows } = await supabaseClient
          .from('events')
          .select('id, event_name, event_date, time_start, clubs(name)')
          .in('id', eventIds)
          .gte('event_date', today)
          .order('event_date');

        if (eventRows) {
          const eventMap = {};
          eventRows.forEach(ev => { eventMap[ev.id] = ev; });
          upcomingEvents = eventActRows
            .map(ea => ({ start_time: ea.start_time, end_time: ea.end_time, events: eventMap[ea.event_id] ?? null }))
            .filter(ea => ea.events)
            .sort((a, b) => a.events.event_date.localeCompare(b.events.event_date))
            .slice(0, 8);
        }
      }
    } catch (err) {
      console.warn('Artist popup fetch error:', err);
    }
  } else {
    // Demo-Modus: aus allEvents filtern
    const today = getDateStr(0);
    allEvents
      .filter(ev => ev.event_date >= today)
      .forEach(ev => {
        const act = (ev.event_acts || []).find(a => a.acts && (a.acts.id == actId || a.acts.name === actName));
        if (act) {
          upcomingEvents.push({ start_time: act.start_time, end_time: act.end_time, events: ev });
          instaName = act.acts.insta_name;
        }
      });
  }

  renderArtistModal(actName, instaName, upcomingEvents);
}

function renderArtistModal(name, instaName, upcomingEvents) {
  const content = document.getElementById('modalContent');

  const igHtml = instaName
    ? `<a class="modal-ig-link" href="https://instagram.com/${instaName}" target="_blank" rel="noopener">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
          <circle cx="12" cy="12" r="4"/>
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
        </svg>
        @${instaName}
      </a>`
    : '';

  let eventsHtml = '';
  if (!upcomingEvents.length) {
    eventsHtml = `<div class="modal-no-events">Keine kommenden Events gefunden</div>`;
  } else {
    eventsHtml = upcomingEvents.map(ea => {
      const ev   = ea.events ?? ea;
      const date = ev.event_date;
      const { day, weekday } = formatDateLabel(date);
      const start = fmtTime(ea.start_time);
      const end   = fmtTime(ea.end_time);
      const slot  = start && end ? `${start}–${end}` : start ? `ab ${start}` : null;
      return `
        <div class="modal-event-row modal-event-row--link" data-event-date="${date}" data-event-id="${ev.id}">
          <div class="modal-event-date">
            <span class="med">${day}</span>
            <span class="mwday">${weekday}</span>
          </div>
          <div class="modal-event-info">
            <div class="modal-event-name">${ev.event_name}</div>
            <div class="modal-event-venue">${ev.clubs?.name ?? '—'}</div>
          </div>
          <div class="modal-event-right">
            ${slot ? `<div class="modal-event-time">${slot}</div>` : ''}
            <span class="modal-event-goto">→</span>
          </div>
        </div>
      `;
    }).join('');
  }

  content.innerHTML = `
    <div class="modal-artist-tag">// ARTIST</div>
    <div class="modal-artist-name">${name}</div>
    <div class="modal-divider"></div>
    ${igHtml}
    <div class="modal-events-label">Kommende Events (${upcomingEvents.length})</div>
    ${eventsHtml}
    <div class="modal-scanner"></div>
  `;
}

function closeArtistPopup() {
  const overlay = document.getElementById('artistOverlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function initArtistPopup() {
  document.getElementById('artistOverlayBg').addEventListener('click', closeArtistPopup);
  document.getElementById('modalClose').addEventListener('click', closeArtistPopup);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeArtistPopup();
  });

  // Klick auf Event-Zeile im Modal → zum richtigen Tag springen
  document.getElementById('modalContent').addEventListener('click', e => {
    const row = e.target.closest('.modal-event-row--link');
    if (!row) return;
    const targetDate  = row.dataset.eventDate;
    const targetEvId  = row.dataset.eventId;
    if (!targetDate) return;

    const grouped = groupByDate(allEvents);
    const idx     = grouped.findIndex(([d]) => d === targetDate);
    if (idx === -1) return;

    closeArtistPopup();
    searchMode    = false;
    activeDateIdx = idx;
    clearSearch();
    renderAll();

    // Scroll zum Event-Card, kurze Verzögerung für DOM-Update
    if (targetEvId) {
      setTimeout(() => {
        const card = document.querySelector(`[data-event-id="${targetEvId}"]`);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    }
  });
}

// ── Swipe Navigation (Mobile) ─────────────────────────────────────────────────
function initSwipe() {
  const THRESHOLD  = 60;
  const MAX_RESIST = 70;
  let startX = null, startY = null, curX = null;
  let swiping = false;
  const main = document.getElementById('mainContent');

  function applyDrag(dx) {
    const grouped = groupByDate(allEvents);
    const atStart = activeDateIdx === 0;
    const atEnd   = activeDateIdx >= grouped.length - 1;
    // Gummiband an den Rändern
    let clamped = dx;
    if ((dx > 0 && atStart) || (dx < 0 && atEnd)) {
      clamped = dx > 0
        ? Math.min(dx * 0.18, MAX_RESIST)
        : Math.max(dx * 0.18, -MAX_RESIST);
    }
    main.style.transition = 'none';
    main.style.transform  = `translateX(${clamped}px) rotate(${clamped * 0.012}deg)`;
    main.style.opacity    = String(1 - Math.min(Math.abs(clamped) / 280, 0.28));
  }

  function resetDrag() {
    main.style.transition = 'transform 0.25s cubic-bezier(0.25,1,0.5,1), opacity 0.2s';
    main.style.transform  = '';
    main.style.opacity    = '';
  }

  function slideOut(dir, cb) {
    main.style.transition = 'transform 0.17s cubic-bezier(0.4,0,1,1), opacity 0.17s';
    main.style.transform  = `translateX(${dir * -110}%) rotate(${dir * -3}deg)`;
    main.style.opacity    = '0';
    setTimeout(cb, 170);
  }

  function slideIn(fromDir) {
    main.style.transition = 'none';
    main.style.transform  = `translateX(${fromDir * 75}%) rotate(${fromDir * 2}deg)`;
    main.style.opacity    = '0';
    void main.offsetWidth;
    main.style.transition = 'transform 0.28s cubic-bezier(0.25,1,0.5,1), opacity 0.22s';
    main.style.transform  = '';
    main.style.opacity    = '';
  }

  document.addEventListener('touchstart', e => {
    if (document.getElementById('artistOverlay').classList.contains('open')) return;
    startX  = e.changedTouches[0].clientX;
    startY  = e.changedTouches[0].clientY;
    curX    = startX;
    swiping = false;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (startX === null) return;
    if (document.getElementById('artistOverlay').classList.contains('open')) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;

    if (!swiping) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) { startX = null; return; }
      swiping = true;
    }

    // Verhindert Browser-Zurück-Geste (iOS Edge-Swipe)
    if (Math.abs(dx) > 10) e.preventDefault();

    curX = e.changedTouches[0].clientX;
    applyDrag(curX - startX);
  }, { passive: false }); // passive:false nötig für preventDefault()

  document.addEventListener('touchend', () => {
    if (startX === null || !swiping) { startX = null; return; }
    const dx      = curX - startX;
    const grouped = groupByDate(allEvents);
    const canNext = activeDateIdx < grouped.length - 1;
    const canPrev = activeDateIdx > 0;

    if (dx < -THRESHOLD && canNext) {
      slideOut(-1, () => {
        activeDateIdx++;
        searchMode = false;
        clearSearch();
        renderAll();
        slideIn(1);
      });
    } else if (dx > THRESHOLD && canPrev) {
      slideOut(1, () => {
        activeDateIdx--;
        searchMode = false;
        clearSearch();
        renderAll();
        slideIn(-1);
      });
    } else {
      resetDrag();
    }

    startX = null; swiping = false;
  });
}


// ── Supabase ──────────────────────────────────────────────────────────────────
async function loadFromSupabase() {
  const { data, error } = await supabaseClient
    .from('events')
    .select(`
      id, event_name, event_date, time_start, time_end,
      clubs ( name ),
      event_acts ( start_time, end_time, sort_order, acts ( id, name, insta_name ) )
    `)
    .gte('event_date', getDateStr(0))
    .lte('event_date', getDateStr(60))
    .order('event_date');
  if (error) throw error;
  return data ?? [];
}

// ── Realtime ──────────────────────────────────────────────────────────────────
function subscribeRealtime() {
  supabaseClient
    .channel('event_acts_changes')
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'event_acts' },
      async (payload) => {
        allEvents = await loadFromSupabase();
        if (!searchMode) renderAll();
        const card = document.querySelector(`[data-event-id="${payload.new.event_id}"]`);
        if (card) {
          card.classList.remove('flash');
          void card.offsetWidth;
          card.classList.add('flash');
        }
      }
    )
    .subscribe();
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const hasUrl = !isPlaceholderValue(SUPABASE_URL);
  const hasKey = !isPlaceholderValue(SUPABASE_KEY);
  const usesLegacyKey = isLegacyJwtKey(SUPABASE_KEY);
  const isConfigured = hasUrl && hasKey && !usesLegacyKey;

  if (isConfigured) {
    const { createClient } = supabase;
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
    try {
      allEvents = await loadFromSupabase();
      subscribeRealtime();
    } catch (err) {
      console.warn('Supabase Fehler, nutze Demo-Daten:', err.message);
      allEvents = DEMO_EVENTS;
    }
  } else {
    if (usesLegacyKey) {
      console.warn('Supabase Legacy-Key erkannt. Bitte in frontend/js/config.js einen neuen Publishable Key (sb_publishable_...) setzen.');
    }
    await new Promise(r => setTimeout(r, 500));
    allEvents = DEMO_EVENTS;
  }

  renderAll();
  initSearch();
  initArtistPopup();
  initSwipe();

  setInterval(() => { if (!searchMode) renderAll(); }, 60 * 1000);
  setInterval(updateStatusBar, 30 * 1000);
}

init();