# ADR-003: Eurostat statt Destatis als Quelle für den Verbraucherpreisindex

## Kontext

Die inflationsbereinigte Realrendite (`core/inflation.ts`) braucht eine monatliche
Zeitreihe des deutschen Verbraucherpreisindex. Zwei naheliegende Quellen: das Statistische
Bundesamt (Destatis, GENESIS-Datenbank) oder Eurostat, das dieselben nationalen Daten im
Rahmen des harmonisierten Verbraucherpreisindex (HVPI) re-publiziert.

Destatis' GENESIS-Schnittstelle verlangt für automatisierte Abfragen eine Registrierung
und ein eigenes Zugangstoken — das widerspricht dem Grundsatz „keine Zugangsdaten in der
Anwendung“ (`AGENTS.md`), denn ein solches Token müsste irgendwo hinterlegt werden, auch
wenn es kein Bankzugang ist. Eurostats öffentliche REST-API (`ec.europa.eu/eurostat/api/…`)
ist dagegen ohne Anmeldung erreichbar und liefert dieselbe Kennzahl in ausreichender
Aktualität.

## Entscheidung

`vpi.quelle` steht auf `eurostat`. Der Ingest ruft die öffentliche Eurostat-API ohne
Zugangsdaten ab, über dieselbe Host-Allowlist-Absicherung wie die Anbieter-Abrufe
(`ingest/netz.ts`, siehe [SICHERHEIT.md](../SICHERHEIT.md)).

## Folgen

- Kein zusätzliches Zugangstoken im Projekt.
- Der harmonisierte Index (HVPI) weicht methodisch geringfügig vom nationalen deutschen VPI
  ab (leicht unterschiedliche Warenkorb-Gewichtung). Für eine Realrenditen-Näherung über
  Jahre hinweg ist dieser Unterschied nicht spürbar relevant.
- Die Spalte `vpi.quelle` bleibt bewusst als Textfeld bestehen (nicht als Konstante im Code),
  damit eine spätere Umstellung — etwa zurück auf Destatis, sollte sich dessen Zugangsmodell
  ändern — keine Schemaänderung braucht, nur einen neuen Ingest-Lauf.
