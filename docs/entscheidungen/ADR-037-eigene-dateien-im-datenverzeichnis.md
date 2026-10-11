# ADR-037: Eigene Dateien im Datenverzeichnis, ZIP-Update ohne Kopieren

## Kontext

Seit [ADR-035](ADR-035-zip-als-standardweg-der-installation.md) ist das ZIP der Standardweg.
Ein Update hieß dort: ZIP laden, entpacken, `ingest/funds.json` und eine geänderte
`config.json` aus dem alten Ordner kopieren, starten. Das Kopieren ist der Schritt, der
vergessen wird; danach ist die Top-25-Kachel leer oder der Port wieder der alte, ohne dass
irgendwo steht, warum.

## Entscheidung

- **`funds.json` liegt im Datenverzeichnis** ([ADR-005](ADR-005-datenbank-ausserhalb-des-projekts.md)),
  nicht mehr unter `ingest/`. Sie ist Nutzerdatei, nicht Code.
- **`einstellungen.json` im Datenverzeichnis** legt sich über `config.json`. Erlaubt sind die
  Schlüssel, die ein Nutzer anpasst (`port`, Zeitlimits, Quellen, `driftSchwellen`). Nicht
  erlaubt sind `erlaubteHosts` und `datenverzeichnis`: die Allowlist bleibt im Repository
  und im Review (ADR-013), und das Datenverzeichnis kann sich nicht selbst verlegen.
- **Der Start zieht beides einmalig um** (`start/uebernahme.ts`): eine vorhandene
  `ingest/funds.json` wird verschoben, von der Vorgabe abweichende Werte aus `config.json`
  werden nach `einstellungen.json` geschrieben. Eine Datei im Datenverzeichnis wird nie
  überschrieben. Damit funktioniert auch die alte Anleitung („Dateien in den neuen Ordner
  kopieren“) noch für den Übergang.
- **`Aktualisieren.*` öffnet bei einer ZIP-Installation den Download-Link** im Browser und
  nennt die verbleibenden Schritte. Der Link steht fest im Code (`ZIP_ADRESSE` in
  `start/update.ts`). Das Skript lädt nichts selbst und prüft keine Version; es ersetzt nur
  den Klick auf den Link in der README. ADR-013 bleibt damit unberührt.

## Verworfene Alternativen

- **Das Skript lädt und entpackt das ZIP selbst.** Aus den Gründen in ADR-013 verworfen:
  Selbst-Updater mit Prüfsumme, Herkunft und halb überschriebenem Ordner, dazu eine neue
  Gegenstelle.
- **Die ganze `config.json` ins Datenverzeichnis.** Bleibt aus dem Grund in ADR-013
  verworfen: `erlaubteHosts` gehört in die Versionskontrolle.

## Folgen

- Ein ZIP-Update besteht aus Laden, Entpacken, Starten, alten Ordner löschen.
- Git-Nutzer ändern `config.json` nicht mehr; der Stash-Umweg in `start/update.ts` greift
  nur noch für Altfälle.
- Wer `funds.json` von Hand anlegt, muss den Datenordner finden (unter macOS in der
  versteckten `~/Library`). Die Texte in der Oberfläche nennen beide Pfade.
- `ingest/funds.json` bleibt in `.gitignore`, damit eine Altdatei bis zur Übernahme nicht
  versehentlich eingecheckt wird.
- Nachtrag: `seed.json` folgt denselben Regeln, siehe
  [ADR-041](ADR-041-seed-im-datenverzeichnis.md).
