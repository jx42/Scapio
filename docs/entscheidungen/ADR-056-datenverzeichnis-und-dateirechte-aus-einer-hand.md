# ADR-056: Datenverzeichnis und Dateirechte aus einer Hand

Nachtrag zu [ADR-005](ADR-005-datenbank-ausserhalb-des-projekts.md),
[ADR-045](ADR-045-woechentliche-sicherung-beim-start.md) und
[ADR-049](ADR-049-deinstallation-loescht-nur-den-datenordner.md); Befund aus dem Audit vom 2026-10-17.

## Kontext

`0700`/`0600` standen in fünf Kopien (Datenbank, Token, Sperre, Protokoll, Übernahme), eine davon
ohne `chmod`. Keine prüfte, ob `portfolio.db` oder `token.json` eine Verknüpfung ist — `chmod`
folgt ihr, ein Symlink konnte Depotdaten oder den Refresh-Token unbemerkt an einen
synchronisierten Ort umleiten. ADR-005 hielt nur den Projektordner fern, nicht `~/Documents`
oder OneDrive; unter Windows fiel die Vorgabe ohne `LOCALAPPDATA` ins Profil selbst. Die Rotation
behielt fünf Sicherungen je Anlass, also rund fünf Wochen. Ein abgebrochenes `sichern` ließ
`-wal`/`-shm` der Temp-Datei liegen. Der Schlüssel weggeklickter Hinweise trug ISIN und
Wertpapiernamen in den `localStorage`, den die Deinstallation nicht erreicht.

## Entscheidung

- **`shared/dateirechte.ts`** ist die eine Stelle: `verzeichnisAnlegen` (0700), `nurFuerMich`
  (0600), `atomarSchreiben` und `eigeneDatei`. Diese prüft per `lstat` vor dem Öffnen von
  Datenbank, `token.json` und `client.json`: keine Verknüpfung, gewöhnliche Datei, unter POSIX
  eigene uid. Sonst Abbruch mit `E_DATEI_FREMD`; die Meldung nennt nur den Dateinamen.
- **Sync-Wurzeln abgelehnt** in `pfadAufloesen`: macOS `~/Documents`, `~/Desktop`,
  `~/Library/Mobile Documents`, `~/Library/CloudStorage`; Windows die Ordner aus `OneDrive`,
  `OneDriveConsumer`, `OneDriveCommercial`. Ohne Groß-/Kleinschreibung.
- **Windows-Rückfall** ohne `LOCALAPPDATA`: `%USERPROFILE%\AppData\Local\scapio`.
- **Rotation ausgedünnt** (Nachtrag ADR-045): je Anlass die fünf neuesten, dazu die neueste je
  Monat der letzten zwölf Monate und die neueste je Jahr. `sichern` räumt `-wal`/`-shm` der
  Temp-Datei ab.
- **Hinweis-Schlüssel** (Nachtrag ADR-049): Art plus FNV-1a-Prüfsumme der Werte, kein Klartext.

## Verworfene Alternativen

- **ACLs unter Windows per `icacls`** — wie in [SICHERHEIT.md](../SICHERHEIT.md), Restrisiko 2:
  ein Kindprozess mehr. Dort prüft `eigeneDatei` nur Verknüpfung und Dateiart.
- **Sync-Erkennung über Erweiterte Attribute oder Dienst-APIs** — Code je Anbieter; die festen
  Wurzeln decken die Standardorte ab.

## Folgen

- Ein bisher geduldetes `datenverzeichnis` in `~/Documents` oder OneDrive lässt den Start
  abbrechen — Abhilfe im Runbook, „Datenverzeichnis abgelehnt".
- Bis zu 5 + 12 + Jahre Sicherungen je Anlass statt fünf; bei wöchentlicher Sicherung nach zehn
  Jahren rund 27 je Anlass.
- Weggeklickte Hinweise des laufenden Laufs erscheinen nach dem Update einmal wieder.
