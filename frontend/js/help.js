/**
 * help.js — Hilfe-Sheet ("?" in der Navbar)
 *
 * Das Markup kommt asynchron aus components/help.html (geteilt zwischen
 * Startseite und Profil). Deshalb wird ausschliesslich ueber Delegation am
 * document gebunden — direkte Listener auf #helpBg / #helpClose / .help-topline
 * wuerden beim Init ins Leere laufen, weil die Elemente dann noch nicht
 * existieren.
 */
(function () {
  'use strict';

  function getOverlay() {
    return document.getElementById('helpOverlay');
  }

  function openHelp() {
    const overlay = getOverlay();
    if (!overlay) return;
    overlay.removeAttribute('inert');
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeHelp() {
    const overlay = getOverlay();
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('inert', '');
    document.body.style.overflow = '';
  }

  function initDragToClose() {
    let sheet = null;
    let startY = 0;

    document.addEventListener('touchstart', e => {
      const topline = e.target.closest?.('.help-topline');
      if (!topline) return;
      sheet = topline.closest('.help-sheet');
      if (!sheet) return;
      startY = e.touches[0].clientY;
      sheet.style.transition = 'none';
    }, { passive: true });

    document.addEventListener('touchmove', e => {
      if (!sheet) return;
      const delta = Math.max(0, e.touches[0].clientY - startY);
      sheet.style.transform = `translateY(${delta}px)`;
    }, { passive: true });

    const finish = e => {
      if (!sheet) return;
      const delta = Math.max(0, (e.changedTouches?.[0]?.clientY ?? startY) - startY);
      sheet.style.transition = '';
      sheet.style.transform = '';
      sheet = null;
      if (delta > 100) closeHelp();
    };
    document.addEventListener('touchend', finish);
    document.addEventListener('touchcancel', finish);
  }

  function init() {
    document.addEventListener('click', e => {
      if (e.target.closest('#navHelpBtn')) { openHelp(); return; }
      if (e.target.closest('#helpBg, #helpClose')) closeHelp();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && getOverlay()?.classList.contains('open')) closeHelp();
    });

    initDragToClose();
  }

  window.openHelp = openHelp;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
