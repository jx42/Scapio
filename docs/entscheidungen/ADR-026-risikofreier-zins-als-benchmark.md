# ADR-026: Der risikofreie Zins als zehnter Eintrag in der Benchmarkwahl

## Kontext

[ADR-020](ADR-020-benchmark-vergleich-etf-nav-und-echte-fluesse.md) legt fest, dass jeder
Eintrag in `BENCHMARKS` ein Euro-Börsenkurs eines ETF ist, aus derselben Kurshistorie wie
gehaltene Positionen. Kachel 3 zeigt daneben, unabhängig von Kachel 1, die Sharpe-Ratio auf
Basis derselben €STR-Reihe, die `ingest/quellen/zins.ts` von der EZB holt
([ADR-009](ADR-009-risikokennzahlen.md)). Beide Zahlen beantworten verwandte, aber
verschiedene Fragen — Sharpe: „Rendite pro Risiko, mit dem risikofreien Zins als
Nullpunkt", Verlauf-Vergleich: „Was wäre aus denselben Ein- und Auszahlungen geworden,
wären sie anderswohin geflossen". Diese ADR ergänzt die Benchmarkwahl in Kachel 1 um genau
diesen risikofreien Zins als zehnte Vergleichslinie — dieselbe Zinsreihe, jetzt auch als
„Was, wenn stattdessen risikofrei angelegt?".

## Entscheidung

**Ein Sonderfall neben `BENCHMARKS`, keine zehnte ISIN darin.** `shared/benchmarks.ts` exportiert
zusätzlich `RISIKOFREI` (Kennung `RISIKOFREI_ISIN`, kein gültiges ISIN-Muster) statt einen
zehnten Eintrag in `BENCHMARKS` selbst. Der Grund ist mechanisch: `ingest/ernte.ts` iteriert
über `BENCHMARKS`, um für jeden Eintrag `holeKurse()` — also eine echte ISIN-Kursabfrage
über den MCP — aufzurufen. Der risikofreie Zins hat keine ISIN und keine Kurshistorie; er
würde diese Abfrage entweder scheitern lassen oder bräuchte eine Ausnahme mitten im
ISIN-Kurslauf. Ein getrennter Export hält den Ingest unverändert und macht den Sonderfall an
der Definition sichtbar, nicht als Bedingung im Kurslauf.

**Der Vergleichskurs ist ein synthetischer, täglich verzinster Index, kein Marktkurs.**
`core/benchmark.ts` bekommt `risikofreiesRaster()`: startet bei 1,000000 am ersten Tag mit
einem €STR-Wert und verzinst jeden Folgetag mit dem zuletzt bekannten Satz auf 365 Tage.
Das Ergebnis hat dieselbe `Rasterwert`-Form wie ein echtes Kursraster und läuft deshalb
unverändert durch `baueBenchmarkreihe()` — dieselbe Simulation aus echten Flüssen wie bei
jedem ETF-Benchmark (Entscheidung 2 aus ADR-020), nur mit einer gerechneten statt einer
gehandelten Linie. Keine neue Prozentrechnung, keine zweite Vergleichs-Formel.

**Lücken vor Wochenenden schließen, Lücken vor dem ersten €STR-Tag nicht.** Ein Tag ohne
eigenen €STR-Wert (Wochenende, Feiertag) führt den zuletzt bekannten Satz fort — anders als
bei einem Börsenkurs gibt es keinen Nichthandelstag, für den ein Fortschreiben unehrlich
wäre. Vor dem ersten veröffentlichten €STR-Tag (2019-10-01) oder bei `zinsquelle: 'keine'`
bleibt der Tag dagegen ohne Eintrag: `baueBenchmarkreihe()` hält das Cash dann unverändert
und markiert den Tag als lückenhaft, genau wie bei fehlender ETF-Kurshistorie — kein neuer
Fehlerpfad, derselbe, den es für echte Benchmarks schon gibt.

**Nur im Rendite-Tab wählbar, rechts „€STR“ als Quellenlink statt einer ISIN.** Als Depotwert-Linie
(Vermögen-Tab) wäre eine mit ~4 % p.a. verzinste Kurve neben einem tatsächlichen Depotverlauf
kaum von einer Geraden zu unterscheiden — die Sharpe-Ratio beantwortet genau deshalb schon
die "risikofrei"-Frage über eine Prozentzahl, nicht über einen Chart. `Benchmarkwahl`
bekommt daher `zeigeRisikofrei` (an `modus === 'rendite'` gebunden) und blendet den Eintrag
im Vermögen-Tab aus `VerlaufKachel.tsx` aus; eine dort gespeicherte Auswahl wird beim
Tabwechsel zurückgesetzt, und die abgeleitete `benchmark`-Variable fängt denselben Fall
zusätzlich beim Laden ab, falls im localStorage noch eine alte Auswahl aus einem früheren
Stand liegt. Der Eintrag zeigt rechts nicht die ISIN (es gibt keine), sondern „€STR“, verlinkt auf
dieselbe feste Adresse wie „EZB (Zins)“ im Footer (ADR-021).

## Folgen

- `KERN_VERSION` steigt (INV-10): `risikofreiesRaster()` liegt in `core/`.
- Die Oberfläche zeigt für diesen Eintrag keinen onvista-Link, sondern den zur EZB — nicht
  durch eine Fallunterscheidung, sondern weil `RISIKOFREI_ISIN` bewusst nicht dem
  ISIN-Muster entspricht und `onvistaLink()` dafür `null` liefert (ADR-021).
- Läuft die Zinsquelle nicht (`zinsquelle: 'keine'`, EZB-Abruf schlägt fehl), bleibt der
  risikofreie Zins in der Benchmarkwahl wählbar, zeigt aber keine oder eine lückenhafte
  Linie — dieselbe Verschlechterung, die Sharpe-Ratio in diesem Fall schon zeigt
  (`SharpeErgebnis['art'] === 'kein_zins'`).
