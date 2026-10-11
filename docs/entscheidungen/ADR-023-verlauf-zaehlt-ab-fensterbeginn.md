# ADR-023: Der Verlauf zählt ab Fensterbeginn, auch im Vergleich

## Kontext

[ADR-011](ADR-011-kursgewinn-statt-twr-in-kachel-1.md) ließ Chart und Tooltip den Gewinn
*seit dem ersten Zufluss* zeigen, die Kopfzeile dagegen den Gewinn *im gewählten Fenster*.
Bei jedem Zeitraum außer „gesamte Historie" zeigten Kopfzeile und Tooltip am letzten Tag
deshalb verschiedene Zahlen für dasselbe Depot. Mit dem Vergleichsdepot
([ADR-020](ADR-020-benchmark-vergleich-etf-nav-und-echte-fluesse.md)) und der Differenz in der
Kopfzeile wurde das zur Fehlerquelle: „Was wäre gewesen, wenn ich vor einem Jahr…" lässt sich
nicht mit einer Zahl beantworten, die vor zehn Jahren beginnt.

## Entscheidung

**Jede Gewinnzahl der Verlauf-Kachel zählt ab dem ersten Tag des gewählten Fensters.**
`kursgewinnFenster()` liefert `gewinnCent` je Tag als (Depotwert minus Einzahlung) abzüglich
desselben Werts am Fensterbeginn; dort ist der Gewinn 0. `gewinnProzent` bleibt
`gewinnCent / nettoEinzahlungKum(Tag)`. Der letzte Punkt ist damit gleich
`fensterGewinnCent` / `fensterGewinnProzent`, und Kopfzeile, Tooltip und Chart stimmen am
letzten Tag überein.

Das Vergleichsdepot wird weiter ab dem ersten Zufluss simuliert (ADR-020), aber wie das
Depot ab Fensterbeginn gezählt: `vergleichImFenster()` liefert dessen Gewinn im Fenster und
eine Vergleichslinie als Depotwert, die am Fensterbeginn beim Depotwert des echten Depots
beginnt (`Depotwert − Depotgewinn + Vergleichsgewinn`). Die Differenz ist Depotgewinn minus
Vergleichsgewinn, in Euro und Prozent auf derselben Einzahlung.

## Folgen

- Bewusste Näherung: Der Vergleichsgewinn ist der des Vergleichsdepots *in seiner eigenen
  Größe*. Hatte es am Fensterbeginn einen anderen Wert als das echte Depot, wird der
  Gewinn nicht auf den Depotwert hochgerechnet.
- Die Kurve der Rendite-Ansicht beginnt bei jedem Zeitraum außer MAX bei 0 %; die
  Vergleichslinie der Vermögen-Ansicht bei demselben Punkt wie das Depot.
- `Zeitpunkt.benchmarkGewinnCent` ist neu, `benchmarkCent` und `benchmarkProzent` haben den
  neuen Bezug.
- `Zeitpunkt.differenzCent` und `differenzProzent` kommen aus `vergleichImFenster`; die
  Oberfläche subtrahiert nicht selbst (nachgezogen mit `KERN_VERSION` 28).
- `KERN_VERSION` steigt auf 27 (INV-10); die Historie wird beim nächsten Lauf neu aufgebaut,
  ohne dass sich eine gespeicherte Zahl ändert.
