# ADR-016: Die Zahl über dem Verlauf heißt Gesamtgewinn, nicht Kursgewinn

> **Nachtrag (November 2026).** Der Vergleich steht nicht mehr als zwei beschriftete Zahlen
> (Benchmark, Differenz), sondern als ein Satz „+X € (+Y %) mehr als …“ mit eigenem
> Infoknopf; der Gewinn des Vergleichsdepots steht in dessen Erklärung. Gesamtgewinn
> behält Beschriftung und Infoknopf.

## Kontext

Auf derselben Seite standen zwei verschiedene Zahlen unter demselben Namen. Beobachtung im
September 2026:

| Stelle | Zahl | Formel |
|---|---|---|
| Karte „Kursgewinn" über dem Verlauf, Zeile „Kursgewinn" in Kachel 3 | fünfstelliger Betrag | `wertpapiere - investiert` (`core/kennzahlen.ts`) |
| Kopfzahl und Hover-Tooltip der Verlauf-Kachel | rund 0,2 % darunter | `gesamtCent - nettoEinzahlungKumCent` (`core/kursgewinn.ts`) |

Beide Rechnungen sind richtig, sie beantworten nur verschiedene Fragen:

- **Kursgewinn** stellt die heute gehaltenen Wertpapiere ihrem FIFO-Einstand gegenüber.
  Cash, realisierte Gewinne, Erträge, Steuern und Gebühren bleiben außen vor — es ist der
  reine Buchgewinn auf dem Bestand.
- Die Zahl der Verlauf-Kachel stellt den **ganzen** Depotwert inklusive Verrechnungskonto
  allem gegenüber, was je netto eingezahlt wurde. Sie enthält genau die Posten, die der
  Kursgewinn weglässt.

Die Differenz ist deshalb keine Ungenauigkeit, sondern exakt deren Saldo. Nachgerechnet am
Tag der Beobachtung: Steuern, Erstattungen, Zinsen, Ausschüttungen und Gebühren ergaben
saldiert bis auf wenige Cent Rundung im FIFO-Einstand genau den Abstand der beiden Zahlen.

Sichtbar war davon nichts. Der Hover-Tooltip im Chart beschriftete seine Zeile mit
`de.kennzahlen.kursgewinn` — demselben Wort wie die Karte darüber —, und die Kopfzahl trug
überhaupt keine Beschriftung: eine grüne Zahl neben dem Depotwert, die man als „der Gewinn"
liest. Wer beide Zahlen nebeneinander sah, musste annehmen, dass eine von beiden falsch ist.

## Entscheidung

**Die Zahl der Verlauf-Kachel bekommt einen eigenen Namen: „Gesamtgewinn".** Sie behält ihre
Formel, ihren Platz und ihre Rolle aus [ADR-011](ADR-011-kursgewinn-statt-twr-in-kachel-1.md)
unverändert; es ändert sich, wie sie heißt und was an ihr steht.

- Chart-Tooltip, Serienname im Rendite-Chart, verborgene Tabelle und Chart-Beschriftung
  sagen „Gesamtgewinn" statt „Kursgewinn".
- **Jede Gewinnzahl in der Kopfzeile trägt eine Beschriftung und ein Info-Zeichen mit
  Erklärung** — im Vermögen-Modus „Gesamtgewinn Depot", in der Rendite-Ansicht kurz „Depot" und wie im Tooltip mit Prozent vor dem Betrag; der Zeitraum steht nie im Namen — die Zahl ist die
  Differenz über das gewählte Fenster und nicht der Stand von heute, der Zeitraum steht in der
  Zeitraumwahl daneben. Ist ein Vergleich gewählt, steht seine Zahl (dieselben Flüsse, gleiche
  Fensterrechnung) mit dem Namen des Vergleichs rechts daneben, danach die Differenz (Depot minus Vergleich). Alle drei Zahlen stehen in einem Badge. Der große Depotwert daneben wird gleich mit beschriftet.
- Beide Erklärtexte nennen den Unterschied zum Kursgewinn beim Namen, und der Erklärtext des
  Kursgewinns nennt den Unterschied zum Gesamtgewinn. Wer auf einer der beiden Zahlen landet,
  findet von dort zur anderen.

„Gesamtgewinn" steht damit im Glossar neben „Kursgewinn" als eigener Begriff.

## Verworfene Alternativen

- **Die Formeln angleichen** — `gewinnVon()` auf `gesamtCent - cashCent - einstand`
  umstellen, damit beide Stellen dieselbe Zahl zeigen. Das bräuchte den FIFO-Einstand je Tag
  in `depot_tag`, den die Tabelle nicht führt: Migration, `KERN_VERSION`-Erhöhung, komplette
  Neuberechnung. Vor allem aber verlöre die Kachel ihre tragende Eigenschaft — der Abstand
  zwischen den beiden gezeichneten Linien IST der Gewinn. Zöge man Cash aus der einen Linie
  heraus, stimmte der Abstand nicht mehr mit der Kopfzahl überein, und die Kachel hätte
  denselben Widerspruch an einer neuen Stelle.
- **Die Kopfzahl auf den Kursgewinn umstellen** und den Chart lassen, wie er ist. Dann
  widerspräche die Kopfzahl der Kurve direkt darunter.
- **Nur den Tooltip umbenennen**, die Kopfzahl unbeschriftet lassen. Die unbeschriftete Zahl
  ist die, die der Leser zuerst sieht und mit der Karte darüber vergleicht — genau die Stelle,
  an der die Verwechslung entsteht.

## Folgen

- Rein sprachlich: keine Formel, kein API-Feld, kein gespeicherter Wert ändert sich, und
  `core/` wird nicht angefasst — die `KERN_VERSION` bleibt stehen, die Historie wird nicht
  neu gerechnet.
- `core/kursgewinn.ts` und `kursgewinnFenster()` behalten ihre Namen. Eine Umbenennung dort
  wäre reine Kosmetik, würde aber über INV-10 eine Kernversion und eine vollständige
  Neuberechnung auslösen und den Text von ADR-011 unlesbar machen. Der Kopf des Moduls nennt
  die Formel ausdrücklich; wie die Zahl in der Oberfläche heißt, steht hier.
- Die Kopfzeile der Kachel trägt zwei Zeilen Text mehr. Das ist der Preis dafür, dass zwei
  Zahlen, die auseinanderlaufen dürfen, auch auseinandergehalten werden können.
