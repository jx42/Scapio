# ADR-030: Antworten von Anbieter-Webseiten ohne `.strict()`

## Kontext

`ingest/CLAUDE.md` verlangt für jede fremde Antwort `.strict()` mit Obergrenzen [INV-12]. Die
iShares-Antwort (`get-product-data`, [ADR-027](ADR-027-ishares-holdings-per-get-product-data.md))
ist aber kein Datenvertrag, sondern das, was die Produktseite für sich selbst lädt: dutzende
Datenpunkte je Container, und iShares ergänzt dort laufend Felder. `.strict()` ließe jeden Lauf
an einem neuen Feld scheitern, das niemand liest. Bisher stand deshalb `.passthrough()` im
Schema, das die unbekannten Felder im geprüften Objekt mitführt.

## Entscheidung

- Antworten von Anbieter-Webseiten werden mit einfachem `z.object` geprüft: bekannte Felder
  mit Typ und Obergrenze, unbekannte schneidet zod weg. `.passthrough()` gibt es im Ingest nicht.
- Dasselbe gilt für den JSON-RPC-Umschlag in `ingest/mcp.ts` und die OAuth-Antworten in
  `ingest/mcpAnmeldung.ts`: Protokollfelder wie `params`, `error.data` oder `id_token` werden
  verworfen, nicht gelesen.
- Antworten des Scalable-MCP (Nutzlast) und alles, was wir selbst schreiben (`client.json`,
  `funds.json`), bleiben `.strict()`.
- `test/invarianten/inv-12.test.ts` lehnt `.passthrough()` und `looseObject` im Ingest ab.

## Folgen

- Ein neues Feld bei iShares bricht keinen Lauf; ein fehlendes oder anders getyptes gelesenes
  Feld schon.
- Fremde Felder erreichen den Rechenkern nicht. `raw_snapshot` speichert weiterhin die
  vollständige Rohantwort, aber erst nach bestandener Prüfung.

## Nachtrag: Gewichtssumme

Ohne `.strict()` fällt ein Einheitenwechsel eines Anbieters (Prozent statt Anteil oder
umgekehrt) durch jede Typprüfung, und `core/lookthrough.ts` normiert nicht. Deshalb prüfen alle
drei Anbieter über `pruefeGewichtsSumme` (`ingest/anbieter.ts`): Liegt die Summe der Gewichte
außerhalb von 0,5–1,5, gilt der Abruf als `SchemaFehler` und nichts wird übernommen (Hinweis
`fondsNichtAbrufbar`). Zwischen 0,5 und 1,5, aber mehr als 5 Prozentpunkte neben 100 %, wird
übernommen und `bestandteileSumme` gemeldet.
