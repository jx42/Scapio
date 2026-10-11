# Speicher

SQLite über `node:sqlite`. Schema je Tabelle: `docs/DATENMODELL.md`.

## Regeln
- Migrationen unter `migrationen/` sind vorwärts-only: eine bestehende Datei wird nie
  geändert, eine Änderung ist die nächste Nummer. `PRAGMA user_version` folgt der Nummer.
  Die Sicherung vor jeder Migration legt `verbindung.ts` selbst an.
- Geld als `bigint` in Cent, nie `REAL`. [INV-02]
- Ein Import läuft in `inTransaktion` (`repository/hilfen.ts`) und darf beliebig oft
  wiederholt werden. [INV-09]
- Repository-Muster: `Zeile`, `SPALTEN` (`satisfies Spalten<Zeile>`), Mapper `zu()` —
  Bindung und Platzhalter folgen aus `SPALTEN` (`repository/hilfen.ts`). `bestand`,
  `lauf`, `rawSnapshot`, `sparplan`, `vpi` und `zins` folgen dem noch nicht; bei
  Berührung umstellen.
- Beim Öffnen läuft `PRAGMA quick_check`; ein Befund wird `E_DB_BESCHAEDIGT`, nie ein
  stilles Weiterlaufen.

## Anschließen und Fehlersuche
- Neue Spalte: `docs/ARCHITEKTUR.md`, „Wo etwas angeschlossen wird".
- Migrationstest: `test/db/migration.test.ts` gegen `test/fixtures/schema/v001.sql`.
- `docs/RUNBOOK.md`, „Schema geändert" und „Datenbank beschädigt".
