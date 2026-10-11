# ADR-041: `seed.json` im Datenverzeichnis

Nachtrag zu [ADR-037](ADR-037-eigene-dateien-im-datenverzeichnis.md).

## Kontext

`ingest/seed.json` trägt den Anfangsbestand [P-13]: ISIN, Menge und Betrag vor dem ersten
Umsatz, den die Bank liefert. Das sind Depotdaten. Die Datei lag versioniert im Projektordner,
der unter `~/Documents` in iCloud gespiegelt wird, und ein `git commit -a` hätte einen
befüllten Anfangsbestand mitgenommen. ADR-037 hat `funds.json` verlegt, `seed.json` nicht.

## Entscheidung

- **`seed.json` liegt im Datenverzeichnis** (`seedPfad` in `shared/konfiguration.ts`).
- **Die Vorlage heißt `docs/seed.example.json`**, wie `docs/einstellungen.example.json`; sie
  wird zur Laufzeit nie gelesen.
- **Der Start zieht eine vorhandene `ingest/seed.json` einmalig um** (`start/uebernahme.ts`),
  mit denselben Regeln wie `funds.json`: nie überschreiben, danach die Altdatei löschen.
- **`ingest/seed.json` steht in `.gitignore`**, damit eine Altdatei bis zur Übernahme nicht
  eingecheckt wird.
- **Ingest, Datenbank und Rechenkern verwenden `PROJEKTWURZEL` nicht**
  (`test/konfiguration.test.ts`). Was sie lesen, ist Nutzer- oder Depotdatei.

## Folgen

- Wer bei einem Git-Update eine befüllte `ingest/seed.json` hat, bekommt sie über den Stash in
  `start/update.ts` zurück (Konflikt „von uns gelöscht“, Datei bleibt im Stash) und der nächste
  Start zieht sie um.
- Texte in Oberfläche und RUNBOOK nennen den Datenordner statt `ingest/`.
