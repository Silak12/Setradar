(function () {
  'use strict';

  function openHelp() {
    const overlay = document.getElementById('helpOverlay');
    if (!overlay) return;
    overlay.removeAttribute('inert');
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeHelp() {
    const overlay = document.getElementById('helpOverlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('inert', '');
    document.body.style.overflow = '';
  }

  function init() {
    document.getElementById('helpBg')?.addEventListener('click', closeHelp);
    document.getElementById('helpClose')?.addEventListener('click', closeHelp);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.getElementById('helpOverlay')?.classList.contains('open')) {
        closeHelp();
      }
    });

    const sheet = document.querySelector('.help-sheet');
    if (sheet) {
      let startY = 0, dragging = false;
      sheet.querySelector('.help-topline')?.addEventListener('touchstart', e => {
        startY = e.touches[0].clientY;
        dragging = true;
        sheet.style.transition = 'none';
      }, { passive: true });
      document.addEventListener('touchmove', e => {
        if (!dragging) return;
        const delta = Math.max(0, e.touches[0].clientY - startY);
        sheet.style.transform = `translateY(${delta}px)`;
      }, { passive: true });
      const finish = e => {
        if (!dragging) return;
        dragging = false;
        const delta = Math.max(0, (e.changedTouches?.[0]?.clientY ?? startY) - startY);
        sheet.style.transition = '';
        sheet.style.transform = '';
        if (delta > 100) closeHelp();
      };
      document.addEventListener('touchend', finish);
      document.addEventListener('touchcancel', finish);
    }

    // Event delegation — works even if navbar is re-rendered
    document.addEventListener('click', e => {
      if (e.target.closest('#navHelpBtn')) openHelp();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
