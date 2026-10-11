# ADR-008: Kachel 5 zeigt Investition in Wertpapiere statt externer Ein-/Auszahlung

## Kontext

Kachel 5 zeigte bisher `core/depotreihe.ts`'s `externeFluesse` je Monat als zwei Balken:
Zufluss und Abfluss. Das ist exakt die Reihe, die auch XIRR, TWR und die Sparraten-Kennzahl
speist — echtes Kapital, das ins Depot hinein- oder aus ihm herausgeht, ohne die Kaufkraft
zu doppeln, die ein Sparplankauf nur innerhalb desselben Depots verschiebt (siehe die
Begruendung an `externeFluesse` selbst).

Fuer die Rendite ist das die richtige Zahl. Als Antwort auf die Frage "wie viel Geld
steckt inzwischen in ETFs" ist sie es nicht: eine Einmaleinzahlung aufs Verrechnungskonto
erschien als Balken, obwohl das Geld an diesem Tag noch gar kein Wertpapier gekauft hat,
waehrend ein Sparplankauf — die eigentliche Investition, um die es der Kachel laut ihrem
Namen geht — komplett unsichtbar blieb. Die Kachel beantwortete verlaesslich die falsche
Frage.

## Entscheidung

`core/depotreihe.ts` bekommt eine neue Funktion `investitionsFluesse`, das Gegenstueck zu
`externeFluesse`: sie zaehlt genau die Wertpapier-Transaktionen (Kauf, Verkauf, Sparplan),
die `externeFluesse` bewusst ausschliesst. Ein Kauf zaehlt positiv (Geld verlaesst die
Cash-Seite in Wertpapiere), ein Verkauf negativ — das Vorzeichen von `betragCent` wird
dafuer umgedreht. Gebuehr und Vorabpauschale (`FEE`, `TAX`) bleiben aussen vor, auch wenn
sie mit Wertpapierbezug gebucht sind, weil sie eine Kostenbuchung sind, keine Investition;
ein Depotuebertrag (`TRANSFER_IN`/`TRANSFER_OUT`) bleibt ebenfalls aussen vor, weil er zu
`externeFluesse` gehoert.

`server/lesemodell.ts` speist nur noch die eine Stelle, die Kachel 5 bedient (`fluesse`),
mit `investitionsFluesse` statt `externeFluesse`. `core/kennzahlen.ts` ruft `externeFluesse`
weiterhin unveraendert fuer XIRR, TWR und die Sparraten-Kennzahl auf — diese Rechnungen
duerfen sich durch diese Aenderung nicht verschieben, und sie tun es nicht, weil es ein
getrennter Aufruf mit eigener Eingabe ist. `core/fluesse.ts`'s `monatsFluesse` bleibt
unveraendert und generisch: sie aggregiert `Fluss[]` zu Monaten, unabhaengig davon, was die
aufrufende Stelle als Fluss zaehlt.

Die Oberflaeche zeigt statt zwei Balken (Zufluss, Abfluss) genau einen: die Nettoinvestition
des Monats, positiv bei Nettokauf, negativ bei Nettoverkauf. `server/routen/fluesse.ts`
bildet diese Differenz (`zu - ab`) und liefert ein Feld `nettoCent` statt der beiden
getrennten Felder.

## Folgen

- Kachel 5 zeigt jetzt, was sie im Titel verspricht: Investition in Wertpapiere, nicht
  Kontobewegung. Eine Einmaleinzahlung ohne folgenden Kauf erscheint dort nicht mehr; ein
  Sparplankauf erscheint dort zum ersten Mal.
- XIRR, TWR und die Sparraten-Kennzahl in der Kennzahlen-Kachel sind unveraendert, weil sie
  weiterhin ausschliesslich auf `externeFluesse` beruhen. Diese ADR aendert nicht, was als
  Kapitalfluss in die Rendite eingeht — nur, was Kachel 5 als Balken zeichnet.
- `investitionsFluesse` ist neuer, `core/`-interner Code: `KERN_VERSION` steigt entsprechend
  (INV-10), und die gesamte Historie wird beim naechsten Lauf neu aufgebaut. Das aendert an
  den gespeicherten Werten nichts, weil `investitionsFluesse` nicht in `baueDepotreihe`
  einfliesst — nur der Fingerabdruck des Ordners hat sich veraendert.
