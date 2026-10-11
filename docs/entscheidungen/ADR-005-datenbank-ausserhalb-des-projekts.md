# ADR-005: Datenbank außerhalb des Projektordners

## Kontext

Der naheliegende Ort für die SQLite-Datenbank eines lokalen Projekts wäre ein Unterordner
im Repository selbst, etwa `data/portfolio.db`. Zwei Gründe sprechen dagegen:

Erstens landet ein Projektordner unter `~/Documents` bei den meisten macOS-Installationen
faktisch unter iCloud-Synchronisierung — oft ohne dass es dem Benutzer bewusst ist. Eine
Datenbank mit dem vollständigen, rekonstruierten Wertpapierdepot eines Menschen würde damit
unbeabsichtigt in die Cloud repliziert, obwohl das gesamte Projekt explizit „keine Cloud“
verspricht (`AGENTS.md`).

Zweitens ist ein Repository ein Git-Arbeitsverzeichnis. Eine `.gitignore`-Regel schützt nur
vor einem versehentlichen `git add`, nicht vor Werkzeugen, die den Ordner unabhängig von Git
durchsuchen, indizieren oder sichern (Spotlight, Time-Machine-Ausnahmen, IDE-Indizierung).

## Entscheidung

Datenbank und Sicherungen liegen unter
`~/Library/Application Support/scapio/` — dem macOS-Standardort für
Anwendungsdaten, der weder unter iCloud-Drive-Synchronisierung noch im Projektordner liegt.
`shared/konfiguration.ts` löst diesen Pfad zentral auf (`dbPfad`, `sicherungsPfad`,
`logPfad`); kein anderer Programmteil konstruiert einen Datenpfad selbst. `db/verbindung.ts`
setzt zusätzlich `0700` auf das Verzeichnis und `0600` auf die Datenbankdatei, damit auch
andere Benutzerkonten desselben Rechners nicht lesend zugreifen können.

## Folgen

- `git clone` dieses Repositories bringt nie echte Portfoliodaten mit — auch nicht
  versehentlich in einem alten Commit.
- Ein Mensch, der die Daten sucht, muss den Pfad in `shared/konfiguration.ts`/`AGENTS.md`
  nachschlagen, statt sie im Projektordner vorzufinden — dokumentiert im
  [RUNBOOK.md](../RUNBOOK.md) und in der Übergabeprüfliste in
  [SICHERHEIT.md](../SICHERHEIT.md).
- Ein Wechsel des Datenverzeichnisses (z. B. für Tests) geschieht ausschließlich über
  `config.json`, nie über einen Codepfad, der `~/Documents` oder das Projektverzeichnis
  fest verdrahtet.

## Nachtrag: derselbe Gedanke unter Windows

Die Entscheidung oben ist als macOS-Pfad geschrieben, ihr Grund ist es nicht: Der Ort soll
**nicht synchronisiert** werden. Unter Windows heißt derselbe Gedanke
`%LOCALAPPDATA%\scapio\`.

Ausdrücklich **nicht** `%APPDATA%`. Das ist das Roaming-Profil, und auf einem Rechner in einer
Windows-Domäne wird es beim An- und Abmelden über das Netz auf einen Dateiserver kopiert —
dasselbe Problem wie iCloud, nur mit einem Dateiserver statt einer Cloud, und mit demselben
Ergebnis: Das rekonstruierte Depot eines Menschen läge auf fremder Infrastruktur, obwohl das
Projekt „keine Cloud“ verspricht. `%LOCALAPPDATA%` bleibt auf dem Gerät. Die beiden
Variablennamen unterscheiden sich um ein Wort; deshalb steht die Wahl in
`vorgabeDatenverzeichnis()` (`shared/konfiguration.ts`) hinter einem Test, der genau sie prüft
(`test/plattform.test.ts`) — nicht nur den Pfad, sondern auch, dass „Roaming“ nicht darin
vorkommt.

Die Vorgabe ist deshalb eine Funktion, kein fester Wert: Sie wird beim Lesen der
Konfiguration ausgewertet, nicht beim Laden des Moduls. Aus demselben Grund steht
`datenverzeichnis` **nicht mehr** in der eingecheckten `config.json` — ein fester Wert dort
hätte die plattformabhängige Vorgabe auf jedem Rechner überschrieben und den macOS-Pfad
nach Windows getragen.

### Was hier nicht gelöst ist

`0700`/`0600` wirken unter NTFS nicht. Node setzt dort über `mode` praktisch nur das
Nur-Lesen-Attribut; Schutz vor anderen lokalen Benutzerkonten gibt es damit keinen. Was
unter Windows schützt, sind die geerbten Rechte von `%LOCALAPPDATA%`.

Das bleibt so. Echte Parität bräuchte ACL-Aufrufe über `icacls`, also einen weiteren
Kindprozess — in einem Programm, dessen Sicherheitshaltung darin besteht, wenige davon zu
starten, und das mit
[ADR-010](ADR-010-direkte-mcp-anmeldung-ohne-claude-code.md) gerade einen abgebaut hat. Die
Lücke wird benannt statt zugedeckt: [SICHERHEIT.md](../SICHERHEIT.md), Restrisiko 2, samt
der Bedingung, unter der die Abwägung kippt.
