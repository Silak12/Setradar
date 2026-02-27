const SUPABASE_URL  = CONFIG.SUPABASE_URL;
const SUPABASE_ANON = CONFIG.SUPABASE_ANON;

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

// Konvertiert "HH:MM" zu Minuten für Sortierung
function timeToMinutes(t) {
  if (!t) return Infinity;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
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

// ── Sortierung der Acts ───────────────────────────────────────────────────────
// Acts mit Zeit → nach start_time sortiert oben
// Acts ohne Zeit → nach sort_order unten
function sortActs(acts) {
  const withTime    = acts.filter(a => a.start_time).sort((a, b) =>
    timeToMinutes(fmtTime(a.start_time)) - timeToMinutes(fmtTime(b.start_time))
  );
  const withoutTime = acts.filter(a => !a.start_time).sort((a, b) =>
    a.sort_order - b.sort_order
  );
  return [...withTime, ...withoutTime];
}

// ── State ─────────────────────────────────────────────────────────────────────
let allEvents     = [];
let activeDateIdx = 0;
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

function renderEventCard(ev) {
  const acts      = sortActs(ev.event_acts || []);
  const hasTime   = acts.some(a => a.start_time);
  const venueName = ev.clubs?.name ?? '—';
  const doorsTime = fmtTime(ev.time_start);
  const closeTime = fmtTime(ev.time_end);

  const artistRows = acts.map(a => {
    const start = fmtTime(a.start_time);
    const end   = fmtTime(a.end_time);
    const timeLabel = start && end ? `${start} – ${end}` : start ? `ab ${start}` : null;

    return `
      <div class="artist-row ${start ? 'has-time' : ''}" data-start="${start || ''}">
        <span class="artist-name">${a.acts?.name ?? '?'}</span>
        ${timeLabel
          ? `<span class="artist-time confirmed">${timeLabel}</span>`
          : `<span class="time-unknown">TBA</span>`
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

// ── Supabase Laden ────────────────────────────────────────────────────────────
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

// ── Realtime Subscription ─────────────────────────────────────────────────────
function subscribeRealtime() {
  supabaseClient
    .channel('event_acts_changes')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'event_acts' },
      async (payload) => {
        console.log('[Realtime] event_acts UPDATE:', payload.new);

        // Betroffenes Event in allEvents finden und updaten
        const updatedActId  = payload.new.act_id;
        const updatedEventId = payload.new.event_id;

        allEvents = allEvents.map(ev => {
          if (ev.id !== updatedEventId) return ev;
          return {
            ...ev,
            event_acts: ev.event_acts.map(ea => {
              // Matchen anhand event_id + act_id
              if (ea.acts && payload.new.act_id) {
                const isMatch = ev.id === updatedEventId &&
                  ea.sort_order === payload.new.sort_order;
                if (isMatch) {
                  return {
                    ...ea,
                    start_time: payload.new.start_time,
                    end_time:   payload.new.end_time,
                  };
                }
              }
              return ea;
            })
          };
        });

        // Wenn kein Match lokal — frisch aus DB laden
        const matched = allEvents.some(ev =>
          ev.id === updatedEventId &&
          ev.event_acts.some(ea => ea.start_time === payload.new.start_time)
        );

        if (!matched) {
          allEvents = await loadFromSupabase();
        }

        renderAll();
      }
    )
    .subscribe((status) => {
      console.log('[Realtime] Status:', status);
    });
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const isConfigured = SUPABASE_URL !== 'DEINE_SUPABASE_URL';

  if (isConfigured) {
    const { createClient } = supabase;
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON);

    try {
      allEvents = await loadFromSupabase();
      subscribeRealtime(); // Realtime aktivieren
    } catch (err) {
      console.warn('Supabase Fehler, nutze Demo-Daten:', err.message);
      allEvents = DEMO_EVENTS;
    }
  } else {
    await new Promise(r => setTimeout(r, 500));
    allEvents = DEMO_EVENTS;
  }

  renderAll();
}

init();