(function initSetradarClubColors() {
  // Feste Markenfarben pro Club — Schlüssel sind normalisierte Namen (lowercase, nur a-z0-9)
  const CLUB_COLORS = {
    berghain:       '#9aa8b5',
    tresor:         '#ffd21f',
    kitkat:         '#ff4fa3',
    kitkatclub:     '#ff4fa3',
    sisyphos:       '#7ddf64',
    rso:            '#9a6bff',
    aboutblank:     '#e8e4dc',
    renate:         '#ff7a59',
    wilderenate:    '#ff7a59',
    katerblau:      '#2ec5c5',
    watergate:      '#3aa0ff',
    suicidecircus:  '#ff9f1c',
    oxi:            '#c6f21e',
    goldengate:     '#d8b23a',
    ritterbutzke:   '#5ee0b7',
    lokschuppen:    '#ff6a3a',
    clubost:        '#7fb2ff',
    anomalie:       '#ffb03a',
    menschmeier:    '#e06bff',
  };

  function normalize(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function hashColor(normalized) {
    let h = 0;
    for (let i = 0; i < normalized.length; i++) h = (h * 31 + normalized.charCodeAt(i)) >>> 0;
    return `hsl(${h % 360} 60% 62%)`;
  }

  function get(clubName) {
    const key = normalize(clubName);
    if (!key) return 'var(--red)';
    if (CLUB_COLORS[key]) return CLUB_COLORS[key];
    const partial = Object.keys(CLUB_COLORS).find(k => key.includes(k));
    if (partial) return CLUB_COLORS[partial];
    return hashColor(key);
  }

  window.SetradarClubColors = { get };
})();
