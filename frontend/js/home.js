/**
 * home.js
 * Logik für die Hauptseite (index.html)
 */

// ── Supabase Config (aus config.js) ──────────────────────────────────────────
const SUPABASE_URL  = CONFIG.SUPABASE_URL;
const SUPABASE_ANON = CONFIG.SUPABASE_ANON;

// ── Demo-Daten ────────────────────────────────────────────────────────────────
const DEMO_EVENTS = [
  {
    id: 1,
    event_name: 'Hessle Audio',
    venue: 'Berghain',
    date: getDateStr(0),
    doors_open: '23:00',
    artists: [
      { name: 'Pangaea',       set_time: null },
      { name: 'Ben UFO',       set_time: null },
      { name: 'Pearson Sound', set_time: null },
    ]
  },
  {
    id: 2,
    event_name: 'Tresor Nacht',
    venue: 'Tresor',
    date: getDateStr(0),
    doors_open: '00:00',
    artists: [
      { name: 'Phase Fatale', set_time: '02:00 – 04:00' },
      { name: 'SPFDJ',        set_time: null },
      { name: 'Rebekah',      set_time: '06:00 – 08:00' },
    ]
  },
  {
    id: 3,
    event_name: 'OHM Presents',
    venue: 'OHM',
    date: getDateStr(1),
    doors_open: '23:00',
    artists: [
      { name: 'Surgeon',      set_time: null },
      { name: 'Paula Temple', set_time: null },
    ]
  },
  {
    id: 4,
    event_name: 'Vault Sessions',
    venue: 'Vault 44',
    date: getDateStr(2),
    doors_open: '22:00',
    artists: [
      { name: 'Lisek',     set_time: null },
      { name: 'Alignment', set_time: null },
    ]
  }
];

// ── Utils ─────────────────────────────────────────────────────────────────────
function getDateStr(daysOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split('T')[0];
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
    if (!map[ev.date]) map[ev.date] = [];
    map[ev.date].push(ev);
  });
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
}

// ── State ─────────────────────────────────────────────────────────────────────
let allEvents     = [];
let activeDateIdx = 0;

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
      renderAll();
    };
    nav.appendChild(btn);
  });
}

function renderEventCard(ev) {
  const hasTime    = ev.artists?.some(a => a.set_time);
  const artistRows = (ev.artists || []).map(a => `
    <div class="artist-row">
      <span class="artist-name">${a.name}</span>
      ${a.set_time
        ? `<span class="artist-time confirmed">${a.set_time}</span>`
        : `<span class="time-unknown">TBA</span>`
      }
    </div>
  `).join('');

  return `
    <div class="event-card">
      <div class="card-header">
        <div class="event-name">${ev.event_name}</div>
        <div class="event-meta">
          <span class="venue-tag">${ev.venue}</span>
          ${ev.doors_open ? `<span class="doors-time">↳ ${ev.doors_open}</span>` : ''}
          <span class="status-badge ${hasTime ? 'confirmed' : 'pending'}">
            <span class="status-dot"></span>
            ${hasTime ? 'Timetable' : 'Lineup'}
          </span>
        </div>
      </div>
      <div class="artist-list">
        <div class="artist-list-label">Artists</div>
        ${artistRows || '<span class="time-unknown">Noch keine Infos</span>'}
      </div>
    </div>
  `;
}

function renderAll() {
  const grouped = groupByDate(allEvents);
  renderDateTabs(grouped);

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
        ? events.map(renderEventCard).join('')
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
  const { createClient } = supabase;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON);

  const { data, error } = await client
    .from('events')
    .select(`
      id, event_name, venue, date, doors_open,
      artists ( name, set_time )
    `)
    .gte('date', getDateStr(0))
    .lte('date', getDateStr(14))
    .order('date');

  if (error) throw error;
  return data ?? [];
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  try {
    allEvents = await loadFromSupabase();
  } catch (err) {
    console.warn('Supabase Fehler, nutze Demo-Daten:', err.message);
    allEvents = DEMO_EVENTS;
  }
  renderAll();
}

init();