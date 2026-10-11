# ADR-001: stream-json-Extraktion statt Dateiübergabe durch das Modell

> **Abgelöst durch [ADR-010](ADR-010-direkte-mcp-anmeldung-ohne-claude-code.md).** Der Ingest
> ruft den MCP seither direkt per OAuth/PKCE auf, ohne Claude-Code-Kindprozess und ohne
> stream-json. Übrig bleibt hier nur, warum die ursprüngliche Lösung so aussah.

Der Scalable-MCP war anfangs nur über eine Claude-Code-Sitzung erreichbar; ein Sprachmodell saß
also zwischen Werkzeugaufruf und Anwendung. Ein Modell transkribiert Hunderte Transaktionen
nicht zeichengetreu — es kürzt, rundet und lässt Zeilen still fallen, für eine Anwendung um
korrekte Geldbeträge [INV-02] kein akzeptables Risiko. Deshalb las der Ingest die Nutzdaten
unverändert aus dem `tool_result`-Block des stream-json-Ereignisstroms, und das Modell hatte
kein schreibendes Werkzeug. Dieser Grundsatz — Rohantwort des Servers, nie eine Nacherzählung —
gilt in ADR-010 weiter.
