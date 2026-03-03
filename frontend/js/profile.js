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
let sessionUser = null;
let activeTab = 'acts';

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

function renderActsList(acts) {
  const el = document.getElementById('actsList');
  if (!el) return;
  if (!acts.length) { renderEmpty(el, 'Noch keine Acts gefolgt.'); return; }
  el.innerHTML = acts.map(a => `
    <div class="profile-list-item">
      <span class="profile-list-name">${a.name}</span>
      ${a.insta_name ? `<a class="profile-list-meta" href="https://instagram.com/${a.insta_name}" target="_blank" rel="noopener">@${a.insta_name}</a>` : ''}
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

  // Render all tabs
  renderActsList(acts);
  renderClubsList(clubs);
  renderHypesList(hypedRows || []);
  renderBadges(badges);
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  if (window.componentsReady?.then) await window.componentsReady;

  initTabs();

  // Init Supabase
  const hasUrl = CONFIG.SUPABASE_URL && !/^DEIN/i.test(CONFIG.SUPABASE_URL);
  const hasKey = SUPABASE_KEY && !/^DEIN/i.test(SUPABASE_KEY);

  if (hasUrl && hasKey) {
    const { createClient } = supabase;
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
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
}

init();
