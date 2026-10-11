# ADR-020: Benchmark-Vergleich mit ETF-Kurs statt Index, Vergleichsdepot aus echten Flüssen

> **Nachtrag.** Gezählt wird der Vergleich seit [ADR-023](ADR-023-verlauf-zaehlt-ab-fensterbeginn.md)
> ab Fensterbeginn; die Simulation ab dem ersten Fluss bleibt. Der risikofreie Zins als
> Vergleich ohne Kurs steht in [ADR-026](ADR-026-risikofreier-zins-als-benchmark.md).

## Kontext

Kachel 1 („Verlauf") zeigt seit dieser Änderung eine zweite, gestrichelte Linie: was aus
denselben externen Flüssen geworden wäre, wären sie am selben Tag statt ins echte Depot in
einen von neun festen Vergleichswerten (ETFs und ETCs) geflossen (`BENCHMARKS`, siehe `shared/benchmarks.ts`). Der
Rechenkern dafür (`core/benchmark.ts`, `baueBenchmarkreihe`) trifft zwei Entscheidungen, die
im Code nicht als solche erkennbar sind, weil er nur eine von mehreren plausiblen Antworten
umsetzt.

## Entscheidung 1: ETF-Börsenkurs statt Indexstand

Verglichen wird nicht mit dem MSCI-, S&P- oder STOXX-Indexstand, sondern mit dem
Euro-Börsenkurs des jeweiligen ETF oder ETC, wie ihn `get_security_chart` für dieselbe
ISIN liefert wie für die gehaltenen Positionen.

Zwei Gründe, beide für sich ausreichend:

- **Lizenz.** Echte Indexstände von MSCI, S&P und STOXX sind lizenzpflichtig; ein
  Endnutzer-Tool wie dieses hat dafür keinen Zugang und soll keinen brauchen.
- **Ehrlichkeit.** Der Fondskurs ist die ehrlichere Vergleichszahl. Er enthält TER und
  Tracking Error und ist damit das, was tatsächlich erreichbar gewesen wäre — ein
  Indexstand ist eine Zahl, die niemand ohne Kosten hätte halten können.

Die naheliegende Alternative — der ETF-**NAV** vom Anbieter — wurde geprüft und verworfen:
der NAV steht in der Fondswährung, und mehrere Benchmarks rechnen intern in US-Dollar.
Das Depot ist durchgehend in Euro geführt; einen Dollar-NAV ohne Umrechnung als Euro-Zahl zu
verbuchen ergäbe eine Linie, die still die Dollarrendite statt der Eurorendite zeigt —
plausibel aussehend, aber falsch. Der Börsenkurs über den MCP ist dagegen bereits der
Euro-Kurs, mit dem an Xetra/gettex tatsächlich gehandelt wird, und damit direkt vergleichbar
mit dem übrigen, ebenfalls in Euro geführten Depot.

## Entscheidung 2: Vergleichsdepot aus den echten Flüssen statt schlichter Indexrendite

`baueBenchmarkreihe` simuliert kein „Startkapital wächst mit der Indexrendite", sondern ein
zweites, fiktives Depot: jeder externe Zufluss des echten Depots kauft am selben Tag Anteile
des Benchmark-ETF zum jeweiligen Tageskurs, jeder Abfluss verkauft entsprechend. Das Ergebnis
ist eine `DepotTag[]`-Reihe in derselben Form wie die echte und läuft deshalb unverändert
durch das vorhandene `core/kursgewinn.ts` — keine eigene Prozentrechnung, keine zweite
Rendite-Formel, die von der echten abweichen könnte.

Die einfachere Alternative — eine einzelne Zahl "Indexrendite über den Betrachtungszeitraum"
auf das aktuelle eingezahlte Kapital anwenden — wurde verworfen: sie ignoriert, *wann* das Geld
tatsächlich floss. Ein Depot mit später, konzentrierter Einzahlung und ein Depot mit früher,
gleichmäßiger Einzahlung haben bei gleichem eingezahltem Kapital unterschiedliche
Benchmark-Ergebnisse, weil derselbe Euro zu unterschiedlichen Kursen eingestiegen wäre. Nur
eine Simulation mit den echten Flussdaten bildet das ab — und genau das ist die Frage, die
die Kachel beantworten soll: „Was, wenn *dieselben Einzahlungen zum selben Zeitpunkt*
anderswohin geflossen wären?", nicht „Was hätte der Index seit Tag X gemacht?".

Simuliert wird ab dem ersten externen Fluss, nicht erst ab dem Fensteranfang — sonst zeigte
ein kurzes Fenster ("1M") ein Vergleichsdepot ohne die davor aufgebaute Position, cropped auf
dieselbe Weise, wie auch die echte Linie im Fenster nicht bei null beginnt.

## Folgen

- Ein neuer Vergleichs-ETF in `BENCHMARKS` bringt automatisch die richtige Euro-Zahl mit,
  ohne dass irgendwo eine Währung eingetragen werden muss — vorausgesetzt, er wird wie die
  bestehenden an einer deutschen Börse gehandelt.
- Bedient `get_security_chart` fremde ISINs einmal nicht mehr, ist ein NAV-Abruf kein
  Eins-zu-eins-Ersatz, sondern eine neue Entscheidung mit eigener Währungsumrechnung.
- Benchmark-ETFs bekommen dieselben vier Kursfenster wie gehaltene Positionen, damit die
  Vergleichslinie im letzten Jahr täglich ist. Sie zunächst nur mit `max` und `one_month` zu
  holen ergab ein Monatsraster bis kurz vor dem letzten Monat mit einer Lücke dazwischen.
  Älter als ein Jahr liefert das MCP nur Monatsenden; das bleibt so.
