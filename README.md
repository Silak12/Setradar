# Lineup-Berlin

## Artist Spotlight manuell anpassen

Der Artist Spotlight auf der Startseite waehlt automatisch 3 Acts aus den Bewertungen der letzten 2 Tage. Falls du die Auswahl manuell ueberschreiben willst, kannst du in `frontend/js/home.js` direkt nach der Funktion `loadActSpotlight()` einen Override eintragen:

```js
// MANUELLER SPOTLIGHT-OVERRIDE (temporaer)
// Einfach spotlightActs direkt setzen, bevor die Funktion endet:
spotlightActs = [
  {
    actId: 42,           // act.id aus der acts-Tabelle
    actName: 'ARTIST NAME',
    clubName: 'Berghain',
    avg_rating: 4.8,
    rating_count: 23,
    surprise_pct: 0.6,
    label: 'ÜBERRASCHUNG', // oder 'BESTER ACT' oder 'GEHEIMTIPP'
  },
  // weitere Acts...
];
return; // danach return, damit die DB-Logik nicht mehr laeuft
```

Die act_id findest du z.B. mit folgendem SQL im Supabase SQL Editor:

```sql
SELECT id, name FROM acts ORDER BY name;
```

---



Um aktuellen DB Stand zu bekommen führe folgenden SQL Befehl aus und kopiere den Output in CLaude

SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;



Minimales Python-Projekt mit **Python 3.12** und lokaler Virtual Environment (`.venv`).
Diese Anleitung gilt nur fuer **Windows**.

## Voraussetzungen

- Installiertes Python **3.12**
- Python Launcher `py`

## Projekt starten

Fuer das Frontend in `frontend/js/config.js` einen aktuellen Supabase Publishable Key eintragen:

```js
SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_...'
```

Die alten JWT-basierten `anon`-Keys (`eyJ...`) werden von Supabase nicht mehr akzeptiert und fuehren sonst zum Fallback auf Demo-Daten.

### 1. Venv erstellen (PowerShell)

```powershell
py -3.12 -m venv .venv
```

### 2. Venv aktivieren

PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

### 3. Optional: Tools aus `pyproject.toml` installieren

```powershell
python -m pip install --upgrade pip
pip install -e .[dev]
```

### 4. App starten

```powershell
python main.py
```

Erwartete Ausgabe:

```text
Hello World
```

## Venv verlassen

```powershell
deactivate
```

## Naechster Start (ab dann immer)

Wenn die Umgebung bereits einmal erstellt wurde:

1. Ins Projektverzeichnis wechseln
2. Venv aktivieren
3. App starten

```powershell
.\.venv\Scripts\Activate.ps1
python main.py
```

## Datenbank / Lineup Workflow

Die Datei `backend/database/lineup_seed_example.json` ist die Quelle fuer das initiale Lineup.
Aus ihr wird SQL erzeugt (`backend/database/lineup_init.sql`) und danach nach Supabase geseedet.

### Neue Info/Feld in der init JSON hinzufuegen

Beispiel: neues Feld `insta_name` in jedem Act.

1. JSON-Struktur erweitern

- Feld in `backend/database/lineup_seed_example.json` an der passenden Stelle einfuegen.
- Das Feld fuer alle relevanten Eintraege konsistent pflegen (gleiches Objekt-Schema).

2. Schema-Generator anpassen

- Datei: `backend/database/create_schema_from_json.py`
- Parser erweitern (`parse_act` oder passende Parse-Funktion), damit das neue Feld eingelesen wird.
- SQL-Header erweitern:
  - Spalte in `create table if not exists ...` aufnehmen.
  - Migration/Kompatibilitaet per `alter table ... add column if not exists ...` ergaenzen.
- Seed-SQL-Generierung erweitern (insert/upsert), damit das Feld in SQL mitgeschrieben wird.

3. Supabase-Seeder anpassen

- Datei: `backend/database/supabase_seed_lineup.py`
- Parse-Funktion fuer das neue Feld erweitern.
- Upsert/Create-Logik fuer die Zieltabelle erweitern.
- In `_ensure_required_tables(...)` einen Schema-Check fuer die neue Spalte ergaenzen.

4. `lineup_init.sql` neu erzeugen

```powershell
python backend/database/create_schema_from_json.py --input backend/database/lineup_seed_example.json --output backend/database/lineup_init.sql
```

5. SQL in Supabase ausfuehren

- Inhalt von `backend/database/lineup_init.sql` im Supabase SQL Editor ausfuehren.
- Dadurch wird die Spalte (ueber `add column if not exists`) auch bei bestehender DB nachgezogen.

6. Daten neu seeden

```powershell
.\.venv\Scripts\python.exe backend/database/supabase_seed_lineup.py --input backend/database/lineup_seed_example.json
```

7. Ergebnis pruefen (optional)

```powershell
.\.venv\Scripts\python.exe backend/database/supabase_dump_all_tables.py --output backend/database/supabase_all_tables_dump.json
```

Dann in `backend/database/supabase_all_tables_dump.json` kontrollieren, ob das neue Feld in der Zieltabelle angekommen ist.
