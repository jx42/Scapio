# ADR-031: Wiederholung und laufweiter Kurzschluss am MCP

## Kontext

Ein Lauf ruft den Scalable-MCP je nach Depot mehrere Dutzend Mal auf: Bestand, Cash,
Transaktionen, vier Kursfenster je ISIN, Sparpläne, Performance, Wertpapierart. Bisher wurde
jeder gescheiterte Aufruf sofort und ohne Pause einmal wiederholt, und jeder Aufruf entschied
für sich. Ein abgelaufener Token ergab so dutzende 401 in Folge, ein drosselnder Server
(`429`) bekam die Wiederholung im selben Moment, und ein hängender MCP kostete je Aufruf
zweimal das volle Zeitlimit.

## Entscheidung

- **Wiederholung:** höchstens ein zweiter Versuch, eine Sekunde nach dem ersten. Ohne
  Wiederholung bleiben `E_MCP_ANMELDUNG`, `E_MCP_SEITEN` und `E_MCP_RPC`, weil ein zweiter
  Versuch daran nichts ändert.
- **Drosselung:** `429` und `503` ergeben `E_MCP_DROSSEL`. Verlangt `Retry-After`
  (Sekunden oder HTTP-Datum) höchstens 30 Sekunden, wartet der Ingest so lange. Verlangt es
  mehr, wird sofort aufgegeben.
- **Laufweiter Kurzschluss** (`McpSicherung`, eine je Lauf): Nach `E_MCP_ANMELDUNG` oder
  `E_MCP_DROSSEL`, oder nach zwei `E_MCP_ZEIT` in Folge, erreicht kein weiterer Aufruf dieses
  Laufs den MCP. Die übrigen Quellen scheitern sofort mit demselben Code. `transaktionen`
  bricht den Lauf wie bisher ab, alle anderen Quellen führen zu `teilweise`.
- **Sitzung vergessen:** Nach `E_MCP_ANMELDUNG` und nach einer erfolgreichen Anmeldung wird
  die MCP-Sitzung (Session-Id, Initialisierung) verworfen. Eine Sitzung, die unter einem
  anderen Token begonnen wurde, wird nicht weiterbenutzt.
- Kursabrufe laufen mit höchstens vier gleichzeitigen Aufrufen. Übernommen werden sie in
  fester Reihenfolge.

## Folgen

- Ein abgelaufener Token kostet einen Aufruf, nicht dreißig. Bei parallelen Kursabrufen
  sind es höchstens vier.
- Der Lauf trägt `E_MCP_ANMELDUNG` oder `E_MCP_DROSSEL` als `fehler_code`, auch wenn er nur
  `teilweise` ist. So kann die Oberfläche auf den Anlass reagieren.
- Ein langsamer, aber antwortender MCP bricht den Lauf nicht ab, solange zwischen zwei
  Zeitüberschreitungen ein Erfolg liegt.

## Nachtrag: Zeitüberschreitungen im ganzen Lauf

Bei vier parallelen Kursabrufen setzt der Erfolg eines anderen Aufrufs die Folge zurück. Ein
MCP, der nur einen Teil der Aufrufe hängen lässt, kam so nie auf zwei in Folge, und der Lauf
hielt die Sperre für jedes betroffene Kursfenster zweimal das volle Zeitlimit. Deshalb zählt
`McpSicherung` zusätzlich alle `E_MCP_ZEIT` des Laufs: Nach fünf
(`ZEITFEHLER_IM_LAUF_BIS_ABBRUCH`) löst der Kurzschluss auch ohne Folge aus. Die Aussage unter „Folgen“,
ein langsamer MCP breche nicht ab, solange zwischen zwei Zeitüberschreitungen ein Erfolg
liegt, gilt damit nur bis zur fünften.
