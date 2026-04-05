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

function initCitySelector() {
  const selector = document.getElementById('citySelector');
  const button = document.getElementById('cityBadgeButton');
  const panel = document.getElementById('citySelectorPanel');
  const input = document.getElementById('citySelectorInput');
  const list = document.getElementById('citySelectorList');
  if (!selector || !button || !panel || !input || !list) return;

  let options = ['Berlin'];
  let currentCity = localStorage.getItem('setradar_city') || 'Berlin';
  let highlightedIndex = -1;

  function normalize(value) {
    return String(value || '').trim();
  }

  function uniqueSortedCities(values) {
    return [...new Set((values || []).map(normalize).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));
  }

  function filteredOptions(query) {
    const normalized = normalize(query).toLocaleLowerCase('de');
    if (!normalized) {
      const rest = options.filter(city => city !== currentCity);
      return currentCity ? [currentCity, ...rest] : options;
    }
    return options.filter(city => city.toLocaleLowerCase('de').includes(normalized));
  }

  function renderList(query = input.value) {
    const matches = filteredOptions(query);
    highlightedIndex = matches.length ? 0 : -1;
    if (!matches.length) {
      list.innerHTML = '<div class="city-selector-empty">Keine passende Stadt</div>';
      return;
    }
    list.innerHTML = matches.map((city, index) => `
      <button class="city-selector-option${city === currentCity ? ' active' : ''}${index === highlightedIndex ? ' is-highlighted' : ''}" type="button" data-city-option="${city}">
        ${city}
      </button>
    `).join('');
  }

  function syncHighlight() {
    const items = [...list.querySelectorAll('[data-city-option]')];
    items.forEach((item, index) => item.classList.toggle('is-highlighted', index === highlightedIndex));
  }

  function setCurrentCity(city, { emit = true } = {}) {
    const nextCity = normalize(city) || options[0] || 'Berlin';
    currentCity = nextCity;
    localStorage.setItem('setradar_city', nextCity);
    button.textContent = nextCity;
    renderList('');
    if (emit) {
      document.dispatchEvent(new CustomEvent('setradar:citychange', { detail: { city: nextCity } }));
    }
  }

  function openPanel() {
    panel.hidden = false;
    selector.classList.add('open');
    button.setAttribute('aria-expanded', 'true');
    input.value = '';
    renderList('');
    setTimeout(() => {
      input.focus();
    }, 0);
  }

  function closePanel() {
    panel.hidden = true;
    selector.classList.remove('open');
    button.setAttribute('aria-expanded', 'false');
    highlightedIndex = -1;
  }

  button.addEventListener('click', () => {
    if (selector.classList.contains('open')) closePanel();
    else openPanel();
  });

  input.addEventListener('input', () => renderList(input.value));
  input.addEventListener('keydown', e => {
    const items = [...list.querySelectorAll('[data-city-option]')];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!items.length) return;
      highlightedIndex = Math.min(highlightedIndex + 1, items.length - 1);
      syncHighlight();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
      syncHighlight();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = items[highlightedIndex] || items[0];
      if (target?.dataset.cityOption) {
        setCurrentCity(target.dataset.cityOption);
        closePanel();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closePanel();
    }
  });

  list.addEventListener('click', e => {
    const option = e.target.closest('[data-city-option]');
    if (!option) return;
    setCurrentCity(option.dataset.cityOption);
    closePanel();
  });

  document.addEventListener('click', e => {
    if (!selector.contains(e.target)) closePanel();
  });

  window.SetradarCitySelector = {
    setOptions(cities) {
      const nextOptions = uniqueSortedCities(cities);
      options = nextOptions.length ? nextOptions : ['Berlin'];
      const resolved = options.find(city => city.localeCompare(currentCity, 'de', { sensitivity: 'base' }) === 0) || options[0];
      setCurrentCity(resolved, { emit: false });
    },
    setCurrentCity(city, opts) {
      setCurrentCity(city, opts);
    },
    getCurrentCity() {
      return currentCity;
    },
  };

  setCurrentCity(currentCity, { emit: false });
}

async function loadComponents() {
  const base = 'components';
  await Promise.all([
    loadComponent('navbar', `${base}/navbar.html`),
    loadComponent('footer', `${base}/footer.html`),
  ]);

  initCitySelector();
}

window.componentsReady = loadComponents();
