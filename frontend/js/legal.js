/**
 * legal.js - Imprint, privacy, terms
 */

const LEGAL_CONTENT = {
  en: {
    impressum: {
      title: 'Imprint',
      html: `
        <h2 class="legal-heading">Imprint</h2>
        <p class="legal-sub">Information according to Section 5 TMG</p>
        <div class="legal-block"><strong>Leonard Marx &amp; Nick Zander GbR</strong><br>Immenstrasse 13<br>14542 Werder (Havel)<br>Germany</div>
        <div class="legal-block"><span class="legal-label">Represented by</span><br>Leonard Marx<br>Nick Zander</div>
        <div class="legal-block"><span class="legal-label">Contact</span><br>Email: <a href="mailto:berlinlaughevents@gmail.com" class="legal-link">berlinlaughevents@gmail.com</a></div>
        <div class="legal-block"><span class="legal-label">Responsible for content according to Section 18 para. 2 MStV</span><br>Leonard Marx<br>Immenstrasse 13, 14542 Werder (Havel)</div>
        <div class="legal-block"><span class="legal-label">Disclaimer</span><br>This website is created with great care. However, we cannot guarantee the accuracy, completeness, or timeliness of content, especially timetable, event time, and lineup information. This information may be provided by third parties or captured automatically and can change at short notice.</div>
        <div class="legal-block"><span class="legal-label">External links</span><br>This website may contain links to third-party sites. Their operators are solely responsible for their content.</div>
        <div class="legal-block"><span class="legal-label">Copyright</span><br>Content created by the website operators is subject to German copyright law. Any use beyond copyright limits requires written permission from the respective author or creator.</div>
      `,
    },
    datenschutz: {
      title: 'Privacy Policy',
      html: `
        <h2 class="legal-heading">Privacy Policy</h2>
        <p class="legal-sub">Status: April 2026</p>
        <div class="legal-block"><span class="legal-label">1. Controller</span><br>Leonard Marx &amp; Nick Zander GbR<br>Immenstrasse 13, 14542 Werder (Havel)<br>Email: <a href="mailto:berlinlaughevents@gmail.com" class="legal-link">berlinlaughevents@gmail.com</a></div>
        <div class="legal-block"><span class="legal-label">2. Data we process</span><br><strong>Account data:</strong> email address and password for registration.<br><br><strong>Usage data:</strong> favorite acts, clubs and events, ratings, hype interactions, and presence data such as queue, club entry, and exit information.<br><br><strong>Technical data:</strong> IP address and browser information processed temporarily when visiting the website.</div>
        <div class="legal-block"><span class="legal-label">3. Service providers</span><br><strong>Supabase Inc. (USA):</strong> backend, database, and authentication.<br><br><strong>GitHub Pages (Microsoft Corporation, USA):</strong> hosting provider.<br><br><strong>Google Fonts:</strong> font delivery for rendering the website.</div>
        <div class="legal-block"><span class="legal-label">4. Cookies and local storage</span><br>We use technically necessary local storage entries for login sessions. We do not use tracking, analytics, or advertising cookies.</div>
        <div class="legal-block"><span class="legal-label">5. Retention</span><br>Account data is stored until account deletion. Personal data is removed within 30 days after deletion unless legal obligations require otherwise.</div>
        <div class="legal-block"><span class="legal-label">6. Your rights</span><br>You have the right to access, rectify, erase, restrict processing, receive your data, and object to processing. To exercise these rights, contact us at <a href="mailto:berlinlaughevents@gmail.com" class="legal-link">berlinlaughevents@gmail.com</a>.</div>
        <div class="legal-block"><span class="legal-label">7. Security</span><br>We use technical and organizational measures to protect your data. Transmission is encrypted via HTTPS. Passwords are stored only in hashed form.</div>
      `,
    },
    nutzungsbedingungen: {
      title: 'Terms of Use',
      html: `
        <h2 class="legal-heading">Terms of Use</h2>
        <p class="legal-sub">Status: April 2026</p>
        <div class="legal-block"><span class="legal-label">1. Scope</span><br>These terms apply to the use of the Setradar web application operated by Leonard Marx &amp; Nick Zander GbR, Immenstrasse 13, 14542 Werder (Havel).</div>
        <div class="legal-block"><span class="legal-label">2. Service description</span><br>Setradar is an information platform for techno and electronic music events, providing timetable information, act and club information, and community features such as hype, ratings, and presence data.</div>
        <div class="legal-block"><span class="legal-label">3. Account</span><br>Some features require an account. You must provide truthful information and keep your access credentials confidential.</div>
        <div class="legal-block"><span class="legal-label">4. User obligations</span><br>You may not publish misleading information, overload the service through automated requests, harass other users, publish unlawful content, or interfere with the technical infrastructure.</div>
        <div class="legal-block"><span class="legal-label">5. Accuracy</span><br>Timetable and lineup information is provided to the best of our knowledge, but may change at short notice. Official communication by organizers and clubs takes precedence.</div>
        <div class="legal-block"><span class="legal-label">6. Availability</span><br>We aim for high availability but cannot guarantee uninterrupted access.</div>
        <div class="legal-block"><span class="legal-label">7. Liability</span><br>We are not liable for damages resulting from use or unavailability of the service, except where mandatory law requires otherwise.</div>
        <div class="legal-block"><span class="legal-label">8. Termination</span><br>You can delete your account at any time in the settings. We may suspend or delete accounts that violate these terms.</div>
        <div class="legal-block"><span class="legal-label">9. Changes</span><br>We may update these terms at any time. Continued use after changes take effect constitutes acceptance.</div>
        <div class="legal-block"><span class="legal-label">10. Applicable law</span><br>German law applies to the extent permitted by law.</div>
      `,
    },
  },
  de: {
    impressum: {
      title: 'Impressum',
      html: `
        <h2 class="legal-heading">Impressum</h2>
        <p class="legal-sub">Angaben gemaess § 5 TMG</p>
        <div class="legal-block"><strong>Leonard Marx &amp; Nick Zander GbR</strong><br>Immenstrasse 13<br>14542 Werder (Havel)<br>Deutschland</div>
        <div class="legal-block"><span class="legal-label">Vertreten durch</span><br>Leonard Marx<br>Nick Zander</div>
        <div class="legal-block"><span class="legal-label">Kontakt</span><br>E-Mail: <a href="mailto:berlinlaughevents@gmail.com" class="legal-link">berlinlaughevents@gmail.com</a></div>
        <div class="legal-block"><span class="legal-label">Verantwortlich fuer den Inhalt nach § 18 Abs. 2 MStV</span><br>Leonard Marx<br>Immenstrasse 13, 14542 Werder (Havel)</div>
        <div class="legal-block"><span class="legal-label">Haftungsausschluss</span><br>Die Inhalte dieser Website wurden mit groesstmoeglicher Sorgfalt erstellt. Fuer die Richtigkeit, Vollstaendigkeit und Aktualitaet der Inhalte, insbesondere Timetable-, Event- und Line-up-Informationen, koennen wir jedoch keine Gewaehr uebernehmen.</div>
        <div class="legal-block"><span class="legal-label">Haftung fuer Links</span><br>Diese Website kann Links zu externen Seiten enthalten. Fuer deren Inhalte sind ausschliesslich die jeweiligen Betreiber verantwortlich.</div>
        <div class="legal-block"><span class="legal-label">Urheberrecht</span><br>Die von den Seitenbetreibern erstellten Inhalte unterliegen dem deutschen Urheberrecht. Jede Verwertung ausserhalb der Grenzen des Urheberrechts bedarf der schriftlichen Zustimmung.</div>
      `,
    },
    datenschutz: {
      title: 'Datenschutzerklaerung',
      html: `
        <h2 class="legal-heading">Datenschutzerklaerung</h2>
        <p class="legal-sub">Stand: April 2026</p>
        <div class="legal-block"><span class="legal-label">1. Verantwortlicher</span><br>Leonard Marx &amp; Nick Zander GbR<br>Immenstrasse 13, 14542 Werder (Havel)<br>E-Mail: <a href="mailto:berlinlaughevents@gmail.com" class="legal-link">berlinlaughevents@gmail.com</a></div>
        <div class="legal-block"><span class="legal-label">2. Erhobene Daten</span><br><strong>Accountdaten:</strong> E-Mail-Adresse und Passwort bei Registrierung.<br><br><strong>Nutzungsdaten:</strong> favorisierte Acts, Clubs und Events, Ratings, Hype-Interaktionen sowie Presence-Daten wie Warteschlange, Club-Eintritt und Exit.<br><br><strong>Technische Daten:</strong> IP-Adresse und Browserinformationen beim Besuch der Website.</div>
        <div class="legal-block"><span class="legal-label">3. Dienstleister</span><br><strong>Supabase Inc. (USA):</strong> Backend, Datenbank und Authentifizierung.<br><br><strong>GitHub Pages (Microsoft Corporation, USA):</strong> Hosting.<br><br><strong>Google Fonts:</strong> Schriftarten fuer die Darstellung der Website.</div>
        <div class="legal-block"><span class="legal-label">4. Cookies und lokaler Speicher</span><br>Wir verwenden technisch notwendige Local-Storage-Eintraege fuer Login-Sitzungen. Tracking-, Analyse- oder Werbe-Cookies werden nicht eingesetzt.</div>
        <div class="legal-block"><span class="legal-label">5. Speicherdauer</span><br>Accountdaten werden bis zur Loeschung des Accounts gespeichert. Personenbezogene Daten werden innerhalb von 30 Tagen nach Loeschung entfernt, sofern keine gesetzlichen Pflichten entgegenstehen.</div>
        <div class="legal-block"><span class="legal-label">6. Deine Rechte</span><br>Du hast das Recht auf Auskunft, Berichtigung, Loeschung, Einschraenkung der Verarbeitung, Datenuebertragbarkeit und Widerspruch. Kontaktiere uns dazu unter <a href="mailto:berlinlaughevents@gmail.com" class="legal-link">berlinlaughevents@gmail.com</a>.</div>
        <div class="legal-block"><span class="legal-label">7. Sicherheit</span><br>Wir setzen technische und organisatorische Massnahmen zum Schutz deiner Daten ein. Die Uebertragung erfolgt verschluesselt via HTTPS. Passwoerter werden nur gehasht gespeichert.</div>
      `,
    },
    nutzungsbedingungen: {
      title: 'Nutzungsbedingungen',
      html: `
        <h2 class="legal-heading">Nutzungsbedingungen</h2>
        <p class="legal-sub">Stand: April 2026</p>
        <div class="legal-block"><span class="legal-label">1. Geltungsbereich</span><br>Diese Bedingungen gelten fuer die Nutzung der Webanwendung Setradar, betrieben von Leonard Marx &amp; Nick Zander GbR, Immenstrasse 13, 14542 Werder (Havel).</div>
        <div class="legal-block"><span class="legal-label">2. Leistungsbeschreibung</span><br>Setradar ist eine Informationsplattform fuer Techno- und elektronische Musik-Events mit Timetable-, Act- und Club-Informationen sowie Community-Funktionen wie Hype, Ratings und Presence-Daten.</div>
        <div class="legal-block"><span class="legal-label">3. Account</span><br>Bestimmte Funktionen setzen einen Account voraus. Du bist verpflichtet, wahrheitsgemaesse Angaben zu machen und deine Zugangsdaten vertraulich zu behandeln.</div>
        <div class="legal-block"><span class="legal-label">4. Nutzerpflichten</span><br>Untersagt sind insbesondere irrefuehrende Inhalte, automatisierte Ueberlastung des Dienstes, Belaestigung anderer Nutzer, rechtswidrige Inhalte und Eingriffe in die technische Infrastruktur.</div>
        <div class="legal-block"><span class="legal-label">5. Genauigkeit</span><br>Timetable- und Line-up-Informationen werden nach bestem Wissen bereitgestellt, koennen sich jedoch kurzfristig aendern. Offizielle Kommunikation der Veranstalter und Clubs hat Vorrang.</div>
        <div class="legal-block"><span class="legal-label">6. Verfuegbarkeit</span><br>Wir bemuehen uns um eine hohe Verfuegbarkeit, koennen jedoch keine unterbrechungsfreie Erreichbarkeit garantieren.</div>
        <div class="legal-block"><span class="legal-label">7. Haftung</span><br>Wir haften nicht fuer Schaeden aus Nutzung oder Nichtverfuegbarkeit des Dienstes, soweit gesetzlich zulaessig.</div>
        <div class="legal-block"><span class="legal-label">8. Kuendigung</span><br>Du kannst deinen Account jederzeit in den Einstellungen loeschen. Bei Verstoessen gegen diese Bedingungen koennen Accounts gesperrt oder geloescht werden.</div>
        <div class="legal-block"><span class="legal-label">9. Aenderungen</span><br>Wir koennen diese Bedingungen jederzeit anpassen. Die weitere Nutzung nach Inkrafttreten gilt als Zustimmung.</div>
        <div class="legal-block"><span class="legal-label">10. Anwendbares Recht</span><br>Es gilt deutsches Recht, soweit gesetzlich zulaessig.</div>
      `,
    },
  },
};

function currentLegalLang() {
  return window.LANG === 'de' ? 'de' : 'en';
}

function initLegalModal() {
  if (document.getElementById('legalOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'legalOverlay';
  overlay.className = 'legal-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <div class="legal-overlay-bg" id="legalOverlayBg"></div>
    <div class="legal-modal" role="dialog" aria-modal="true" aria-labelledby="legalTitle">
      <div class="legal-modal-topline"></div>
      <button class="legal-close" id="legalClose" aria-label="${window.t ? t('common.close') : 'Close'}">
        <span>ESC</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M18 6 6 18M6 6l12 12"/>
        </svg>
      </button>
      <div class="legal-body" id="legalBody"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('legalOverlayBg').addEventListener('click', closeLegal);
  document.getElementById('legalClose').addEventListener('click', closeLegal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('legalOverlay')?.classList.contains('open')) closeLegal();
  });
}

function openLegal(type) {
  const lang = currentLegalLang();
  const content = LEGAL_CONTENT[lang]?.[type];
  if (!content) return;
  const overlay = document.getElementById('legalOverlay');
  const body = document.getElementById('legalBody');
  if (!overlay || !body) return;
  body.innerHTML = content.html;
  body.scrollTop = 0;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeLegal() {
  const overlay = document.getElementById('legalOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLegalModal);
} else {
  initLegalModal();
}
