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
| `ishares-suche.json` | www.ishares.com (Produktsuche) | — |
| `ishares-suche-leer.json` | | — (fremde ISIN, `totalResults: 0`) |
| `ishares-kopf.json` | www.ishares.com (Fondskopf, `fundHeader`) | — |
| `kaputt/ishares-suche-portfolioid.json` | | `portfolioId` als Zahl statt als Text |
| `invesco-shareclass.json` | `dng-api.invesco.com` (Shareclass, Suche) | — |
| `invesco.json` | `dng-api.invesco.com` (Holdings) | — |
| `kaputt/invesco-gewicht-text.json` | | ein `weight` als Text (`"20.25"`) |
| `jpmorgan-katalog.json` | am.jpmorgan.com (Fund Explorer) | — |
| `jpmorgan.json` | am.jpmorgan.com (`product-data`) | — |
| `kaputt/jpmorgan.json` | | `marketValuePercent: "30.0"` (Text statt Zahl) |
| `goldmansachs-sitemap.xml` | am.gs.com (Sitemap) | — (Insights- und Nicht-ETF-Fondsadressen dabei) |
| `goldmansachs.json` | am.gs.com | — (Gewichte auf ~100 % gesetzt) |
| `kaputt/goldmansachs-gewicht-text.json` | | `portfolio: "n. v."` |
| `franklin-sitemap.xml` | www.franklintempleton.de (Sitemap) | — (zwei Nicht-ETF-Fonds, ein Geldmarktfonds ohne ISIN, drei ETFs, davon zwei mit derselben fundid) |
| `franklin.json` | www.franklintempleton.de (GraphQL `dailyholdings`) | — (Gewichte auf Summe 96 % gesetzt, TSMC doppelt, zwei Zeilen mit `—` statt ISIN) |
| `kaputt/franklin.json` | | `pctofnetassets` mit Dezimalpunkt `"18.40"` statt Komma |
| `eurostat.json` | ec.europa.eu | — |
| `kaputt/eurostat-zwei-laender.json` | | `geo` mit zwei Ausprägungen |
