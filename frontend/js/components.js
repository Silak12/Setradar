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
  // Relativer Pfad — funktioniert lokal UND auf GitHub Pages
  const base = 'components';
  await Promise.all([
    loadComponent('navbar', `${base}/navbar.html`),
    loadComponent('footer', `${base}/footer.html`),
  ]);
}

window.componentsReady = loadComponents();
