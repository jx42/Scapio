# ADR-004: Fixpunkt-Arithmetik in `bigint` statt Gleitkomma

## Kontext

Jede Geldsumme in dieser Anwendung durchläuft mehrere Additionen, Subtraktionen und
Verhältnisrechnungen (FIFO-Einstand, XIRR-Iteration, TWR-Verkettung über hunderte
Teilperioden). `IEEE-754`-Gleitkommazahlen (JavaScripts `number`) akkumulieren bei genau
solchen Ketten Rundungsfehler — `0.1 + 0.2 !== 0.3` ist das bekannteste Symptom, aber das
eigentliche Problem ist, dass der Fehler nicht konstant ist: er hängt von der Reihenfolge
und Größe der Operationen ab. Für eine Anwendung, deren zentrales Versprechen ist, dass
`npm run verify` dieselbe Zahl zweimal liefert, ist das nicht hinnehmbar — zwei
mathematisch äquivalente, aber unterschiedlich angeordnete Berechnungswege dürften niemals
unterschiedliche Centbeträge ergeben.

## Entscheidung

Geldbeträge sind ausnahmslos `bigint` in Cent [INV-02]. Mengen sind `bigint` × 1e8, Kurse
`bigint` × 1e6 (siehe [DATENMODELL.md](../DATENMODELL.md)) — feste Nachkommastellen als
Vielfaches eines Integers, keine Gleitkommazahl an irgendeiner Stelle der Kette von der
Datenbank bis zur Kennzahl. `parseFloat` auf einen Geldbetrag anzuwenden ist verboten und
wird von einem eigenen Invariantentest (`test/invarianten/inv-02.test.ts`) über einen
Lint-artigen Quellcode-Scan erzwungen, nicht nur durch Konvention.

Die beiden `REAL`-Spalten des Schemas (`etf_bestandteil.gewicht`, `vpi.index_wert`) sind die
bewusste Ausnahme: keine Geldbeträge, sondern ein Anteil zwischen 0 und 1 beziehungsweise
ein Indexstand, wo eine Gleitkomma-Ungenauigkeit die daraus folgende Kennzahl nicht
verfälscht.

## Folgen

- Jede Kernfunktion in `core/` rechnet exakt und deterministisch — dieselbe Eingabe liefert
  bit-identisch dieselbe Ausgabe, unabhängig von Rechenreihenfolge oder Plattform.
- XIRR (Newton-Verfahren) muss auf `bigint`-Basis eine Konvergenzschwelle in Cent statt in
  einem Gleitkomma-Epsilon definieren — eine bewusste Mehrarbeit gegenüber einer
  Bibliothekslösung, die mit `number` rechnen würde.
- Divisionen mit Rest müssen an jeder Stelle explizit entschieden werden (aufrunden,
  abrunden, Bankers Rounding) statt sich implizit aus der Gleitkomma-Darstellung zu ergeben
  — das macht Rundungsentscheidungen sichtbar und testbar statt zufällig.
