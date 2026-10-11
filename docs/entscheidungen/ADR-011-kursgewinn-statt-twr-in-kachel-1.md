# ADR-011: Verlaufs-Rendite zeigt Kursgewinn, nicht TWR

> **Heute gilt:** `gewinnCent` ist (Depotwert − eingezahltes Kapital) abzüglich desselben Werts am
> Fensterbeginn ([ADR-023](ADR-023-verlauf-zaehlt-ab-fensterbeginn.md)),
> `gewinnProzent = gewinnCent / nettoEinzahlungKum(Tag)`. Die Zahl heißt in der Oberfläche
> **Gesamtgewinn** ([ADR-016](ADR-016-gesamtgewinn-statt-kursgewinn-im-verlauf.md)), nicht
> Kursgewinn. Modul- und Funktionsnamen bleiben, wie dieser Text sie beschreibt; bestehen
> bleibt vor allem die Entscheidung gegen TWR in dieser Kachel.

## Kontext

Kachel 1 im Modus „Rendite" zeichnete bisher `core/twr.ts#fenster()` — den zeitgewichteten
Index, neu indexiert auf 100 zum Beginn des gewählten Zeitraums. TWR ist absichtlich
unempfindlich gegen Zeitpunkt und Größe von Einzahlungen (siehe [ADR-009](ADR-009-risikokennzahlen.md)):
zwei Depots mit derselben Wertentwicklung, aber unterschiedlichem Einzahlungstiming, ergeben
denselben Index. Genau das macht die Zahl für die tägliche Frage „wie viel habe ich
tatsächlich gewonnen" schwer lesbar — ein Depot kann TWR +8 % zeigen und trotzdem in Euro
kaum vorangekommen sein, wenn ein Großteil des Zuwachses vor einer großen Einzahlung lag.

Der Tooltip sollte ohnehin Depotwert und Kursgewinn in € und % zeigen, dieselbe Zahl, die
auch der Kopfwert der Kachel im Modus „Vermögen" nutzt (`gesamtCent - nettoEinzahlungKumCent`).
Zwei verschiedene Renditebegriffe nebeneinander — TWR im Chart, absoluter Kursgewinn im
Tooltip — hätten für denselben Tag zwei unterschiedliche Prozentzahlen ergeben, ohne dass ein
Nutzer den Unterschied ohne Weiteres erklären könnte.

## Entscheidung

Kachel 1 zeigt im Chart und im Tooltip durchgehend denselben, nicht zeitgewichteten
**Kursgewinn seit dem ersten Zufluss**: `gewinnCent = gesamtCent - nettoEinzahlungKumCent`,
`gewinnProzent = gewinnCent / nettoEinzahlungKumCent` (0, wenn noch nichts eingezahlt wurde).
Neues Modul `core/kursgewinn.ts#kursgewinnFenster()` ersetzt `core/twr.ts#fenster()`, das
ersatzlos entfällt — `TwrErgebnis.index` selbst bleibt unverändert und bedient weiterhin
Volatilität, Max. Drawdown und Sharpe-Ratio in `core/kennzahlen.ts`.

Der **Kopfwert** über dem Chart im Modus „Rendite" bleibt fensterbezogen und wechselt mit der
Zeitraumwahl, sonst würde er bei „1 Woche" denselben Wert zeigen wie bei „gesamte Historie".
Dafür führt `kursgewinnFenster()` eine zweite, vom Chart unabhängige Zahl:
`fensterGewinnProzent = fensterGewinnCent / nettoEinzahlungKumCent(Fensterende)`, mit
`fensterGewinnCent` als Differenz von (Depotwert minus Einzahlung) zwischen Fensterende und
-beginn — unverändert gegenüber der bisherigen Semantik von `fensterGewinnCent`, nur ohne den
TWR-Umweg. Der Nenner sitzt bewusst am Fensterende, nicht am -beginn: Am Fensterbeginn kann die
kumulierte Einzahlung beliebig klein sein — bei „gesamte Historie" ist der Fensterbeginn der
allererste Zufluss überhaupt, oft ein einzelner Sparplanbeitrag im niedrigen zweistelligen
Euro-Bereich. Der gesamte seither aufgelaufene Gewinn geteilt durch diesen einen ersten Beitrag
ergab Prozentzahlen im Millionenbereich — ein Rechenfehler, keine extreme, aber plausible
Rendite. Die kumulierte Einzahlung zu Fensterende (heute) ist dagegen so groß wie das gesamte
bisher investierte Kapital und ändert sich von einem Tag zum nächsten kaum; genau der Nenner, den
auch `gewinnProzent` je Tag verwendet.

## Folgen

- Chart, Tooltip und Kopfwert im Modus „Rendite" können bei großen Zuflüssen kurzzeitig fallen
  oder stagnieren, obwohl der Markt im selben Zeitraum gestiegen ist — die Kehrseite der TWR
  ist jetzt sichtbar statt herausgerechnet. Das ist der bewusst akzeptierte Tausch: lesbarer
  auf Kosten der Vergleichbarkeit über unterschiedliches Einzahlungstiming hinweg.
- Wer die zeitgewichtete Rendite sehen will, findet sie weiterhin in Kachel 3 (TWR, TWR p.a.)
  — Kachel 1 beantwortet ab jetzt ausschließlich „wie viel Gewinn in Euro/Prozent", Kachel 3
  „wie gut hat sich das Depot unabhängig vom Einzahlungstiming entwickelt".
