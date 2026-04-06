/**
 * cookies.js — Cookie-Hinweis (DSGVO)
 *
 * Technisch notwendige Cookies:
 *   - Supabase Auth-Session (localStorage) — für Login zwingend erforderlich
 *   - Google Fonts (fonts.googleapis.com) — unter berechtigtem Interesse (Art. 6 Abs. 1 lit. f DSGVO),
 *     da für die korrekte Darstellung der Website essenziell. Kein Consent erforderlich.
 *
 * Es werden keine Tracking- oder Werbe-Cookies eingesetzt.
 */

const CONSENT_KEY = 'setradar_notice_v1';

function cookieNoticeDismissed() {
  return !!localStorage.getItem(CONSENT_KEY);
}

function dismissCookieNotice() {
  localStorage.setItem(CONSENT_KEY, '1');
  hideCookieBanner();
}

function hideCookieBanner() {
  const banner = document.getElementById('cookieBanner');
  if (!banner) return;
  banner.classList.remove('visible');
  banner.addEventListener('transitionend', () => banner.remove(), { once: true });
}

function showCookieBanner() {
  if (document.getElementById('cookieBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'cookieBanner';
  banner.className = 'cookie-banner';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', 'Cookie-Hinweis');
  banner.innerHTML = `
    <div class="cookie-banner-text">
      <span class="cookie-banner-eyebrow">// Cookies &amp; Datenschutz</span>
      <p>Diese Website verwendet technisch notwendige Cookies für den Login sowie Google Fonts
      zur Darstellung der Schriftarten. Es werden keine Tracking- oder Werbe-Cookies eingesetzt.</p>
    </div>
    <div class="cookie-banner-actions">
      <button class="cookie-btn cookie-btn--secondary" type="button" onclick="if(typeof openLegal==='function')openLegal('datenschutz')">Mehr erfahren</button>
      <button class="cookie-btn cookie-btn--primary" type="button" onclick="dismissCookieNotice()">Verstanden</button>
    </div>
  `;
  document.body.appendChild(banner);
  requestAnimationFrame(() => requestAnimationFrame(() => banner.classList.add('visible')));
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
