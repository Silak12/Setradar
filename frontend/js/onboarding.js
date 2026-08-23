/**
 * onboarding.js — SETRADAR story onboarding
 * 3 Fullscreen-Szenen (Radar / Timetable / Companion), je ein 11s-Animationsloop
 * synchron zum Auto-Advance. Tap rechts = weiter, links = zurück, Halten = Pause,
 * horizontales Wischen = Navigation. Erster Besuch: öffnet automatisch;
 * Replay über den Button im Hilfe-Sheet. Kein Framework, kein Package.
 */
(function () {
  'use strict';

  const SEEN_KEY = 'setradar_onboarding_v1';
  const SLIDE_MS = 11000;
  const REDUCED = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // Dritt-Browser auf iOS (Chrome/Firefox/Edge): Teilen sitzt oben statt unten
  const IS_IOS_ALT_BROWSER = IS_IOS && /CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
  const IS_SAMSUNG = /SamsungBrowser/i.test(navigator.userAgent);
  const IS_STANDALONE = (window.matchMedia
    && window.matchMedia('(display-mode: standalone)').matches)
    || window.navigator.standalone === true;

  // Chrome/Edge (Android + Desktop) liefern einen echten Install-Prompt.
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    installPrompt = e;
    const btn = overlay && overlay.querySelector('.ob-install');
    if (btn) btn.hidden = false;
  });

  let overlay = null;
  let idx = 0;
  let advanceTimer = null;
  let slideStartedAt = 0;
  let remaining = SLIDE_MS;
  let paused = false;
  let pointer = null;
  let holdTimer = null;
  let langAtOpen = null;

  /* ── Szenen-Markup ──────────────────────────────────────────────────── */

  function radarScene() {
    return `
      <div class="ob-radar-wrap">
        <svg class="ob-radar-svg" viewBox="0 0 320 320" aria-hidden="true">
          <defs>
            <linearGradient id="obSweepGrad" x1="0" y1="0" x2="1" y2="0.35">
              <stop offset="0" stop-color="rgba(255,32,32,0)"/>
              <stop offset="1" stop-color="rgba(255,32,32,0.16)"/>
            </linearGradient>
          </defs>

          <circle class="ob-ring ob-cycle" cx="160" cy="160" r="46"/>
          <circle class="ob-ring ob-cycle" cx="160" cy="160" r="92"/>
          <circle class="ob-ring ob-ring--out ob-cycle" cx="160" cy="160" r="138"/>

          <path class="ob-sector ob-cycle"
                d="M160 160 L160 24 A136 136 0 0 1 291 125 Z"/>

          <g class="ob-sweep-g">
            <path d="M160 160 L160 22 A138 138 0 0 1 242 49 Z" fill="url(#obSweepGrad)"/>
            <line x1="160" y1="160" x2="160" y2="22"
                  stroke="rgba(255,32,32,0.55)" stroke-width="1.5"/>
          </g>

          <path class="ob-link ob-cycle" d="M105 95 L215 150"/>
          <path class="ob-link ob-cycle" d="M105 95 L235 80"/>

          <g class="ob-blip ob-blip--rated ob-cycle">
            <circle cx="105" cy="95" r="3.5"/>
            <circle class="ob-ping" cx="105" cy="95" r="9"/>
            <text x="113" y="92">RHEA.K</text>
          </g>
          <g class="ob-blip ob-cycle"><circle cx="215" cy="150" r="3.5"/><text x="223" y="147">VANT</text></g>
          <g class="ob-blip ob-cycle"><circle cx="235" cy="80" r="3.5"/><text x="243" y="77">MIRA</text></g>
          <g class="ob-blip ob-cycle"><circle cx="78" cy="190" r="3.5"/><text x="86" y="187">SOLV</text></g>
          <g class="ob-blip ob-cycle"><circle cx="150" cy="248" r="3.5"/><text x="158" y="245">KMOD</text></g>

          <g class="ob-blip ob-blip--new ob-cycle">
            <circle cx="205" cy="60" r="4"/>
            <text x="213" y="57">OTAKT</text>
          </g>
          <g class="ob-blip ob-blip--new ob-delay ob-cycle">
            <circle cx="253" cy="118" r="4"/>
            <text x="228" y="136">VEYL</text>
          </g>
          <g class="ob-foryou ob-cycle">
            <rect x="188" y="30" width="52" height="14"/>
            <text x="194" y="40">FOR YOU</text>
          </g>
        </svg>

        <div class="ob-ratebox" aria-hidden="true">
          <span class="ob-star" style="--d:0s">★</span>
          <span class="ob-star" style="--d:0.09s">★</span>
          <span class="ob-star" style="--d:0.18s">★</span>
          <span class="ob-star" style="--d:0.27s">★</span>
          <span class="ob-star" style="--d:0.36s">★</span>
          <i class="ob-tap"></i>
        </div>
      </div>`;
  }

  function timetableScene() {
    const rows = [
      { time: '23:00', name: 'RHEA.K B2B SOLV' },
      { time: '01:00', name: 'OTAKT', tag: 'FOR YOU' },
      { time: '03:00', name: 'VANT' },
      { time: '05:00', name: 'MIRA' },
    ];
    const rowHtml = rows.map((row, i) => `
      <div class="ob-tt-row" style="--i:${i}">
        <span class="ob-tt-time">${row.time}</span>
        <span class="ob-tt-name">${row.name}</span>
        ${row.tag ? `<span class="ob-tt-tag">${row.tag}</span>` : ''}
      </div>`).join('');

    return `
      <div class="ob-tt" aria-hidden="true">
        <div class="ob-stamp">JUST DROPPED</div>
        <div class="ob-tt-head">
          <span class="ob-tt-club">LOK<span style="color:var(--red)">SCHUPPEN</span></span>
          <span class="ob-tt-date">SAT 23:00</span>
        </div>
        <div class="ob-playhead"></div>
        ${rowHtml}
        <div class="ob-tt-foot"><i></i>SYNCED — RESIDENT ADVISOR</div>
      </div>`;
  }

  function companionScene() {
    const meterCells = Array.from({ length: 12 }, (_, i) =>
      `<i style="--i:${i}" class="${i >= 8 ? 'ob-meter-ghost' : ''}"></i>`).join('');
    const walkDots = Array.from({ length: 4 }, (_, i) => `<i style="--i:${i}"></i>`).join('');
    const bars = [34, 52, 40, 68, 88, 100, 61]
      .map((h, i) => `<i style="--h:${h};--i:${i}" class="${h === 100 ? 'hot' : ''}"></i>`).join('');

    return `
      <div class="ob-comp" aria-hidden="true">
        <div class="ob-panel ob-panel--queue">
          <div class="ob-panel-label"><span>DOOR QUEUE</span><b>LIVE — 23:40</b></div>
          <div class="ob-meter">${meterCells}</div>
          <div class="ob-wait">
            <span class="ob-odo"><span>05<br>15<br>25<br>35</span></span>
            <small>MIN&nbsp;WAIT&nbsp;·&nbsp;COMMUNITY&nbsp;REPORTS</small>
          </div>
          <div class="ob-queue-dots">${walkDots}</div>
        </div>

        <div class="ob-panel ob-panel--stats">
          <svg class="ob-ecg" viewBox="0 0 74 22" aria-hidden="true">
            <path d="M0 12 H16 L21 12 25 3 30 19 34 8 38 12 H50 L54 6 58 12 H74"/>
          </svg>
          <div class="ob-panel-label"><span>YOUR RAVE STATS</span></div>
          <div class="ob-stat-row" style="--i:0">
            <span>NIGHTS OUT</span>
            <b class="ob-stat-num"><span>02<br>06<br>09<br>12<br>14</span></b>
          </div>
          <div class="ob-stat-row" style="--i:1">
            <span>HOURS DANCED</span>
            <b class="ob-stat-num"><span>07<br>31<br>58<br>77<br>96</span></b>
          </div>
          <div class="ob-stat-row" style="--i:2">
            <span>ACTS RATED</span>
            <b class="ob-stat-num ob-stat-num--red"><span>04<br>12<br>21<br>30<br>38</span></b>
          </div>
          <div class="ob-bars">${bars}</div>
        </div>
      </div>`;
  }

  function installScene() {
    const rowKey = IS_IOS ? 'ob.s4.row_ios' : 'ob.s4.row_android';
    const trigger = IS_IOS
      ? '<span class="ob-menu-glyph" aria-hidden="true">\u22ef</span>'
      : '<span class="ob-menu-glyph" aria-hidden="true">\u22ee</span>';
    const tiles = Array.from({ length: 7 }, (_, i) => `<i style="--i:${i}"></i>`).join('');
    return `
      <div class="ob-phone-wrap">
        <div class="ob-phone" aria-hidden="true">
          <div class="ob-phone-notch"></div>
          <div class="ob-home-grid">
            ${tiles}
            <div class="ob-app-tile"><span>S</span></div>
          </div>
          <div class="ob-app-tile-label">SETRADAR</div>
          <div class="ob-install-sheet">
            <span class="ob-sheet-row">
              <span class="ob-sheet-plus">+</span>
              <span data-i18n="${rowKey}"></span>
            </span>
          </div>
          <div class="ob-phone-bar ob-phone-bar--right">
            ${trigger}
            <i class="ob-tap ob-tap--bar"></i>
          </div>
        </div>
      </div>`;
  }

  const SLIDES = [
    { scene: 'radar',     html: radarScene,     keys: 's1' },
    { scene: 'timetable', html: timetableScene, keys: 's2' },
    { scene: 'companion', html: companionScene, keys: 's3' },
  ];
  if (!IS_STANDALONE) {
    SLIDES.push({
      scene: 'install',
      html: installScene,
      keys: 's4',
      subKey: IS_IOS
        ? 'ob.s4.sub_ios'
        : (IS_SAMSUNG ? 'ob.s4.sub_samsung' : 'ob.s4.sub_android'),
    });
  }

  /* ── Aufbau ─────────────────────────────────────────────────────────── */

  function buildOverlay() {
    const el = document.createElement('div');
    el.className = 'ob-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('data-i18n-aria-label', 'ob.label');

    const segs = SLIDES.map(() => '<div class="ob-seg"></div>').join('');
    const slides = SLIDES.map((slide, i) => {
      const last = i === SLIDES.length - 1;
      return `
        <section class="ob-slide" data-scene="${slide.scene}">
          <div class="ob-scene">${slide.html()}</div>
          <div class="ob-copy">
            <div class="ob-kicker" data-i18n="ob.${slide.keys}.kicker"></div>
            <h2 class="ob-headline" data-i18n-html="ob.${slide.keys}.headline"></h2>
            <p class="ob-sub" data-i18n="${slide.subKey || `ob.${slide.keys}.sub`}"></p>
            ${last
              ? `<div class="ob-cta-row">
                   ${slide.scene === 'install'
                     ? `<button class="ob-install" type="button" ${IS_IOS ? '' : 'hidden '}data-i18n="${IS_IOS ? 'ob.install_ios' : 'ob.install'}"></button>`
                     : ''}
                   <button class="ob-cta" type="button">
                     <span data-i18n="ob.cta"></span><span class="ob-cta-arrow">→</span>
                   </button>
                 </div>`
              : `<div class="ob-hint">
                   <span data-i18n="ob.hint"></span><span class="ob-hint-arrow">→</span>
                 </div>`}
          </div>
        </section>`;
    }).join('');

    const lang = (window.LANG === 'de') ? 'de' : 'en';
    el.innerHTML = `
      <div class="ob-top">
        <div class="ob-progress">${segs}</div>
        <div class="ob-lang" role="group" aria-label="Language">
          <button type="button" data-ob-lang="de" class="${lang === 'de' ? 'active' : ''}">DE</button>
          <button type="button" data-ob-lang="en" class="${lang === 'en' ? 'active' : ''}">EN</button>
        </div>
        <button class="ob-skip" type="button" data-i18n="ob.skip"></button>
      </div>
      <div class="ob-stage">${slides}</div>`;

    if (typeof window.applyTranslations === 'function') window.applyTranslations(el);
    return el;
  }

  /* ── Navigation & Timing ────────────────────────────────────────────── */

  function clearAdvance() {
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
  }

  function armAdvance() {
    clearAdvance();
    if (REDUCED || idx >= SLIDES.length - 1) return;
    slideStartedAt = Date.now();
    advanceTimer = setTimeout(() => goTo(idx + 1, 1), remaining);
  }

  function renderProgress() {
    overlay.querySelectorAll('.ob-seg').forEach((seg, i) => {
      seg.classList.remove('done', 'active', 'hold');
      if (i < idx) seg.classList.add('done');
      if (i === idx) {
        seg.classList.add('active');
        if (REDUCED || idx === SLIDES.length - 1) seg.classList.add('hold');
      }
    });
  }

  function goTo(target, dir) {
    if (!overlay) return;
    idx = Math.max(0, Math.min(SLIDES.length - 1, target));
    remaining = SLIDE_MS;
    paused = false;
    overlay.classList.remove('ob-paused');

    overlay.querySelectorAll('.ob-slide').forEach((slide, i) => {
      slide.classList.remove('active', 'from-right', 'from-left');
      if (i === idx) {
        void slide.offsetWidth; // Reflow → Szenen-Animationen starten neu
        slide.classList.add(dir < 0 ? 'from-left' : 'from-right', 'active');
      }
    });
    renderProgress();
    armAdvance();
  }

  function pauseStory() {
    if (paused || !overlay) return;
    paused = true;
    overlay.classList.add('ob-paused');
    if (advanceTimer) {
      clearAdvance();
      remaining = Math.max(400, remaining - (Date.now() - slideStartedAt));
    }
  }

  function resumeStory() {
    if (!paused || !overlay) return;
    paused = false;
    overlay.classList.remove('ob-paused');
    armAdvance();
  }

  /* ── Öffnen / Schließen ─────────────────────────────────────────────── */

  function markSeen() {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch (err) { /* private mode */ }
  }

  function hasSeen() {
    try { return !!localStorage.getItem(SEEN_KEY); } catch (err) { return true; }
  }

  function setLanguage(lang) {
    if (lang !== 'de' && lang !== 'en') return;
    try { localStorage.setItem('setradar_lang', lang); } catch (err) { /* private mode */ }
    window.LANG = lang;
    document.documentElement.lang = lang;
    if (overlay) {
      overlay.querySelectorAll('.ob-lang button').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.obLang === lang));
      if (typeof window.applyTranslations === 'function') window.applyTranslations(overlay);
    }
  }

  function close() {
    if (!overlay) return;
    markSeen();
    clearAdvance();
    const el = overlay;
    const langChanged = langAtOpen && window.LANG !== langAtOpen;
    overlay = null;
    el.classList.add('ob-closing');
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    setTimeout(() => el.remove(), 320);
    document.removeEventListener('keydown', onKeydown);
    // Dynamische App-Inhalte rendern nur beim Laden — nach Sprachwechsel neu
    // laden (gleiches Verhalten wie der Umschalter in den Einstellungen).
    if (langChanged) setTimeout(() => location.reload(), 330);
  }

  function open() {
    if (overlay) return;
    idx = 0;
    remaining = SLIDE_MS;
    langAtOpen = window.LANG || 'en';
    overlay = buildOverlay();
    document.body.appendChild(overlay);
    // Scroll-Lock auf beiden Ebenen: body allein reicht je nach Browser nicht,
    // um das Scrollen der Seite hinter dem Overlay zu verhindern.
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    wireOverlay();
    document.addEventListener('keydown', onKeydown);
    goTo(0, 1);
  }

  /* ── Input ──────────────────────────────────────────────────────────── */

  function onKeydown(e) {
    if (!overlay) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') goTo(idx + 1, 1);
    else if (e.key === 'ArrowLeft') goTo(idx - 1, -1);
  }

  function wireOverlay() {
    overlay.querySelector('.ob-skip').addEventListener('click', close);
    const cta = overlay.querySelector('.ob-cta');
    if (cta) cta.addEventListener('click', close);
    overlay.querySelectorAll('.ob-lang button').forEach(btn =>
      btn.addEventListener('click', () => setLanguage(btn.dataset.obLang)));

    const installBtn = overlay.querySelector('.ob-install');
    if (installBtn) {
      if (IS_IOS) {
        installBtn.addEventListener('click', openInstallGuide);
      } else {
        if (installPrompt) installBtn.hidden = false;
        installBtn.addEventListener('click', async () => {
          const prompt = installPrompt;
          if (!prompt) return;
          installPrompt = null;
          installBtn.hidden = true;
          try { await prompt.prompt(); } catch (err) { /* dismissed */ }
        });
      }
    }

    overlay.addEventListener('pointerdown', e => {
      if (e.target.closest('.ob-skip, .ob-cta, .ob-lang, .ob-install, .ob-guide')) return;
      pointer = { x: e.clientX, y: e.clientY, t: Date.now() };
      holdTimer = setTimeout(pauseStory, 240);
    });

    overlay.addEventListener('pointerup', e => {
      if (!pointer) return;
      clearTimeout(holdTimer);
      const dx = e.clientX - pointer.x;
      const dy = e.clientY - pointer.y;
      const dt = Date.now() - pointer.t;
      const wasPaused = paused;
      pointer = null;
      resumeStory();

      if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        goTo(idx + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1); // Swipe
        return;
      }
      if (wasPaused || dt >= 240 || Math.abs(dx) > 12 || Math.abs(dy) > 12) return;
      if (e.clientX < window.innerWidth * 0.28) goTo(idx - 1, -1);
      else if (idx < SLIDES.length - 1) goTo(idx + 1, 1);
    });

    overlay.addEventListener('pointercancel', () => {
      pointer = null;
      clearTimeout(holdTimer);
      resumeStory();
    });
  }

  /* ── iOS-Install-Guide: Pfeil auf den echten Teilen-Button ──────────── */

  function closeInstallGuide() {
    overlay?.querySelector('.ob-guide')?.remove();
  }

  function openInstallGuide() {
    if (!overlay || overlay.querySelector('.ob-guide')) return;
    // Safari (iOS 26): \u22ef unten rechts -> Teilen -> \u201eMehr anzeigen\u201c -> + Zum Home-Bildschirm.
    // In Chrome/Firefox/Edge auf iOS gibt es die Option nicht -> Hinweis auf Safari.
    const steps = [
      { icon: '<span class="ob-guide-glyph">\u22ef</span>', key: 'ob.guide_step_dots' },
      { icon: `<svg class="ob-guide-share" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M12 14V3.5"/><path d="M8.5 6.5 12 3l3.5 3.5"/>
            <path d="M7 10H5.5v9.5h13V10H17"/>
          </svg>`, key: 'ob.guide_step_share' },
      { icon: `<svg class="ob-guide-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 9 7 7 7-7"/></svg>`, key: 'ob.guide_step_more' },
      { icon: '<span class="ob-guide-plus">+</span>', key: 'ob.guide_step_add' },
    ];
    const guide = document.createElement('div');
    guide.className = 'ob-guide' + (IS_IOS_ALT_BROWSER ? '' : ' ob-guide--br');
    guide.innerHTML = `
      <div class="ob-guide-box">
        <div class="ob-guide-title" data-i18n="ob.guide_title"></div>
        ${IS_IOS_ALT_BROWSER
          ? '<p class="ob-guide-safari" data-i18n="ob.guide_safari_only"></p>'
          : ''}
        ${steps.map((step, i) => `
        <div class="ob-guide-step">
          <span class="ob-guide-num">${i + 1}</span>
          ${step.icon}
          <span data-i18n="${step.key}"></span>
        </div>`).join('')}
        <p class="ob-guide-hint" data-i18n="ob.guide_hint"></p>
        <button class="ob-guide-done" type="button" data-i18n="ob.guide_done"></button>
      </div>
      ${IS_IOS_ALT_BROWSER ? '' : '<div class="ob-guide-arrow" aria-hidden="true">\u2193</div>'}`;
    overlay.appendChild(guide);
    if (typeof window.applyTranslations === 'function') window.applyTranslations(guide);
    guide.addEventListener('click', e => {
      if (e.target === guide || e.target.closest('.ob-guide-done')) closeInstallGuide();
    });
  }

  /* ── Einstiegspunkte ────────────────────────────────────────────────── */

  function init() {
    // Replay aus dem Hilfe-Sheet
    document.addEventListener('click', e => {
      if (!e.target.closest('#helpTutorialBtn')) return;
      document.getElementById('helpClose')?.click();
      setTimeout(open, 240);
    });

    // Erster Besuch: automatisch öffnen (nach dem ersten Paint). Nur auf der
    // Feed-Seite — auf Unterseiten laeuft das Tutorial nur per Replay-Button.
    if (!hasSeen() && document.body.dataset.page === 'home') setTimeout(open, 650);
  }

  window.openOnboarding = open;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
