/**
 * home.js — Setradar
 */

const SUPABASE_URL  = CONFIG.SUPABASE_URL;
const SUPABASE_ANON = CONFIG.SUPABASE_ANON;

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
      { start_time: '02:00:00', end_time: '03:30:00', sort_order: 1, acts: { name: 'DATSKO' } },
      { start_time: null,       end_time: null,        sort_order: 2, acts: { name: 'SZG' } },
      { start_time: null,       end_time: null,        sort_order: 3, acts: { name: 'BabaBass3000' } },
      { start_time: '23:00:00', end_time: '01:00:00',  sort_order: 4, acts: { name: 'DJ Tallboy' } },
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

// Club-Nacht-Logik: alles vor 14:00 = nach Mitternacht = +24h
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
// Gibt Minuten bis Set zurück, oder null wenn nicht relevant
function getMinutesUntil(startTimeStr, eventDateStr) {
  if (!startTimeStr || !eventDateStr) return null;
  if (eventDateStr !== getDateStr(0)) return null;

  const now    = new Date();
  const [h, m] = startTimeStr.slice(0, 5).split(':').map(Number);
  const setTime = new Date();
  setTime.setHours(h, m, 0, 0);
  if (h < 14) setTime.setDate(setTime.getDate() + 1);

  const diffMin = Math.round((setTime - now) / 60000);
  if (diffMin < 0) return null; // bereits vorbei
  return diffMin;
}

function fmtCountdown(mins) {
  if (mins < 60) return `in ${mins}min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `in ${h}:${String(m).padStart(2, '0')}h`;
}

// Findet die nächsten 3 Acts (über alle Events) die noch kommen
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
  // Gib Set aus event_id + sort_order als eindeutigen Key zurück
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

// ── Render ────────────────────────────────────────────────────────────────────
function renderDateTabs(grouped) {
  const nav = document.getElementById('dateNav');
  nav.innerHTML = '';
  grouped.forEach(([dateStr], i) => {
    const btn = document.createElement('button');
    btn.className   = 'date-tab' + (i === activeDateIdx ? ' active' : '');
    btn.textContent = formatTabLabel(dateStr);
    btn.onclick = () => { activeDateIdx = i; renderAll(); };
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

    // Countdown nur für die nächsten 3 acts
    const actKey   = `${ev.id}_${a.sort_order}`;
    const isNext   = nextActKeys.includes(actKey);
    const mins     = isNext ? getMinutesUntil(start, ev.event_date) : null;
    const countdown = mins !== null ? fmtCountdown(mins) : null;

    return `
      <div class="artist-row ${start ? 'has-time' : ''}">
        <span class="artist-name">
          ${a.acts?.name ?? '?'}
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
  const grouped    = groupByDate(allEvents);
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
  if (updated) {
    updated.textContent = 'Stand: ' + new Date().toLocaleTimeString('de-DE', {
      hour: '2-digit', minute: '2-digit'
    });
  }
}

// ── Supabase ──────────────────────────────────────────────────────────────────
async function loadFromSupabase() {
  const { data, error } = await supabaseClient
    .from('events')
    .select(`
      id, event_name, event_date, time_start, time_end,
      clubs ( name ),
      event_acts ( start_time, end_time, sort_order, acts ( name ) )
    `)
    .gte('event_date', getDateStr(0))
    .lte('event_date', getDateStr(14))
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
        renderAll();
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
  const isConfigured = SUPABASE_URL !== 'DEINE_SUPABASE_URL';

  if (isConfigured) {
    const { createClient } = supabase;
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON);
    try {
      allEvents = await loadFromSupabase();
      subscribeRealtime();
    } catch (err) {
      console.warn('Supabase Fehler, nutze Demo-Daten:', err.message);
      allEvents = DEMO_EVENTS;
    }
  } else {
    await new Promise(r => setTimeout(r, 500));
    allEvents = DEMO_EVENTS;
  }

  renderAll();
  setInterval(renderAll, 60 * 1000);
  setInterval(updateStatusBar, 30 * 1000);
}

init();