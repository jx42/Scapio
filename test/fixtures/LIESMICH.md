# Fixtures

Die Broker- und MCP-Fixtures sind vollständig **synthetisch**: Kennungen, Instrumente,
Zeitpunkte, Mengen, Kurse und Beträge sind frei erfunden. Sie sind weder anonymisierte noch
skalierte Auszüge eines echten Depots und dürfen nicht durch echte Antworten ersetzt werden.

Die iShares- und Eurostat-Fixtures bilden dagegen öffentliche Fremdschnittstellen ab; sie
enthalten keine Portfoliodaten.

**Diese Dateien werden nie angepasst, damit ein Test grün wird.** Wenn ein Test gegen ein
Fixture fehlschlägt, hat sich der Code geändert, und entweder war die Änderung falsch oder
das Schema hat sich wirklich verschoben. Im zweiten Fall kommt ein *neues* Fixture dazu;
das alte bleibt liegen, damit sichtbar bleibt, was die Schnittstelle einmal geliefert hat.

Je Quelle liegt in `kaputt/` eine absichtlich beschädigte Variante. Jede ist auf genau eine
Art kaputt, und die Art steht im Dateinamen — ein Fixture mit drei Fehlern beweist nichts,
weil man nicht sieht, welcher davon den Test rot gemacht hat.

| Datei | Quelle | Was daran kaputt ist |
|---|---|---|
| `holdings.json` | `get_portfolio_holdings` | — |
| `kaputt/holdings-isin.json` | | ISIN mit elf Zeichen |
| `kaputt/holdings-feld.json` | | unbekanntes Feld `marketValue` (`.strict()`) |
| `transaktionen.json` | `list_portfolio_transactions` | — |
| `kaputt/transaktionen-ohne-zeit.json` | | Zeile ohne `timestamp` und ohne `executedAt` |
| `kaputt/transaktionen-betrag.json` | | `amount: "zwölf Euro"` |
| `chart-max.json`, `chart-1m.json` | `get_security_chart` | — |
| `kaputt/chart-punkt.json` | | Punkt ohne jede Kursangabe |
| `sparplaene.json` | `list_savings_plans` | — |
| `kaputt/sparplaene-frequenz.json` | | weder `interval` noch `frequency` |
| `overview.json` | `get_portfolio_overview` | — |
| `kaputt/overview-feld.json` | | unbekanntes Feld `valuation.cash` (`.strict()`) |
| `ishares.json` | www.ishares.com | — |
| `kaputt/ishares-schema.json` | | Gewichtsspalte kürzer als die ISIN-Spalte |
| `kaputt/ishares-anteile.json` | | Gewichte als Anteil statt in Prozent (Summe 0,96 %) |
| `kaputt/amundi-prozent.json` | `www.amundietf.de` | Gewichte in Prozent statt als Anteil (Summe 9600 %) |
| `eurostat.json` | ec.europa.eu | — |
| `kaputt/eurostat-zwei-laender.json` | | `geo` mit zwei Ausprägungen |
| `strom.ndjson` | `claude -p --output-format stream-json` | — |
| `kaputt/strom-fremdes-tool.ndjson` | | `tool_result` eines anderen Tools |
