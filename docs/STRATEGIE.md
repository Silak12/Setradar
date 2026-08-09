# Setradar — Strategie, Features, Business & Marketing

> Stand: Juli 2026 · Kontext: Community-Projekt, kostendeckend, Ausbau-Option offen.
> Ressourcen: Solo, ~10h/Woche, ~100€/Monat Budget. Aktuell <20 Nutzer (Freundeskreis).
> Queue-Feature: vorerst geparkt (siehe Abschnitt 6).

---

## 1. Ist-Analyse & Learnings

### Was Setradar heute ist
Radar für die Berliner Techno-Szene: RA-Scraping (10 Berliner Clubs + Gotec KA),
Event-Übersicht mit Hype/Interessierten-Zahlen, Artist-Ratings, Spotlight,
Favoriten, Recommendations, Web-Push, PWA. Kostenstruktur nahe null
(Supabase Free Tier, GitHub Pages, Domain).

### Die ehrlichen Learnings

1. **Das Kernprodukt ist Aggregation + Kuration, nicht Social.**
   RA hat die Daten, aber RA ist unübersichtlich, international und hat keinen
   "Was geht HEUTE in Berlin"-Fokus. Setradars echter Wert heute: eine schnelle,
   deutsche, kuratierte Antwort auf *"Wo gehen wir heute hin?"*

2. **Social-/Live-Features brauchen kritische Masse — die fehlt.**
   Queue-Tracking, Ratings, Hype, Recommendations: alles Crowd-Features. Mit <20
   Nutzern liefern sie leere oder dünne Daten und wirken dadurch kaputt, obwohl
   der Code funktioniert. Learning: **Erst Single-Player-Value, dann Multiplayer.**
   Ein Feature muss auch für den allerersten Nutzer alleine nützlich sein.

3. **Das Queue-Problem ist ein Timing-Problem, kein Motivationsproblem.**
   Niemand (auch der Gründer nicht) denkt beim Feiern an eine App. Der Moment
   "in der Schlange stehen" ist der einzig realistische Nutzungsmoment — Handy
   ist eh in der Hand, Langeweile vorhanden. Aber ohne Trigger (Push/Geofence)
   passiert es nicht. Geparkt, bis genug Nutzer da sind.

4. **RA-Scraping ist gleichzeitig Fundament und größtes Risiko.**
   "repair"-Commits zeigen: Der Scraper bricht in Produktion. RA kann das API
   ändern oder Scraping blocken (ToS-Grauzone). Mitigations siehe 4.4.

5. **Tech-Schulden sind noch tragbar, aber am Kipppunkt.**
   `home.js` mit ~2900 Zeilen wird jedes neue Feature verlangsamen.
   Kein Fehler-Monitoring, kein Nutzungs-Analytics → man fliegt blind.

---

## 2. Feature-Brainstorm

Sortiert nach: **Was fehlt (kritisch)** → **Quick Wins** → **Retention** →
**Viral/Wachstum** → **Später (ab kritischer Masse)** → **Was man besser machen kann**.

### 2.1 Kritische Lücken (ohne die wächst nichts)

| Feature | Warum kritisch | Aufwand |
|---|---|---|
| **Analytics einbauen** (Plausible/Umami, self-host oder ~9€/Mo) | Ohne Zahlen keine Entscheidungen. Was wird geklickt? Kommt jemand wieder? | S |
| **Share-Funktion**: Event als schönes Bild/Link teilen (Web Share API + OG-Tags + Canvas-Bild für Insta-Story) | Der einzige eingebaute Wachstumskanal. Jedes "guck mal, da gehen wir hin" in WhatsApp/Insta ist Gratis-Marketing. | M |
| **Onboarding** (3 Screens: Clubs wählen → Sound wählen → Push erlauben) | Neue Nutzer sehen sonst eine generische Liste und gehen wieder. Personalisierung ab Sekunde 1. | M |
| **SEO-Landingpages** pro Club + Tag (`/berghain/heute`, `/berlin/heute`) | "berghain lineup heute", "berlin techno heute" werden ständig gegoogelt. Setradar hat die Daten — das ist ein Organik-Goldesel, den keiner besetzt. | M–L |

### 2.2 Quick Wins (klein, sofort spürbar)

- **DJ-Alert / Artist-Follow**: "Sag mir Bescheid, wenn Héctor Oaks wieder in
  Berlin spielt." Push bei neuem Scrape-Match. Killer-Feature, geringe Kosten,
  funktioniert schon mit 1 Nutzer. *Das vielleicht wichtigste Einzelfeature.*
- **Kalender-Export (.ics)** pro Event/Favoriten — bindet Setradar in den Alltag ein.
- **"Heute Abend"-Modus**: Ab 20 Uhr zeigt die Startseite nur noch heute+Nacht,
  sortiert nach Hype. Der 80%-Use-Case verdient einen eigenen Zustand.
- **Genre-/Sound-Tags** an Events (aus RA-Artistdaten ableitbar): Filter
  "Hard Techno / House / Experimental". Berlin ist nicht ein Sound.
- **Ticket-Link** durchreichen (RA-Link) — Nutzer erwarten es.
- **Preis + Türinfo** (falls in RA-Daten): Eintritt, Awareness, Foto-Verbot, Dresscode.

### 2.3 Retention (warum komme ich nächste Woche wieder?)

- **Donnerstags-Digest** (Push + optional E-Mail): "Dein Wochenende: 3 Events,
  die zu deinen Ratings passen." Ein fester wöchentlicher Anker-Moment.
- **"Wie war deine Nacht?"** — Push am Tag danach um ~13 Uhr (Kater-Zeit):
  1-Tap-Rating der Nacht + Acts. Löst elegant das "beim Feiern denkt keiner
  an die App"-Problem: **Erfassung nach der Nacht statt während der Nacht.**
  Füttert Ratings, Recommendations und die persönliche Historie.
- **Persönliches Nacht-Archiv**: Timeline aller besuchten Events/Clubs/Acts.
  Menschen lieben ihre eigene Geschichte. Grundlage für Wrapped (siehe 2.4).
- **Streak-freie Gamification**: Badges für Meilensteine (10 Nächte, 5 Clubs,
  1 Geheimtipp entdeckt). Queue Rat 🐀 existiert schon — Familie ausbauen
  (Berghain-Bezwinger, Afterhour-Phantom, Frühschicht = vor 1 Uhr da).

### 2.4 Viral / Wachstum

- **Setradar Wrapped** (Dezember): "Deine 23 Nächte, 41 DJs, Lieblingsclub:
  Tresor" als teilbares Insta-Story-Bild. Spotify hat bewiesen, dass das
  funktioniert. Braucht nur das Nacht-Archiv als Datenbasis. **Jetzt Daten
  sammeln, im Dezember ernten.**
- **Freunde-System (light)**: Erst nur "Freund folgt Event → du siehst's".
  Kein Chat, kein Feed. Der Satz "3 Freunde haben das Event gespeichert"
  ist der stärkste Conversion-Trigger im Nightlife.
- **Kollektiv-/Promoter-Profile**: Kleine Kollektive können ihr Event claimen
  und einen Beschreibungstext ergänzen. Sie teilen dann selbst ihre
  Setradar-Seite → jedes Kollektiv wird zum Multiplikator.
- **Öffentliche Hype-Kurve**: "Dieses Event explodiert gerade" (Interessierten-
  Wachstum aus den wöchentlichen Scrapes ist schon in der DB!). FOMO-Content,
  ideal für Insta-Posts.

### 2.5 Später (ab ~500+ aktiven Nutzern)

- Queue-/Wartezeit-Tracking reaktivieren (siehe Abschnitt 6)
- Live-Crowd-Level ("wie voll ist es?") — gleiche Masse-Voraussetzung
- Promoter-Dashboard (Hype-Analytics als Bezahlprodukt, siehe Business-Plan)
- Zweite Stadt (Hamburg/Köln/Leipzig — Leipzig hat starke Szene und wenig Tools)
- Native App via Capacitor (erst wenn PWA-Grenzen wirklich schmerzen)

### 2.6 Was man besser machen kann (Bestehendes)

- **`home.js` aufteilen** (events / live / rating / render Module). Nicht sexy,
  aber jede Woche Aufschub macht es teurer. 1–2 Abende investieren.
- **Fehler-Monitoring**: Sentry Free Tier oder simples Logging-Endpoint —
  Scraper-Brüche und Frontend-Fehler müssen sichtbar werden, bevor Nutzer sie melden.
- **Scraper robuster machen**: Snapshot der letzten erfolgreichen Daten behalten;
  wenn Scrape fehlschlägt → alte Daten + Hinweis statt leerer Seite. Alerting
  (Push an dich selbst) bei Scrape-Fail.
- **Leere-Daten-Zustände designen**: Ratings/Hype/Recommendations müssen mit
  wenigen Nutzern gut aussehen (Seed-Hype von RA-Interessierten stärker nutzen,
  Crowd-Features ausblenden statt leer zeigen).
- **Englisch aktivieren**: Berlin-Nightlife ist extrem international; i18n ist
  vorbereitet — Deutsch-only halbiert die Zielgruppe mindestens.

---

## 3. Business-Plan

### 3.1 Positionierung

> **"Setradar weiß, was heute Nacht in Berlin geht."**
> Kuratierter, lokaler, ehrlicher als RA. Community-getrieben statt kommerziell.

Zielgruppe: 18–35, Berlin (+Umland/Touris), geht 1–8×/Monat feiern,
genervt von 5 Insta-Accounts + RA + Telegram-Gruppen checken zu müssen.

### 3.2 Kostenstruktur (Realität: fast null)

| Posten | Kosten/Monat |
|---|---|
| Supabase Free Tier | 0€ (bis ~50k MAU locker) |
| Hosting (GitHub Pages) | 0€ |
| Domain setradar.de | ~1€ |
| Analytics (Plausible o. self-host Umami) | 0–9€ |
| Sticker/Print-Budget (Marketing) | 30–60€ |
| Puffer (Supabase Pro falls nötig: 25$) | — |
| **Summe** | **~30–70€/Monat** |

→ **Kostendeckung ist trivial erreichbar** (siehe 3.4). Das Projekt kann Jahre
auf Sparflamme überleben — das ist ein strategischer Vorteil: kein Druck,
kein Investor, keine Deadline. Der einzige knappe Rohstoff ist deine Zeit.

### 3.3 Phasenplan

**Phase A — Beweis (jetzt bis +3 Monate): Ziel 100 aktive Nutzer**
- Fokus: Single-Player-Features (DJ-Alerts, Digest, Heute-Modus, Share, Onboarding)
- Analytics live, 1 Kernmetrik: **Weekly Active Users** + Retention Woche 2
- Marketing: nur organisch + Freundeskreis-Multiplikation (Abschnitt 5)
- Erfolgskriterium: 100 WAU und ≥25% kommen in Woche 2 wieder.
  Wenn nach 3 Monaten <50 WAU trotz Marketing → Hypothese überdenken.

**Phase B — Wachstum (Monat 3–9): Ziel 1000 Nutzer**
- SEO-Seiten, Kollektiv-Partnerschaften, Insta/Telegram-Kanal etabliert
- Freunde-light, Nacht-Archiv, Wrapped-Vorbereitung
- Supporter-Option einführen (Ko-fi/Steady) — nicht wegen Geld, sondern als Signal
- Erfolgskriterium: organisches Wachstum ohne aktive Promo-Wochen

**Phase C — Optionen ziehen (Monat 9+)**
- Erst hier entscheiden: Hobby bleiben, Verein/Kollektiv, oder Business.
- Monetarisierungs-Experimente (3.4), evtl. zweite Stadt, evtl. Mitstreiter suchen.

### 3.4 Monetarisierung (Reihenfolge nach Fit, alles erst Phase B/C)

1. **Supporter-Membership** (Ko-fi/Steady, 2–5€/Monat): Badge im Profil,
   Name im "Danke"-Screen, evtl. früher Zugriff auf Features.
   20 Supporter × 3€ = kostendeckend. Passt zur Community-DNA. **Empfohlen als erstes.**
2. **Promoter-Analytics** (B2B): Kollektive/Clubs zahlen 10–30€/Monat für
   Hype-Verlauf, Vergleich mit ähnlichen Events, Demografie der Interessierten.
   Die Daten entstehen sowieso. Braucht ~1000 Nutzer für Aussagekraft.
3. **Featured Events** (vorsichtig!): Kollektive zahlen für Sichtbarkeit —
   nur klar gekennzeichnet und kuratiert, sonst stirbt die Glaubwürdigkeit.
4. **Merch**: Queue-Rat-Sticker/Shirts. Kein Geldbringer, aber Marketing das
   sich selbst bezahlt.
5. ❌ **Nicht:** Werbebanner (zerstört Vibe), Datenverkauf (zerstört Vertrauen),
   Ticketing selbst bauen (RA/DICE-Territorium, zu schwer).

### 3.5 Risiken

| Risiko | Wahrscheinlichkeit | Mitigation |
|---|---|---|
| RA blockt Scraping | mittel | Caching/Snapshots; zweite Quelle (Club-Websites, Insta-APIs, manuelle Einreichung durch Kollektive); langfristig: Kollektive tragen Events selbst ein |
| Cold Start / keine Retention | hoch | Single-Player-Value zuerst; ehrliches 3-Monats-Kriterium (Phase A) |
| Solo-Burnout | hoch | Scope klein halten; pro Quartal max. 2 große Features; Mitstreiter aus der Community rekrutieren (Design/Content zuerst) |
| Konkurrenz (RA, DICE, Insta) | niedrig-mittel | Nische verteidigen: lokal, live, community — das bauen die Großen nicht für eine Stadt |
| DSGVO (Standort, Push, Profile) | mittel | Privacy-freundliches Analytics, Datenminimierung, Impressum/Datenschutz sauber — vor Wachstum erledigen |

---

## 4. Marketing-Plan (0–100€/Monat, Guerilla + Organisch)

Grundregel: **Die Zielgruppe ist geographisch extrem konzentriert** (20 Clubs,
5 Kieze, 3 Nächte pro Woche). Das ist ein Guerilla-Traum — man muss nicht
"Berlin" erreichen, sondern ~200 Meter Bürgersteig vor 10 Türen.

### 4.1 Guerilla (offline)

- **Sticker-Kampagne "Wie lang ist die Schlange?"**
  QR-Sticker mit Queue Rat 🐀 + Slogan. Platzierung: Spätis nahe Clubs,
  Club-Toiletten (drinnen kleben ist meist geduldet — vorher Türsteher/Bar
  fragen kostet nichts), eigene Kleidung/Flaschen in der Schlange.
  ⚠️ Öffentliche Laternen/Stromkästen sind rechtlich Sachbeschädigung —
  Risiko bewusst abwägen; besser: Läden/Clubs fragen, die meisten sagen ja.
  Budget: ~30€/500 Sticker.
- **Der Schlangen-Moment ist der Marketing-Moment:** Selbst anstehen +
  Freunde briefen: "Kennst du Setradar? Da siehst du was heute überall geht."
  Person vor/hinter dir in der Schlange ist die perfekte Zielgruppe mit
  30–90 Minuten Langeweile. 10 ehrliche Gespräche pro Nacht schlagen jede Anzeige.
- **Kater-Frühstücks-Flyer**: Kleine Karten in szenigen Cafés/Dönerläden in
  Friedrichshain/Kreuzberg auslegen (fragen!): "Nächstes Wochenende schon geplant?"
- **Visitenkarten-Format statt Flyer**: "Setradar — dein Radar für heute Nacht"
  mit QR. Passt in jede Hosentasche, wird seltener weggeworfen.
- **Queue Rat als Maskottchen aufbauen**: Die Ratte ist memeable. Sticker,
  Insta-Comics ("Queue Rat wartet seit 2h vor dem Berghain"), evtl.
  Plüsch-Ratte als Foto-Objekt in Schlangen. Eigenständiger Charakter =
  Marke ohne Werbe-Gefühl.

### 4.2 Organisch (online)

- **Instagram (Hauptkanal)** — 2 Formate, streng wöchentlich:
  1. **Donnerstag: "Das Wochenende in Berlin"** — Carousel mit Top-Events
     (Daten hat Setradar exklusiv aufbereitet!). Das ist genau der Content,
     den Leute in Stories teilen und Freunden schicken.
  2. **Dienstag: Hype-Chart / Geheimtipp** — "Dieses Event ist diese Woche
     um 400% gewachsen" / "Unterschätztes Event des Wochenendes".
  Stories: Umfragen ("Freitag oder Samstag?"), Reposts von Kollektiven.
- **Telegram-Kanal**: Berliner Techno-Szene lebt auf Telegram. Kanal =
  Donnerstags-Digest als Broadcast. Später Gruppe. In bestehenden Gruppen
  **nicht spammen** — stattdessen hilfreich sein: Wenn jemand fragt "was geht
  heute?", mit konkreter Antwort + Link helfen.
- **Reddit** (r/berlinsocialclub, r/Berlin, r/Techno): Nur als hilfreiche
  Antwort auf echte Fragen ("what's on tonight?"), nie als Werbepost.
  1 guter Kommentar/Woche reicht. Authentizität > Reichweite.
- **SEO (der unterschätzte Kanal)**: Landingpages "Club X heute/diese Woche",
  "Berlin Techno heute". Kaum Konkurrenz auf Deutsch, dauerhafter Traffic,
  null Grenzkosten. Braucht server-side rendering oder Pre-Rendering der Seiten
  (GitHub Pages: statisch beim wöchentlichen Scrape generieren — passt perfekt
  in die bestehende Pipeline!).
- **Kollektiv-Partnerschaften (wichtigster Hebel)**: 10 kleine Kollektive
  anschreiben: "Ich feature euer Event kostenlos prominent, ihr erwähnt
  Setradar in eurer Story." Kleine Kollektive kämpfen um jede Sichtbarkeit —
  Win-Win, kostet nichts, bringt genau die richtigen Follower.
  Später: Gästelisten-Verlosung ("Folge Setradar + tagge 2 Freunde").
- **Setradar Wrapped (Dezember)**: Der eine geplante Viral-Moment des Jahres.
  Alles, was übers Jahr an Archiv-Daten entsteht, zahlt hierauf ein.

### 4.3 Was NICHT tun

- Keine bezahlten Ads (Budget zu klein für Wirkung, falsche Vibes für die Szene)
- Kein Follower-Kauf, keine Gewinnspiel-Spirale ohne Produkt-Bezug
- Nicht 5 Kanäle halbherzig — **Insta + Telegram + SEO, mehr nicht**
- Keine Promo in fremden Gruppen ohne echten Mehrwert (Szene merkt und
  verzeiht das nicht)

### 4.4 Wochenroutine (passt in ~3h/Woche Marketing-Anteil)

| Wann | Was | Zeit |
|---|---|---|
| Di | Hype-Chart-Post (halbautomatisch aus DB generieren!) | 30 min |
| Do | Wochenend-Carousel + Telegram-Digest | 60 min |
| Fr/Sa (wenn eh feiern) | Sticker + Gespräche in der Schlange | 0 min extra |
| So | 1 hilfreicher Reddit/Telegram-Kommentar, Metriken checken | 30 min |

→ Content-Erstellung so weit wie möglich **aus der eigenen DB automatisieren**
(Script generiert Carousel-Bilder aus Event-Daten). Einmal bauen, jede Woche ernten.

---

## 5. Zukunftseinschätzung — hat das Projekt eine Zukunft?

**Kurzfassung: Als Community-Projekt ja, mit realistischer Chance auf mehr.
Als klassisches Startup eher nein. Und das ist okay — die Struktur passt zur Ambition.**

### Dafür spricht

- **Echtes, selbst erlebtes Problem** in einer leidenschaftlichen, dichten,
  erreichbaren Nische. Berlin-Techno ist eine der wenigen Szenen weltweit,
  die groß genug für ein eigenes Tool und klein genug für Solo-Guerilla ist.
- **Kosten ≈ 0** → unendliche Laufzeit, kein Existenzdruck, jedes Wachstum ist Bonus.
- **Der Community-/Live-Layer ist unbesetzt**: RA ist ein internationales
  Listing-Portal, DICE ein Ticketshop. "Was geht HEUTE, wie ist die Stimmung,
  was sagt die Szene" baut keiner von denen für eine Stadt.
- Technisches Fundament (Scraper, DB, Push, Auth) steht bereits — der teure
  Teil ist bezahlt.

### Dagegen spricht

- **Cold-Start ist brutal**: Die besten Features (Ratings, Hype, Queue) brauchen
  Masse, die Masse kommt nur über Features. Klassisches Henne-Ei.
- **RA-Abhängigkeit** ist ein Damoklesschwert (siehe Risiken).
- **Nightlife-Apps haben eine Friedhofs-Geschichte** (unzählige "Nightlife-
  Discovery"-Startups sind gescheitert) — meist, weil sie Social-first statt
  Utility-first waren. Genau deshalb: Utility zuerst.
- **Solo + Nebenbei** heißt: alles dauert 3× länger als geplant.

### Das Urteil

Die Wahrscheinlichkeit, dass Setradar ein Unternehmen wird, das jemanden
ernährt: **niedrig (~10–15%)**. Die Wahrscheinlichkeit, dass es ein
kostendeckendes, respektiertes Szene-Tool mit 1000+ Nutzern wird, das Türen
öffnet (Netzwerk, Portfolio, Kollektiv-Kontakte, evtl. spätere Chancen):
**realistisch gut (~40–50%)** — *wenn* der Fokus stimmt:

> **Die eine strategische Wette: Setradar gewinnt nicht als Social-App,
> sondern als das beste Utility für "Was geht heute Nacht in Berlin" —
> und wird sozial, sobald genug Leute da sind.**

Konkret: DJ-Alerts + Donnerstags-Digest + Share + SEO zuerst. Wrapped als
Viral-Moment im Dezember. Queue und Live-Features schlafen, bis ~500 Nutzer
da sind. In 3 Monaten ehrlich auf die Retention-Zahl schauen.

---

## 6. Geparkt: Die Queue-Funktion (für später)

Bewusst pausiert (Juli 2026). Der Code bleibt, das Feature wird aus der UI
zurückgenommen oder unauffällig gelassen, bis kritische Masse existiert.

**Warum geparkt:** Crowd-Sourcing-Feature ohne Crowd = leere Daten = wirkt
kaputt. Und selbst motivierte Nutzer (der Gründer!) denken beim Feiern nicht
an die App → das Problem ist der fehlende Trigger, nicht die Idee.

**Reaktivierungs-Ideen (wenn ~500+ Nutzer):**
1. **Geofencing + Push**: App erkennt Nähe zum Club → "Stehst du gerade am
   Tresor an?" mit 1-Tap-Antwort. (PWA-Einschränkung: Background-Geolocation
   geht nur mit nativer App/Capacitor — das wäre der Anlass für den Wrapper.)
2. **Zeitgesteuerte Pushes**: Fr/Sa 23:30–01:30 an Nutzer mit favorisiertem
   Event heute: "Wie ist die Schlange?" — 3 Antwort-Buttons, 2 Sekunden Aufwand.
3. **Morning-After-Erfassung**: "Wie lang hast du gestern gewartet?" in der
   Kater-Umfrage — ungenauer, aber müheloser Einstieg und füttert die
   Durchschnittswerte in `event_queue_timeline` trotzdem.
4. **Schätzmodell statt Crowd**: Wartezeit aus Hype-Score + Uhrzeit + Club +
   historischen Daten schätzen ("erfahrungsgemäß jetzt ~45 min") — funktioniert
   ohne einen einzigen Live-Nutzer und wird durch Crowd-Daten später besser.

---

## 7. Nächste Schritte (Vorschlag, priorisiert)

1. [ ] Analytics einbauen (Plausible/Umami) — *ohne Zahlen ist alles Raten*
2. [ ] Scraper-Alerting + Snapshot-Fallback
3. [ ] DJ-Alert / Artist-Follow-Feature
4. [ ] Share-Funktion (OG-Tags + Story-Bild)
5. [ ] Onboarding (Clubs + Sound + Push)
6. [ ] Donnerstags-Digest (Push) + Insta-Kanal starten
7. [ ] SEO-Seiten statisch aus Scrape-Pipeline generieren
8. [ ] Nacht-Archiv (Datenbasis für Wrapped im Dezember)
9. [ ] `home.js` refactoren (parallel, 1–2 Abende)
