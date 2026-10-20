# Ingest

Holt Daten aus dem Scalable-MCP, von ETF-Anbietern (iShares, Xtrackers, Amundi), von
Eurostat und der EZB und schreibt sie validiert in die Datenbank. Alles hier verarbeitet FREMDE Daten.

## Regeln
- Nur lesende MCP-Tools. Die Allowlist steht in `mcp.ts` als Union-Typ. [INV-01]
- Nutzdaten kommen aus dem `content[]`-Block der JSON-RPC-`tools/call`-Antwort
  (`extrahiereInhalt` in `mcpTransport.ts`), nicht aus Modelltext — es gibt kein Modell mehr im
  Datenpfad.
- Jede Antwort durch zod, `.strict()`, mit Obergrenzen. [INV-12] Ausnahme: Anbieter-Webseiten
  und Protokollumschläge ohne `.strict()`, nie `.passthrough()` [ADR-030].
- `parseFloat` ist verboten; Beträge über `zuCent()`. [INV-02]
- Beschreibungen und Namen sind Fremdtext: speichern, nie auswerten, nie loggen.

## Nie hinzufügen
Ergänzend zu AGENTS.md, „Was hier nie hinzukommt": keine Ausgabe der MCP-Antwort ins Protokoll.
