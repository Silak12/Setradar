# SITE X — Neue Edition erstellen

## Wöchentlicher Ablauf

### 1. Neuen Ordner anlegen
Kopiere diesen `_template` Ordner und benenne ihn nach der Nummer:
```
_template/ → 002/
_template/ → 003/
```

### 2. meta.json ausfüllen
```json
{
  "edition": 2,
  "date": "2026-04-25",
  "status": "voting",
  "instagram_url": "https://www.instagram.com/p/DEIN_POST_ID/",
  "tiktok_url": "https://www.tiktok.com/@dein_account/video/DEIN_VIDEO_ID",
  "comment": "",
  "author": "",
  "votes": 0
}
```

### instagram_url und tiktok_url — so bekommst du die Links

**Instagram:**
1. Post öffnen → drei Punkte (···) → "Link kopieren"
2. Sieht aus wie: `https://www.instagram.com/p/ABC123xyz/`

**TikTok:**
1. Video öffnen → Teilen → "Link kopieren"
2. Sieht aus wie: `https://www.tiktok.com/@dein_account/video/1234567890`

→ Beide Links in meta.json eintragen. Dann sind die Instagram/TikTok-Buttons
  auf der Website automatisch klickbar und führen direkt zum Video.
  Solange leer: Buttons sind sichtbar aber nicht klickbar.

### 3. Status-Ablauf
| Status      | Bedeutung                                    | canvas.html nötig? |
|-------------|----------------------------------------------|--------------------|
| `voting`    | Voting läuft — Instagram/TikTok Buttons aktiv | Nein (BIP angezeigt) |
| `building`  | Gewinner steht fest, wird gerade gebaut       | Nein (BIP angezeigt) |
| `live`      | Fertig — canvas.html wird angezeigt           | JA                 |

### 4. Voting endet — Gewinner eintragen
```json
{
  "status": "building",
  "comment": "Ein Tier das durch Neukölln läuft",
  "author": "@username",
  "votes": 847
}
```

### 5. canvas.html programmieren
- Schreibe deinen Code direkt in `canvas.html`
- Volle Kontrolle: HTML, CSS, JS, Canvas API, WebGL — alles erlaubt
- Wird als iframe geladen, komplett isoliert vom Rest der Website
- Teste auf Mobile (375px Breite) bevor du live gehst

### 6. Live schalten
In `meta.json`:
```json
{ "status": "live" }
```

In `frontend/sitex/editions.json`:
```json
{
  "current": "002",
  "editions": [
    {
      "key": "002",
      "edition": 2,
      "date": "2026-04-25",
      "status": "live",
      "instagram_url": "https://...",
      "tiktok_url": "https://...",
      "comment": "Ein Tier das durch Neukölln läuft",
      "author": "@username",
      "votes": 847
    },
    {
      "key": "001",
      "edition": 1,
      "date": "2026-04-18",
      "status": "live",
      "instagram_url": "https://...",
      "tiktok_url": "https://...",
      "comment": "...",
      "author": "@username",
      "votes": 0
    }
  ]
}
```

## Tipps für den Canvas

- `html, body { width: 100%; height: 100%; overflow: hidden; }` — wichtig für fullscreen
- Animationen mit `requestAnimationFrame` oder CSS animations
- Für Texte: IBM Plex Mono läuft bereits im Template
- Mobile first: teste auf 375px Breite
