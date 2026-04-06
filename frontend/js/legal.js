/**
 * legal.js — Impressum, Datenschutz, Nutzungsbedingungen
 * Popup-Modal, shared across all pages.
 */

const LEGAL_CONTENT = {
  impressum: {
    title: 'Impressum',
    html: `
      <h2 class="legal-heading">Impressum</h2>
      <p class="legal-sub">Angaben gemäß § 5 TMG</p>

      <div class="legal-block">
        <strong>Leonard Marx &amp; Nick Zander GbR</strong><br>
        Immenstraße 13<br>
        14542 Werder (Havel)<br>
        Deutschland
      </div>

      <div class="legal-block">
        <span class="legal-label">Vertreten durch</span><br>
        Leonard Marx<br>
        Nick Zander
      </div>

      <div class="legal-block">
        <span class="legal-label">Kontakt</span><br>
        E-Mail: <a href="mailto:berlinlaughevents@gmail.com" class="legal-link">berlinlaughevents@gmail.com</a>
      </div>

      <div class="legal-block">
        <span class="legal-label">Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</span><br>
        Leonard Marx<br>
        Immenstraße 13, 14542 Werder (Havel)
      </div>

      <div class="legal-block">
        <span class="legal-label">Haftungsausschluss</span><br>
        Die Inhalte dieser Website wurden mit größtmöglicher Sorgfalt erstellt. Für die Richtigkeit,
        Vollständigkeit und Aktualität der Inhalte — insbesondere Timetable-Angaben, Event-Zeiten und
        Line-up-Informationen für alle abgedeckten Städte — können wir jedoch keine Gewähr übernehmen.
        Diese werden von Dritten bereitgestellt oder automatisiert erfasst und können sich kurzfristig ändern.
      </div>

      <div class="legal-block">
        <span class="legal-label">Haftung für Links</span><br>
        Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben.
        Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter verantwortlich.
      </div>

      <div class="legal-block">
        <span class="legal-label">Urheberrecht</span><br>
        Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen
        Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb
        der Grenzen des Urheberrechts bedürfen der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers.
      </div>
    `,
  },

  datenschutz: {
    title: 'Datenschutzerklärung',
    html: `
      <h2 class="legal-heading">Datenschutzerklärung</h2>
      <p class="legal-sub">Stand: April 2026</p>

      <div class="legal-block">
        <span class="legal-label">1. Verantwortlicher</span><br>
        Leonard Marx &amp; Nick Zander GbR<br>
        Immenstraße 13, 14542 Werder (Havel)<br>
        E-Mail: <a href="mailto:berlinlaughevents@gmail.com" class="legal-link">berlinlaughevents@gmail.com</a>
      </div>

      <div class="legal-block">
        <span class="legal-label">2. Erhobene Daten &amp; Zweck</span><br>
        Wir erheben folgende personenbezogene Daten:<br><br>
        <strong>Accountdaten:</strong> E-Mail-Adresse und Passwort (verschlüsselt gespeichert) bei Registrierung.
        Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).<br><br>
        <strong>Nutzungsdaten:</strong> Favorisierte Acts, Clubs und Events; abgegebene Bewertungen; Hype-Interaktionen;
        Anwesenheitsdaten (Warteschlange, Club-Eintritt, -Austritt) für alle unterstützten Städte. Diese Daten sind
        für die Kernfunktion der App erforderlich. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.<br><br>
        <strong>Technische Daten:</strong> IP-Adresse und Browser-Informationen werden beim Aufruf der Website
        vorübergehend verarbeitet. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse am
        sicheren Betrieb).
      </div>

      <div class="legal-block">
        <span class="legal-label">3. Drittanbieter &amp; Auftragsverarbeitung</span><br>
        <strong>Supabase Inc. (USA):</strong> Wir verwenden Supabase als Backend-Dienst (Datenbank, Authentifizierung).
        Supabase verarbeitet personenbezogene Daten in unserem Auftrag. Es besteht ein Auftragsverarbeitungsvertrag
        gemäß Art. 28 DSGVO. Die Datenübertragung in die USA erfolgt auf Basis der EU-Standardvertragsklauseln
        (Art. 46 DSGVO). Weitere Informationen: <span class="legal-link">supabase.com/privacy</span><br><br>
        <strong>GitHub Pages (Microsoft Corporation, USA):</strong> Diese Website wird über GitHub Pages gehostet.
        GitHub verarbeitet dabei technische Zugriffsdaten. Weitere Informationen: <span class="legal-link">docs.github.com/en/site-policy/privacy-policies</span><br><br>
        <strong>Google Fonts:</strong> Beim Laden der Website werden Schriftarten von Google Fonts (Google LLC, USA)
        eingebunden. Dabei wird deine IP-Adresse an Google übermittelt. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO.
        Du kannst dies durch Verwendung eines Werbeblockers unterbinden.
      </div>

      <div class="legal-block">
        <span class="legal-label">4. Cookies &amp; lokaler Speicher</span><br>
        <strong>Technisch notwendig:</strong><br>
        Zur Aufrechterhaltung der Anmeldesitzung verwenden wir localStorage-Einträge des Dienstes Supabase.
        Diese sind für den Betrieb des Logins zwingend erforderlich und fallen unter Art. 6 Abs. 1 lit. b DSGVO.<br><br>
        <strong>Google Fonts:</strong><br>
        Zur korrekten Darstellung der Website werden Schriftarten über Google Fonts (Google LLC, USA) geladen.
        Dabei wird deine IP-Adresse an Google übermittelt. Die Einbindung erfolgt auf Basis unseres
        berechtigten Interesses an einer einheitlichen und technisch einwandfreien Darstellung der Website
        (Art. 6 Abs. 1 lit. f DSGVO). Du kannst die Übermittlung durch den Einsatz eines
        entsprechenden Browser-Plugins (z.B. uBlock Origin) unterbinden.<br><br>
        Es werden keine Tracking-, Analyse- oder Werbe-Cookies eingesetzt.
      </div>

      <div class="legal-block">
        <span class="legal-label">5. Speicherdauer</span><br>
        Accountdaten werden bis zur Löschung des Accounts gespeichert. Nach Löschung werden alle
        personenbezogenen Daten innerhalb von 30 Tagen entfernt. Technische Log-Daten werden
        nach 30 Tagen gelöscht.
      </div>

      <div class="legal-block">
        <span class="legal-label">6. Deine Rechte (Art. 15–22 DSGVO)</span><br>
        Du hast das Recht auf:<br>
        · Auskunft über deine gespeicherten Daten<br>
        · Berichtigung unrichtiger Daten<br>
        · Löschung deiner Daten (Recht auf Vergessenwerden)<br>
        · Einschränkung der Verarbeitung<br>
        · Datenübertragbarkeit<br>
        · Widerspruch gegen die Verarbeitung<br><br>
        Zur Ausübung deiner Rechte kontaktiere uns unter:
        <a href="mailto:berlinlaughevents@gmail.com" class="legal-link">berlinlaughevents@gmail.com</a><br><br>
        Du hast außerdem das Recht, dich bei der zuständigen Aufsichtsbehörde zu beschweren
        (in Brandenburg: Landesbeauftragte für den Datenschutz und für das Recht auf Akteneinsicht Brandenburg).
      </div>

      <div class="legal-block">
        <span class="legal-label">7. Datensicherheit</span><br>
        Wir setzen technische und organisatorische Maßnahmen ein, um deine Daten zu schützen.
        Die Übertragung erfolgt verschlüsselt via HTTPS. Passwörter werden ausschließlich gehasht gespeichert.
      </div>
    `,
  },

  nutzungsbedingungen: {
    title: 'Nutzungsbedingungen',
    html: `
      <h2 class="legal-heading">Nutzungsbedingungen</h2>
      <p class="legal-sub">Stand: April 2026</p>

      <div class="legal-block">
        <span class="legal-label">1. Geltungsbereich</span><br>
        Diese Nutzungsbedingungen gelten für die Nutzung der Webanwendung Setradar (nachfolgend „Dienst"),
        betrieben von der Leonard Marx &amp; Nick Zander GbR, Immenstraße 13, 14542 Werder (Havel).
      </div>

      <div class="legal-block">
        <span class="legal-label">2. Leistungsbeschreibung</span><br>
        Setradar ist eine städteübergreifende Informationsplattform für Techno- und elektronische Musik-Events
        in Deutschland. Der Dienst stellt Timetable-Informationen, Act- und Club-Informationen sowie
        Community-Funktionen (Hype, Bewertungen, Anwesenheitsdaten) bereit — derzeit mit Schwerpunkt
        auf Berlin sowie weiteren deutschen Städten. Alle Inhalte dienen ausschließlich
        Informationszwecken und erheben keinen Anspruch auf Vollständigkeit oder Aktualität.
      </div>

      <div class="legal-block">
        <span class="legal-label">3. Registrierung &amp; Account</span><br>
        Die Nutzung bestimmter Funktionen erfordert die Erstellung eines Accounts. Du bist verpflichtet,
        wahrheitsgemäße Angaben zu machen und deine Zugangsdaten vertraulich zu behandeln. Eine
        Weitergabe deiner Zugangsdaten an Dritte ist nicht gestattet. Du bist für alle Aktivitäten
        verantwortlich, die unter deinem Account stattfinden.
      </div>

      <div class="legal-block">
        <span class="legal-label">4. Nutzerpflichten</span><br>
        Bei der Nutzung des Dienstes ist es untersagt:<br>
        · Falsche oder irreführende Informationen zu veröffentlichen<br>
        · Den Dienst durch automatisierte Abfragen (Bots, Scraper) zu überlasten<br>
        · Andere Nutzer zu belästigen, zu bedrohen oder zu schädigen<br>
        · Inhalte zu veröffentlichen, die gegen geltendes Recht verstoßen<br>
        · Die technische Infrastruktur des Dienstes anzugreifen oder zu manipulieren
      </div>

      <div class="legal-block">
        <span class="legal-label">5. Inhalte &amp; Genauigkeit</span><br>
        Timetable-Angaben, Line-ups und Event-Zeiten werden nach bestem Wissen bereitgestellt,
        können jedoch kurzfristig von Veranstaltern geändert werden. Wir übernehmen keine Haftung
        für die Richtigkeit dieser Informationen. Die offizielle Kommunikation der Veranstalter
        und Clubs hat stets Vorrang.
      </div>

      <div class="legal-block">
        <span class="legal-label">6. Verfügbarkeit</span><br>
        Wir bemühen uns um eine möglichst hohe Verfügbarkeit des Dienstes, übernehmen jedoch
        keine Garantie für eine ununterbrochene Erreichbarkeit. Wartungsarbeiten werden
        nach Möglichkeit angekündigt.
      </div>

      <div class="legal-block">
        <span class="legal-label">7. Haftungsbeschränkung</span><br>
        Wir haften nicht für Schäden, die durch die Nutzung oder Nichtnutzbarkeit des Dienstes
        entstehen, insbesondere nicht für entgangene Veranstaltungsbesuche aufgrund fehlerhafter
        Timetable-Informationen. Diese Haftungsbeschränkung gilt nicht bei Vorsatz oder grober
        Fahrlässigkeit sowie bei Schäden an Leib und Leben.
      </div>

      <div class="legal-block">
        <span class="legal-label">8. Kündigung &amp; Sperrung</span><br>
        Du kannst deinen Account jederzeit in den Einstellungen löschen. Wir behalten uns vor,
        Accounts bei Verstößen gegen diese Nutzungsbedingungen ohne Vorankündigung zu sperren
        oder zu löschen.
      </div>

      <div class="legal-block">
        <span class="legal-label">9. Änderungen der Nutzungsbedingungen</span><br>
        Wir behalten uns vor, diese Nutzungsbedingungen jederzeit zu ändern. Bei wesentlichen
        Änderungen werden registrierte Nutzer per E-Mail informiert. Die weitere Nutzung des
        Dienstes nach Inkrafttreten der Änderungen gilt als Zustimmung.
      </div>

      <div class="legal-block">
        <span class="legal-label">10. Anwendbares Recht &amp; Gerichtsstand</span><br>
        Es gilt deutsches Recht. Gerichtsstand ist, soweit gesetzlich zulässig, Werder (Havel).
        Für Verbraucher gilt der gesetzliche Gerichtsstand.
      </div>
    `,
  },
};

// ── Modal ─────────────────────────────────────────────────────────────────────

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
      <button class="legal-close" id="legalClose" aria-label="Schließen">
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
  const content = LEGAL_CONTENT[type];
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

// Init on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLegalModal);
} else {
  initLegalModal();
}
