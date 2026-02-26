/**
 * components.js
 * Lädt navbar.html und footer.html in jede Seite.
 * Voraussetzung: <div id="navbar"></div> und <div id="footer"></div> im HTML.
 */

async function loadComponent(id, path) {
  const el = document.getElementById(id);
  if (!el) return;
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    el.innerHTML = await res.text();
  } catch (err) {
    console.error(`[components] Fehler beim Laden von ${path}:`, err);
  }
}

async function loadComponents() {
  // Pfad relativ zum Root — funktioniert auf GitHub Pages
  const base = '/components';
  await Promise.all([
    loadComponent('navbar', `${base}/navbar.html`),
    loadComponent('footer', `${base}/footer.html`),
  ]);
}

// Sofort ausführen
loadComponents();