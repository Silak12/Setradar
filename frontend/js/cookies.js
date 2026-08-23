/**
 * cookies.js - Cookie notice
 */

const CONSENT_KEY = 'setradar_notice_v1';

function cookieNoticeDismissed() {
  return !!localStorage.getItem(CONSENT_KEY);
}

function dismissCookieNotice() {
  localStorage.setItem(CONSENT_KEY, '1');
  hideCookieBanner();
}

/**
 * Der Banner liegt fix ueber allem (z-index 1300) und wuerde sonst den
 * unteren Teil offener Sheets verdecken. Seine Hoehe wird als CSS-Variable
 * veroeffentlicht, damit scrollbare Sheets entsprechend Platz lassen.
 */
function syncCookieBannerHeight() {
  const banner = document.getElementById('cookieBanner');
  const height = banner ? Math.ceil(banner.getBoundingClientRect().height) + 12 : 0;
  document.documentElement.style.setProperty('--cookie-banner-h', `${height}px`);
}

function hideCookieBanner() {
  const banner = document.getElementById('cookieBanner');
  if (!banner) return;
  banner.classList.remove('visible');
  document.documentElement.style.setProperty('--cookie-banner-h', '0px');
  window.removeEventListener('resize', syncCookieBannerHeight);
  banner.addEventListener('transitionend', () => banner.remove(), { once: true });
}

function getCookieCopy() {
  const isGerman = window.LANG === 'de';
  return {
    aria: isGerman ? 'Cookie-Hinweis' : 'Cookie notice',
    eyebrow: `// Cookies & ${window.t ? t('footer.privacy') : (isGerman ? 'Datenschutz' : 'Privacy')}`,
    body: isGerman
      ? 'Diese Website verwendet technisch notwendige Cookies fuer den Login sowie Google Fonts zur Darstellung der Schriftarten. Es werden keine Tracking- oder Werbe-Cookies eingesetzt.'
      : 'This website uses technically necessary cookies for login and Google Fonts for rendering. No tracking or advertising cookies are used.',
    more: isGerman ? 'Mehr erfahren' : 'Learn more',
    ok: isGerman ? 'Verstanden' : 'Understood',
  };
}

function showCookieBanner() {
  if (document.getElementById('cookieBanner')) return;
  const copy = getCookieCopy();
  const banner = document.createElement('div');
  banner.id = 'cookieBanner';
  banner.className = 'cookie-banner';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', copy.aria);
  banner.innerHTML = `
    <div class="cookie-banner-text">
      <span class="cookie-banner-eyebrow">${copy.eyebrow}</span>
      <p>${copy.body}</p>
    </div>
    <div class="cookie-banner-actions">
      <button class="cookie-btn cookie-btn--secondary" type="button" onclick="if(typeof openLegal==='function')openLegal('datenschutz')">${copy.more}</button>
      <button class="cookie-btn cookie-btn--primary" type="button" onclick="dismissCookieNotice()">${copy.ok}</button>
    </div>
  `;
  document.body.appendChild(banner);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    banner.classList.add('visible');
    syncCookieBannerHeight();
  }));
  window.addEventListener('resize', syncCookieBannerHeight);
  // Der Banner waechst noch, wenn die Web-Fonts nachladen — dann neu messen.
  if (document.fonts?.ready) document.fonts.ready.then(syncCookieBannerHeight).catch(() => {});
}

function initCookies() {
  if (cookieNoticeDismissed()) return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showCookieBanner);
  } else {
    showCookieBanner();
  }
}

initCookies();
