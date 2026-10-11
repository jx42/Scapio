# ADR-032: Gesamtwert für die Summenprobe aus `get_portfolio_overview`

## Kontext

Die Summenprobe ([ADR-015](ADR-015-summenprobe-nur-bei-gleichem-stand.md)) holte den
Gesamtwert der Bank aus `get_portfolio_performance`, Gruppe `PRODUCT_TYPE`. Seit dem
23.09.2026 antwortet der MCP darauf mit `Tool get_portfolio_performance not found`; das
Tool fehlt auch in `tools/list`. Jeder Lauf endete dadurch `teilweise`, ohne dass eine
angezeigte Zahl betroffen war. Einen Nachfolger mit Allocation-Gewichten gibt es nicht.

## Entscheidung

- Die Quelle `performance` entfällt, an ihre Stelle tritt `gesamtwert` über
  `get_portfolio_overview`, das schon in der Allowlist stand. `valuation.total` ist
  Wertpapiere + Krypto + Kontostand (am echten Depot nachgeprüft), `valuationTimestampUtc`
  ist der Stand, für den er gilt — dieselbe Rolle wie zuvor `lastUpdatedAt`.
- `get_portfolio_performance` verlässt die Allowlist. Ein Tool, das es nicht gibt, bleibt
  nicht als toter Eintrag stehen.
- Zeile 3 der Prüfliste (Summe der Allocation-Gewichte = 1) entfällt ersatzlos, mit ihr der
  Hinweis `gewichteSumme`. Die Nummern der übrigen Zeilen bleiben.

## Folgen

- Die Summenprobe läuft wieder; ein Lauf ist wieder `erfolg`, wenn alles andere klappt.
- Alte `raw_snapshot`-Zeilen mit `quelle = 'performance'` bleiben liegen; nichts liest sie.
- Ein Lauf aus der Zeit davor kann noch `performance` in `quellen_json` tragen. Die
  Oberfläche zeigt nur den jüngsten Lauf und nennt eine unbekannte Quelle beim Schlüssel.
