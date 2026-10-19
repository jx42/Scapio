# Runbook

Was tun, wenn etwas nicht stimmt. Der erste Griff bei jedem Zweifel an einer Zahl:

```sh
npm run verify
```

Das rechnet die gesamte Historie aus den archivierten Rohantworten in `raw_snapshot` neu —
auf einer Kopie der Datenbank, ohne die echten Daten anzufassen — und vergleicht sie
Tag für Tag mit dem, was in `depot_tag` steht. Bei Integer-Cent ist eine Abweichung
entweder null oder ein Befund; es gibt keine Toleranz und keine Zusammenfassung. Jede
gefundene Abweichung wird mit Tag und Differenz genannt.

> **Für Agenten:** `npm run verify`, `npm run ingest` und die SQL-Abfragen in diesem Runbook
> zeigen echte Depotwerte und sind dem Menschen vorbehalten
> ([ADR-042](entscheidungen/ADR-042-agenten-lesen-keine-depotwerte.md)). Agenten nehmen
> `npm run verify:zaehlung` und fragen nach, wo Werte nötig wären.

## Drift-Banner erschienen

Das Banner (`src/components/Driftbanner.tsx`) zeigt, dass die rekonstruierte Historie und
der von der Bank gemeldete Bestand nicht mehr übereinstimmen (`core/drift.ts`). Vier
Stufen aus der relativen Abweichung des Gesamtwerts, dazu zwei Sonderzustände:

| Stufe | Schwelle | Bedeutung |
|---|---|---|
| `ok` | < 0,1 % | keine Anzeige |
| `hinweis` | ≥ 0,1 % | leiser Hinweis, Zahlen bleiben sichtbar |
| `banner` | ≥ 0,5 % | auffälliges Banner |
| `abbruch` | ≥ 2 % | Chart wird ausgeblendet — den Zahlen wird nicht mehr vertraut |
| `ausgesetzt` | — | Bestand beim letzten Lauf nicht abrufbar: Banner, Zahlen ungeprüft |
| `leer` | — | noch keine rekonstruierte Reihe (Erststart): keine Anzeige |

Schwellen stehen in `einstellungen.json` im Datenverzeichnis (sonst `config.json`) unter `driftSchwellen` und müssen aufsteigend sein
(`hinweis ≤ banner ≤ abbruch`).

Vorgehen:

1. `npm run verify` ausführen. Findet es Abweichungen in `depot_tag` selbst, ist die
   Neuberechnung fehlerhaft — das ist ein Fehler im Rechenkern, kein Datenproblem. Prüfe,
   ob `KERN_VERSION` (`core/version.ts`) seit der letzten vollständigen Neuberechnung
   erhöht wurde — der nächste Start holt das nach (`rechneNachUpdateNeu` in
   `start/start.ts`), ein noch laufender Server aber nicht.
2. Findet `verify` keine Abweichung gegenüber `depot_tag`, aber das Banner steht trotzdem,
   liegt die Ursache in den Eingaben: entweder ist der von der Bank gemeldete `bestand`
   selbst unplausibel (Kurskorrektur, verspätet gebuchte Order), oder eine Transaktion
   fehlt in der rekonstruierten Historie.
3. Bei `abbruch`: nicht die Schwelle anheben, um das Banner loszuwerden — das verschiebt
   das Problem, statt es zu lösen. Prüfe zuerst `lauf.hinweise_json` des letzten Laufs auf
   Plausibilitätsbefunde (`ingest/plausibilitaet.ts`), insbesondere die Art `tagessprung`
   (Tagessprung > 30 %) und eine möglicherweise zu spät beginnende Transaktionsliste —
   dafür existiert `seed.json` im Datenverzeichnis als manuelle Ergänzung (Vorlage
   `docs/seed.example.json`).
4. Bei `ausgesetzt` den Quellenstatus `holdings` des letzten Laufs prüfen (`lauf.quellen_json`);
   der nächste Lauf mit abrufbarem Bestand hebt die Stufe auf.
   `leer` direkt nach der Installation ist erwartet und wechselt mit dem ersten Lauf.

## Ingest gescheitert

`/api/lauf` beziehungsweise die Kachel zeigt den Status des letzten Laufs. `lauf.status`
kennt vier Werte: `laufend`, `erfolg`, `teilweise`, `fehler`.

- **`teilweise`** heißt: eine einzelne Quelle ist ausgefallen (`quellen_json` zeigt,
  welche); der Lauf rechnet mit ihrem letzten bekannten Stand weiter. Ausnahme ist
  `transaktionen`: ohne Historie gibt es keine richtige Zahl, ihr Ausfall bricht den Lauf
  als `fehler` ab.
- **`fehler`** mit `fehler_code`/`fehler_text`, oder `teilweise` mit dem Code je Quelle im
  Hinweis `quelleGescheitert`. Alle Codes stehen in `shared/laufFehler.ts`, jeder hat hier
  einen Eintrag (`test/laufFehler.test.ts`); die Codes der API-Fehlerform stehen in
  `server/fehler.ts`.
  - `E_MCP_ANMELDUNG`: die Anmeldung am Scalable-MCP steht nicht. Zwei Ursachen, von außen
    nicht zu unterscheiden: entweder wurde der gespeicherte Refresh-Token abgelehnt
    (abgelaufen, widerrufen, oder es gibt noch gar keinen unter
    `<datenverzeichnis>/mcp/token.json`), oder der MCP-Zugang ist im Scalable-Capital-Konto
    nicht freigeschaltet — dann antwortet die Gegenstelle mit `401`/`403`. In beiden Fällen
    wird der Lauf sofort abgebrochen, ohne Wiederholung: sonst liefe der Ingest still auf
    Altdaten weiter [ADR-012]. Abhilfe, der übliche Weg: den Knopf **„Anmelden"** in der
    Aktualisieren-Kachel
    drücken — er öffnet dasselbe Browserfenster wie `npm run mcp-login`. Danach
    „Aktualisieren" drücken. Bleibt der Fehler, im Scalable-Capital-Konto prüfen, ob der
    MCP-Server dort aktiviert ist. Ohne laufende Oberfläche geht es weiter über
    `npm run mcp-login` im Terminal [ADR-010]. Läuft der Token erst mitten im Lauf ab,
    endet der Lauf als `teilweise` und trägt denselben Code — der Knopf erscheint auch dann.
    Nach dem ersten `E_MCP_ANMELDUNG` erreicht kein weiterer Aufruf dieses Laufs den MCP
    (laufweiter Kurzschluss, [ADR-031]); die übrigen MCP-Quellen stehen dann mit
    „Uebersprungen, weil …“ im Protokoll.
  - `E_MCP_DROSSEL`: Scalable antwortet mit `429` oder `503`. Verlangt `Retry-After`
    höchstens 30 Sekunden, wartet der Ingest so lange und versucht es einmal erneut; sonst
    überspringt er den Rest des Laufs am MCP. Nichts tun, später erneut aktualisieren.
  - `E_MCP_ZEIT`: zwei Zeitüberschreitungen in Folge brechen die MCP-Abrufe des Laufs ab
    [ADR-031]. Meist ist Scalable gerade langsam; bleibt es, `mcpZeitlimitMs` in
    `einstellungen.json` im Datenverzeichnis prüfen.
  - `E_MCP_RPC`: der MCP hat einen Aufruf mit einem JSON-RPC-Fehler abgelehnt. Die Nummer
    steht in `lauf.log` (`McpFehler/E_MCP_RPC (-32602)`); `-32602` heißt meist, dass ein
    Werkzeug seine Parameter geändert hat — ein Fall für `ingest/quellen/`.
  - `E_MCP_TRANSIENT`: Netzwerkfehler oder `5xx` bei Anmeldung, Token-Tausch oder stillem
    Refresh. Kein Grund für eine neue Anmeldung; später erneut aktualisieren.
  - `E_MCP_ABGELEHNT`: ein Aufruf ist auch nach der Wiederholung gescheitert. Bleibt es bei
    jedem Lauf, hat sich vermutlich die Schnittstelle geändert.
  - `E_MCP_ARGUMENT`: der Ingest wollte ein Werkzeug außerhalb der Allowlist oder mit
    ungültiger ISIN aufrufen [INV-01]. Immer ein Programmfehler, nie ein Bedienfehler.
  - `E_MCP_SEITEN`: die Transaktionsliste braucht mehr Seiten als `HOECHSTENS_SEITEN`
    (`ingest/mcp.ts`). Die Decke anheben, nicht abschalten.
  - `E_MCP_UNVOLLSTAENDIG`: eine Seite der Transaktionsliste hatte weniger oder mehr Zeilen,
    als ihr `returnedCount` sagt. Der Lauf übernimmt nichts; später erneut aktualisieren.
  - `E_SCHEMA`: eine Antwort hat die zod-Prüfung nicht bestanden [INV-12]. Die Form der
    Antwort hat sich geändert — ein echter Befund, kein Bedienfehler. `npm run vertrag`
    zeigt, welches Feld.
  - `E_PLAUSIBEL`: die Daten waren formal gültig, aber nicht plausibel (`ingest/plausibilitaet.ts`).
    `lauf.log` nennt die Prüfung.
  - `E_SEED_KAPUTT`: `seed.json` im Datenverzeichnis ist kein gültiges JSON (meist ein Komma zu viel).
    Datei korrigieren oder auf `{"anfangsbestand": []}` zurücksetzen.
  - `E_DATEI_FREMD`: siehe [Datei im Datenverzeichnis abgelehnt](#datei-im-datenverzeichnis-abgelehnt).
  - Fonds-Holdings nicht erreichbar — iShares, Xtrackers oder Amundi, je nach `anbieter`
    in `funds.json` im Datenverzeichnis (Host-Allowlist in `erlaubteHosts`, Zeitlimit `csvZeitlimitMs`).
    Abgerufen wird nur mit `"top25": true` in `einstellungen.json` [ADR-038].
    Die Codes kommen aus `ingest/netz.ts`:
    - `E_NETZ_HOST`: der Host steht nicht in `erlaubteHosts`.
    - `E_NETZ_ADRESSE`, `E_NETZ_SCHEMA`: keine gültige URL, Zugangsdaten in der Adresse
      oder nicht `https`.
    - `E_NETZ_DNS`, `E_NETZ_PRIVAT`: der Host löst nicht auf, oder er zeigt auf eine
      private Adresse.
    - `E_NETZ_STATUS`, `E_NETZ_UMLEITUNG`: unerwarteter HTTP-Status oder zu viele
      Umleitungen. Meist hat der Anbieter seine Adresse geändert.
    - `E_NETZ_GROESSE`: die Antwort ist größer als erlaubt.
    - `E_NETZ_ZEIT`: das Zeitlimit wurde überschritten.
    - `E_NETZ`: ein sonstiger Netzwerkfehler. Die Internetverbindung prüfen.
  - `E_VPI_QUELLE`, `E_VPI_AKTUELL_QUELLE`, `E_ZINS_QUELLE`: Inflation oder Zins wurden
    bewusst nicht abgerufen, etwa weil `inflationsquelle`/`zinsquelle` in
    `einstellungen.json` auf eine nicht angebundene Quelle zeigt oder die jüngsten
    VPI-Monate keine Basis haben. Der Hinweis daneben nennt den Grund.
  - `E_ABGEBROCHEN`: der Lauf hing nach einem Absturz noch als `laufend` und wurde beim
    nächsten Start beendet. Erneut aktualisieren.
  - `E_UNBEKANNT`: eine Ausnahme ohne bekannten Code. Den Rohcode und den Wortlaut
    nennt `lauf.log`.
  - `E_STORNO_BREMSE`: die Transaktionsliste war so viel kürzer als der bekannte
    Bestand (über 50 Transaktionen, oder über 20 und über die Hälfte), dass der Import sie
    als Abruffehler verweigert. Nichts wurde storniert. Später erneut aktualisieren; bleibt
    es dabei, `npm run verify` und die Rohantwort prüfen. Kleinere Stornierungen laufen
    durch und stehen als Hinweis im Lauf.
- **Zur Fehlersuche direkt am Ingest**, ohne über den Server zu gehen: `npm run ingest`
  im Terminal — das gibt Fehler direkt auf der Konsole aus, ohne den Umweg über
  `/api/refresh`.
- Ein abgebrochener Ingest hinterlässt eine gültige Datenbank: der Import passiert in
  **einer** Transaktion [INV-09], entweder vollständig oder gar nicht. Die anschließende
  Neuberechnung der Zeitreihe läuft in einer **eigenen** Transaktion
  (`ingest/neuberechnung.ts`): scheitert nur sie, stehen die neuen Rohdaten schon in der
  Datenbank, die Zeitreihe aber noch auf altem Stand. Zurückrollen muss man trotzdem
  nichts — der nächste Lauf rechnet sie aus den Rohdaten neu.

### Die Sperre hängt

Läuft bereits ein Ingest, antwortet `POST /api/refresh` mit `409` (`E_SPERRE`) und den
Feldern `laufId`, `quelle`, `seit`. Das ist normal bei zwei schnell hintereinander
gedrückten Aktualisieren-Knöpfen.

Bleibt die Sperre dauerhaft bestehen, obwohl kein Lauf mehr läuft (z. B. nach einem hart
abgeschossenen Prozess): Die Sperrdatei `lauf.lock` im Datenverzeichnis (macOS
`~/Library/Application Support/scapio/`, Windows
`%LOCALAPPDATA%\scapio\`) gilt automatisch als verwaist,
sobald ihr eingetragener Prozess nicht mehr existiert oder sie **15 Minuten lang kein
Lebenszeichen** mehr bekommen hat — `server/sperre.ts` räumt sie beim nächsten Zugriff
selbst weg.

„Lebenszeichen" heißt: Der Halter fasst die `mtime` der Datei einmal pro Minute an; ein langer
Lauf gilt deshalb nicht als abgestürzt. Ist die Änderungszeit von `lauf.lock` jünger als eine
Minute, läuft der Halter noch.

Ein manuelles Löschen von `lauf.lock` ist nur nötig, wenn seit über 15 Minuten kein neuer
Versuch stattgefunden hat und das Problem eilt; danach den Server neu starten.

## Port belegt

`npm start` sucht den Port nicht — ein wanderndes Dashboard wäre ein Lesezeichen, das
nicht mehr stimmt, und eine Origin-Regel, die nicht mehr greift. Ist der konfigurierte Port
(`einstellungen.json` im Datenverzeichnis, Vorgabe `4732`) belegt, meldet das Programm das und beendet sich.

1. Prüfen, was den Port hält: `lsof -i :4732` (Windows: `netstat -ano | findstr :4732`,
   dann `tasklist /fi "PID eq <pid>"` mit der PID aus der letzten Spalte).
2. Läuft dort bereits ein eigener, älterer Dashboard-Prozess (z. B. aus einem vorherigen
   `npm run dev`, das nicht sauber beendet wurde): den Prozess beenden.
3. Läuft dort etwas anderes: entweder das fremde Programm beenden oder `port` in
   `einstellungen.json` im Datenverzeichnis setzen — dann ändert sich auch die erwartete `Origin`/`Host` in
   `server/sicherheit.ts` automatisch mit, da beide aus derselben Konfiguration gelesen
   werden.

## Update verweigert

`npm run update` (und damit `Aktualisieren.*`) zieht nur `main` von `github.com/jx42/Scapio`
([ADR-055](entscheidungen/ADR-055-update-und-release-kette.md)). Was ankommt, führt der nächste
Start aus; eine fremde Gegenstelle oder ein eigener Branch wird deshalb nicht still übernommen.

- **„… holt Updates nicht von …“:** `git remote -v` zeigt, wohin `origin` zeigt. Ein eigener Fork
  wird von Hand aktualisiert (`git pull`). Sonst zurück: `git remote set-url origin https://github.com/jx42/Scapio.git`.
- **„Ausgecheckt ist …“:** `git switch main`, danach erneut aktualisieren. Eigene Commits auf
  einem anderen Branch bleiben dort liegen.

## Schema geändert

Migrationen liegen unter `db/migrationen/00N-*.sql`, streng vorwärts — eine bestehende
Datei wird nie verändert, eine Änderung schreibt die nächste Nummer. Vor **jeder**
Migration legt `db/verbindung.ts` automatisch eine Sicherung über die SQLite-Backup-API
an (`sicherung/portfolio-migration-<user_version>-<zeitstempel>.db`) — das ist kein
manueller Schritt. Dazu kommt die wöchentliche Sicherung beim Start
(`portfolio-auto-…`): `npm start` sichert von selbst, wenn die jüngste Sicherung gleich
welchen Anlasses älter als sieben Tage ist
([ADR-045](entscheidungen/ADR-045-woechentliche-sicherung-beim-start.md)). Alle drei
Arten — Migration, automatisch und `npm run backup` (`portfolio-<version>-…`) — landen im
selben Verzeichnis, werden von `alteSicherungenLoeschen` aber getrennt gezählt: je Anlass
bleiben die **letzten fünf** Dateien stehen, dazu die neueste je Monat der letzten zwölf Monate
und die neueste je Jahr ([ADR-056](entscheidungen/ADR-056-datenverzeichnis-und-dateirechte-aus-einer-hand.md)). Mehrfaches manuelles Sichern kurz vor einer
Migration kann die automatische Migrationssicherung also nicht mehr aus der Rotation drängen.

Nach einer Schemaänderung:

1. `npm run check` — deckt ab, ob Repositories und Tests noch zum neuen Schema passen.
2. Hat sich an der *Bedeutung* einer Spalte etwas geändert (nicht nur an ihrer Existenz),
   prüfen, ob `KERN_VERSION` (`core/version.ts`) mit erhöht werden muss [INV-10] — das löst
   eine vollständige Neuberechnung aus `raw_snapshot` aus, ohne neuen MCP-Aufruf: beim
   nächsten Start (`start/start.ts`) oder spätestens im nächsten Lauf.
3. Schlägt eine Migration fehl: die Sicherung von direkt davor
   (`portfolio-migration-…`) liegt in `sicherung/` bereit. Zurückspielen wie unter
   [„Datenbank beschädigt“](#datenbank-beschädigt) beschrieben, mit dieser Datei statt
   der neuesten.

Für eine manuelle Sicherung außerhalb einer Migration: `npm run backup` — zieht aus
derselben Rotation wie oben beschrieben.

## Datenbank beschädigt

Der Start, ein Lauf oder `npm run backup` bricht mit `E_DB_BESCHAEDIGT` ab: `PRAGMA
quick_check` hat beim Öffnen etwas anderes als `ok` gemeldet. Die Datenbank wird dann nicht
angefasst, auch nicht migriert.

Jede Sicherung in `sicherung/` wurde vor dem Umbenennen auf dieselbe Weise geprüft; eine
Datei dort ist also lesbar. Wer regelmäßig startet, hat dort eine höchstens eine Woche alte
`portfolio-auto-…`-Datei. Wiederherstellen:

1. Scapio beenden (Terminal- bzw. Konsolenfenster schließen).
2. `portfolio.db` im Datenverzeichnis beiseitelegen, `portfolio.db-wal` und
   `portfolio.db-shm` löschen. Die Sicherung ist ein vollständiges Einzeldatei-Abbild;
   ein liegengebliebenes `-wal` gehört zur ALTEN Datei, und SQLite spielte es sonst über
   die zurückkopierte.
3. Die neueste Datei aus `sicherung/` (gleich welchen Anlasses, nach Änderungsdatum) als
   `portfolio.db` zurückkopieren.
4. Neu starten. Liegt die Sicherung zurück, holt der nächste Lauf die fehlenden Tage nach.
   Stammt sie von einem älteren Schema, migriert der Start sie von selbst.

## Datenverzeichnis abgelehnt

Der Start bricht mit „datenverzeichnis darf nicht …" ab, bevor etwas geöffnet wird. Abgelehnt
werden ein relativer Pfad, das Benutzerverzeichnis selbst, alles im Projektordner und jeder
synchronisierte Ordner [ADR-056]: unter macOS `~/Documents`, `~/Desktop` (beide synchronisiert
iCloud auf Wunsch), `~/Library/Mobile Documents` (iCloud Drive) und `~/Library/CloudStorage`
(Dropbox, OneDrive, Google Drive); unter Windows jeder Ordner, den die Variablen `OneDrive`,
`OneDriveConsumer` oder `OneDriveCommercial` nennen. Ein Synchronisierdienst lädt
`portfolio.db` und `portfolio.db-wal` getrennt hoch und zerreißt so die Datenbank.

`datenverzeichnis` in `config.json` entfernen (dann gilt die Vorgabe) oder auf einen Ordner
außerhalb setzen; die Dateien vom alten Ort bei beendetem Scapio dorthin verschieben.

## Datei im Datenverzeichnis abgelehnt

Start, Lauf oder Anmeldung brechen mit `E_DATEI_FREMD` ab: `portfolio.db`, `mcp/token.json`
oder `mcp/client.json` ist eine Verknüpfung (Symlink), keine gewöhnliche Datei oder gehört
unter macOS einem anderen Benutzer. Geöffnet wird sie dann nicht — eine Verknüpfung könnte
Depotdaten oder den Token an einen synchronisierten Ort umleiten [ADR-056].

- Verknüpfung: durch die echte Datei ersetzen (Ziel hineinkopieren, Verknüpfung löschen).
  Das Datenverzeichnis selbst verlegt `SCAPIO_DATENVERZEICHNIS`, nicht eine Verknüpfung.
- Fremder Eigentümer (meist nach `sudo npm start`): `sudo chown "$USER" <Datei>`.
- Token oder Client: Datei löschen und `npm run mcp-login` erneut ausführen.

Unter Windows prüft Scapio keinen Eigentümer; dort gelten die geerbten Rechte von
`%LOCALAPPDATA%`, die nur dem eigenen Konto Zugriff geben ([SICHERHEIT.md](SICHERHEIT.md)).

## Zahlen sehen falsch aus

In dieser Reihenfolge:

1. **`npm run verify`** — siehe oben. Das beantwortet die Frage „stimmt `depot_tag` mit
   dem, was aus `raw_snapshot` folgt, überein" abschließend und ohne Vermutung. In einer
   Agentensitzung `npm run verify:zaehlung`: dieselbe Prüfung, nur Tag und Feld ohne Beträge
   [ADR-042].
2. Steht das Drift-Banner? Siehe den Abschnitt oben — das beantwortet „stimmt die
   rekonstruierte Historie mit dem gemeldeten Bestand überein".
3. Wirkt eine einzelne Kennzahl falsch (IZF, TWR, Realrendite), aber `depot_tag` und der
   Bestand stimmen: die entsprechende `core/`-Funktion hat einen eigenen, sehr
   ausführlichen Unit-Test in `test/core/` — dort steht die erwartete Rechnung Zeile für
   Zeile. Eine falsche Kennzahl bei korrekter Rohreihe ist ein Fehler im Rechenkern, kein
   Datenfehler; siehe `core/CLAUDE.md` für die Sorgfaltsregeln dort und nicht vergessen,
   `KERN_VERSION` zu erhöhen, sobald die Ursache behoben ist [INV-10].
4. Wirkt ein einzelner Kurs falsch: in `kurs` nachsehen, ob `auffaellig = 1` gesetzt ist —
   das markiert bereits einen Tagessprung > 30 %, den `ingest/plausibilitaet.ts` erkannt
   hat. Alle Plausibilitätsprüfungen des Ingest (Menge/Kurs, Datum, Wertsumme, Kurssprung,
   Historienbeginn, Verbraucherpreisindex) stehen mit ihren Folgen im Kopfkommentar dieser
   Datei — die beiden ersten brechen den Lauf ab, die übrigen landen als Hinweis in
   `lauf.hinweise_json`.

## „Positionswerte + Verrechnungskonto weichen um mehr als 1 € vom Gesamtwert ab"

Die Selbstkontrolle aus §7.7 vergleicht die eigene Summe (`holdings` × Live-Kurs plus
`cash`) mit `valuation.total` aus `get_portfolio_overview`
([ADR-032](entscheidungen/ADR-032-gesamtwert-aus-portfolio-overview.md)). Beide Seiten
gelten zu verschiedenen Zeitpunkten, und die Zeile vergleicht deshalb nur, wenn kein Kurs
jünger ist als `valuationTimestampUtc` der Bank
([ADR-015](entscheidungen/ADR-015-summenprobe-nur-bei-gleichem-stand.md)) und dieser Stand
schon vor dem Lauf feststand — eine Live-Bewertung während des Handels wird nicht verglichen
([ADR-033](entscheidungen/ADR-033-summenprobe-ohne-live-bewertung.md)).

Steht der Hinweis, ist er also **kein Zeitstempel-Artefakt**, sondern ein echter Befund.
Die drei Ursachen in der Reihenfolge ihrer Häufigkeit:

1. **Eine Position fehlt auf einer der beiden Seiten.** `valuation.securities` der letzten
   `gesamtwert`-Rohantwort gegen die Summe der Positionswerte halten:
   `SELECT payload_json FROM raw_snapshot WHERE quelle = 'gesamtwert' ORDER BY id DESC LIMIT 1`.
2. **Der Kontostand fehlt oder ist doppelt gezählt.** `valuation.total` enthält den
   Kontostand; steht die Abweichung genau auf dem Kontostand aus der `cash`-Rohantwort,
   ist es dieser.
3. **Eine Buchung ist doppelt im Bestand.** Dann zeigt auch das Drift-Banner an, und
   `npm run verify` benennt den Tag.

Die Meldung nennt nur die Größenordnung (`10^2 €`), nie den Betrag — ein Hinweis, der in
der Oberfläche steht, verrät keinen Kontostand. Den genauen Betrag rechnet man aus den
Rohantworten des Laufs nach, sie liegen vollständig in `raw_snapshot`.

## „… der letzten 30 Tage ohne vollständige Kurse"

Der Hinweis steht unter dem Aktualisieren-Knopf und stammt aus der Neuberechnung des Laufs
(`ingest/lauf.ts`). Ein Kalendertag gilt als lückenhaft, wenn eine Position mit Bestand an
diesem Tag keinen Kurs im Raster hat (`core/depotreihe.ts`); bewertet wird sie dann mit dem
letzten gemessenen Kurs, und die TWR-Verkettung überspringt den Tag, statt aus der fehlenden
Notierung eine Rendite zu erfinden (`core/twr.ts`).

Gemeldet werden **nur die letzten `JUNGE_SPANNE_TAGE` = 30 Tage** (`ingest/neuberechnung.ts`).
Die Gesamtzahl steht dauerhaft im vierstelligen Bereich — sie ist die Frühzeit des Depots, für
die es je ISIN nur Monatsstände gibt, und als Meldung deshalb wertlos. Sie steht weiterhin im
Laufprotokoll (`Neuberechnung: … lueckenhaft, davon … jung`), für die Fehlersuche.

Erscheint der Hinweis, ist das ein **frischer Kursausfall** und meist echt:

1. `npm run ingest` und ins Protokoll sehen — welche Quelle steht auf `fehler`?
2. In `kurs` nachsehen, für welche ISIN der letzte Tag zurückliegt:
   `SELECT isin, MAX(tag) FROM kurs GROUP BY isin`. Eine einzelne ISIN heißt: dieses Papier
   liefert keine Kurse mehr. Alle ISINs heißen: die Quelle ist ausgefallen.
3. Wochenenden und Feiertage sind es nicht — das Kursraster füllt bis zu fünf Tage vorwärts
   (`FUELL_GRENZE_TAGE`), sie erscheinen gar nicht erst als Lücke.

Verschwindet der Hinweis nach einem erfolgreichen Lauf von selbst, war die Quelle nur kurz
nicht erreichbar. Bleibt er, fehlt die Kursreihe eines Papiers dauerhaft.

## „Ø Inflation p.a." endet in der Vergangenheit

Die Preisreihe kommt aus **zwei** Eurostat-Datensätzen: `prc_hicp_midx` liefert die
Historie, `ei_cphi_m` füllt den Rand
([ADR-017](entscheidungen/ADR-017-zweiter-eurostat-datensatz-fuer-den-rand.md)). Steht die
Ø Inflation p.a. auf einem alten Stand oder meldet die Kachel fortgeschriebene Monate, ist
einer der beiden hängen geblieben — welcher, sagt das Laufprotokoll:

`SELECT quellen_json, hinweise_json FROM lauf ORDER BY id DESC LIMIT 1` — oder, ohne
SQLite zur Hand, dieselbe Auskunft unter dem Aktualisieren-Knopf.

- `"vpi":"fehler"` — die amtliche Reihe fehlt. Dann fehlt auch die Basis für die
  Umbasierung, und `vpi-aktuell` überspringt sich selbst: **beide** Schlüssel sind auffällig,
  aber die Ursache ist nur einer.
- `"vpi":"erfolg","vpi-aktuell":"fehler"` — der Rand fehlt. Das Dashboard steht auf dem
  Stand der amtlichen Reihe. Kein Datenfehler, nur ein alter Rand.
- `"vpi-aktuell":"uebersprungen"` — `inflationsquelle` steht nicht auf `eurostat`
  (`docs/ARCHITEKTUR.md`, Konfiguration).

Welcher Datensatz wie weit reicht, steht in der Datenbank:

`SELECT quelle, MAX(monat), COUNT(*) FROM vpi GROUP BY quelle`.

Erwartet: `eurostat:prc_hicp_midx` mit der Historie, `eurostat:ei_cphi_m` mit einer Handvoll
Monaten am Ende. Fehlt die zweite Zeile ganz und liegt `MAX(monat)` der ersten Monate
zurück, hat der Rand nie geschrieben — Lauf mit `npm run ingest` wiederholen und die
Fehlerzeile im Protokoll lesen. Zwei Meldungen sind dabei kein Netzproblem, sondern eine
inhaltliche Ablehnung durch `umrechnungsfaktor`:

- **„… ueberlappen sich in N Monaten"** — die beiden Reihen haben zu wenig gemeinsame
  Monate. Der Rand wird erst ab `SEIT` in `ingest/quellen/vpiAktuell.ts` geholt; endet die
  amtliche Reihe kurz nach diesem Datum, bleibt zu wenig Überschneidung. Dann gehört `SEIT`
  weiter zurückgesetzt — nicht `MINDEST_UEBERLAPPUNG` herunter.
- **„… schwankt um X %"** — das Verhältnis der beiden Reihen ist nicht mehr konstant. Dann
  hat Eurostat eine der beiden methodisch umgestellt, und die Verkettung wäre geraten. Hier
  wird nichts gelockert: nachsehen, welcher Datensatz sich geändert hat.

Ein Hinweis **„Verbraucherpreisindex springt in N Monaten um mehr als 3 %"** kommt aus
`pruefeVpiReihe` und meint die fertige Reihe. Er ist der zweite Wächter derselben Naht:
liegen die genannten Monate genau am Übergang zwischen den beiden Datensätzen, ist die
Umbasierung schief — dann die Werte in `vpi` um diesen Monat herum ansehen und mit den
Rohantworten in `raw_snapshot` (`quelle = 'vpi-aktuell'`, dort steht der verwendete
`faktor`) vergleichen.

## Der Doppelklick auf Start.command / Start.bat bricht ab

Das Startskript macht drei Dinge, und es sagt bei jedem, wo es steht (`1/3`, `2/3`, `3/3`).
`Start.bat` ist die Zeile-für-Zeile-Entsprechung von `Start.command` — dieselben
drei Schritte, dieselben Meldungen, dieselben Merkdateien unter `.start\`. Was unten steht,
gilt für beide.

- **„Scapio ist noch nicht entpackt".** Neben dem Skript fehlt `package.json` — meist unter
  Windows, wenn die `.bat` direkt in der ZIP-Ansicht des Explorers doppelgeklickt wurde. Der
  Explorer startet dann eine einzelne Kopie aus `%TEMP%`. ZIP mit „Alle extrahieren"
  entpacken, im entpackten Ordner erneut doppelklicken.
- **„Node.js ist nicht installiert" / „Node.js ist zu alt".** Genau das, was dasteht: Es
  braucht Node ≥ 24, weil die Datenbank über `node:sqlite` in Node selbst steckt
  ([ADR-002](entscheidungen/ADR-002-node-sqlite-statt-better-sqlite3.md)). Das Skript öffnet
  die Download-Seite selbst; LTS-Version installieren, Fenster schließen, erneut doppelklicken.
- **„Die Abhängigkeiten ließen sich nicht installieren".** Die vollständige Ausgabe von
  `npm ci` steht in `.start/installation.log` im Projektordner — im Fenster steht sie
  bewusst nicht, weil dort Hunderte Zeilen npm-Ausgabe niemandem helfen. Häufigste
  Ursache: keine Netzverbindung.
- **Es wird jedes Mal neu installiert.** Sollte nicht passieren: Das Skript merkt sich in
  `.start/package-lock.sha256` den Hash der Paketliste und installiert nur, wenn der sich
  geändert hat (oder `node_modules/` fehlt). Wurde `.start/` gelöscht, ist der nächste
  Start wieder der langsame — danach nicht mehr.

`.start/` enthält nur diese beiden Dateien, gehört zum Checkout und nicht zu den Daten des
Benutzers, steht in `.gitignore` und darf jederzeit gelöscht werden.

Nur unter macOS:

- **„Start.command wurde nicht geöffnet" (Gatekeeper).** Gilt jedem unsignierten Skript aus
  dem Internet, auch nach jedem ZIP-Update. Ab macOS 15: Meldung schließen, Systemeinstellungen
  → Datenschutz & Sicherheit → „Dennoch öffnen". Bis macOS 14: Rechtsklick → „Öffnen".

Nur unter Windows:

- **„Der Computer wurde durch Windows geschützt" (SmartScreen).** Gilt jedem unsignierten
  Skript aus dem Internet. „Weitere Informationen" → „Trotzdem ausführen". Alternativ vor
  dem ersten Start: Rechtsklick auf die Datei → Eigenschaften → „Zulassen".
- **Das Fenster blitzt auf und ist sofort wieder weg.** Dann ist `cmd.exe` über die Datei
  gestolpert, bevor sie etwas ausgeben konnte — praktisch immer, weil die Zeilenenden auf
  LF stehen statt auf CRLF. `.gitattributes` nagelt `*.bat` auf CRLF fest; wurde die Datei
  an Git vorbei kopiert (E-Mail, Editor mit eigener Meinung), hilft ein erneuter Checkout.
- **„node wird nicht als interner oder externer Befehl erkannt".** Node ist installiert,
  aber das Fenster kennt den Pfad noch nicht: Der Installer setzt `PATH` erst für neu
  geöffnete Fenster. Ab- und wieder anmelden, dann erneut doppelklicken.

## Frische Installation prüfen

```sh
git clone …
npm ci --ignore-scripts
npm start
```

Warum `--ignore-scripts` und warum `npm start` keinen Typecheck macht: [ENTWICKLUNG](ENTWICKLUNG.md).
Erwartet: `npm start` öffnet die Datenbank, serviert und öffnet den Browser. Danach baut es
die Oberfläche (nur wenn `dist/` älter ist als eine Quelldatei — sonst steht dort „Die
Oberflaeche ist aktuell"), solange zeigt der Browser „Scapio wird gebaut“ — oder, während der erste Lauf unterwegs ist,
„Anmeldung abgeschlossen“ mit dem Schritt des Laufs. Gleichzeitig
ingestiert es einmalig, nur wenn die Datenbank noch leer ist; ein zweiter Start holt nichts
erneut [ADR-039].
