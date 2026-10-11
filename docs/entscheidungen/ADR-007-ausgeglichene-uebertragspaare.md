# ADR-007: Ausgeglichene Übertragspaare als Nicht-Vorgang

## Kontext

Ein depotinterner Wechsel — etwa eine Broker-Migration — kann in der Transaktionsliste als
ein exakt gegenlaufendes Paar erscheinen: ein `TRANSFER_OUT` und ein `TRANSFER_IN` derselben
ISIN, mit exakt entgegengesetzter Menge. Derselbe Bestand verlässt das Depot und kommt
unverändert zurück; es ist weder ein Marktvorgang noch ein Kapitalfluss.

Ohne besondere Behandlung liest der Rechenkern dieses Paar wie zwei echte Transaktionen: die
FIFO-Logik verbucht den `TRANSFER_OUT` als Verkauf und realisiert einen Gewinn oder Verlust,
der nie stattgefunden hat, der `TRANSFER_IN` setzt den Einstand der Position auf den
Übertragskurs zurück, und Mengen- wie Depotreihe zeigen für diesen Tag einen Bestandssprung,
der real nie existierte. Bei einer einzigen Migration bleibt der Effekt sichtbar, aber jede
spätere Kennzahl — Einstand, realisierter Gewinn, XIRR — trägt diesen Fehler ab dem
Übertragstag weiter.

## Entscheidung

`core/uebertraege.ts` (`ausgeglicheneUebertraege`) sucht zu jedem `TRANSFER_OUT` ein
`TRANSFER_IN` derselben ISIN mit exakt entgegengesetzter `mengeE8` und gibt die IDs beider
Seiten aller gefundenen Paare zurück. Ein Treffer wird sofort aus der Kandidatenliste entfernt,
damit zwei zufällig gleich große Übertragungen nicht denselben Partner doppelt binden. Jede
Funktion, die Transaktionen zu einer Zeitreihe oder einem Cashflow verarbeitet, übergeht beide
Buchungen eines erkannten Paares vollständig: `core/fifo.ts` (Einstand und realisierter
Gewinn), `core/mengenreihe.ts` (Bestandsreihe), `core/depotreihe.ts` (Cash-Bewegung je Tag und
damit auch der Eingabe-Hash für die inkrementelle Neuberechnung) und `server/lesemodell.ts`.

Ein unpaariger `TRANSFER_OUT`/`TRANSFER_IN` — ein echter Wechsel zu einer anderen Bank, oder
eine Übertragung ohne erkennbares Gegenstück — bleibt unberührt und zählt wie jede andere
Transaktion als externer Fluss beziehungsweise als Kauf/Verkauf zum Übertragswert. Die
Erkennung ist an keine bestimmte ISIN oder Bank gebunden; sie greift bei jedem Depot, in dem
dieses Muster auftritt.

## Folgen

- Eine Broker-Migration mit exakt gegenlaufenden Buchungen erzeugt keinen künstlichen
  Gewinn/Verlust, keinen künstlichen Bestandssprung und keinen künstlichen Cashflow.
- Die Erkennung prüft ausschließlich ISIN und Menge, kein Datum und keine Bank-eigene
  Kennung — sie funktioniert deshalb auch für ein Paar, das nicht am selben Tag gebucht ist,
  verlangt aber eine exakte Mengengleichheit; eine teilweise übertragene Position wird nicht
  erkannt und zählt regulär.
- Ein `TRANSFER_OUT` ohne passenden `TRANSFER_IN` (oder umgekehrt) bleibt bewusst ein echter
  Vorgang — der Rechenkern hat keine andere Möglichkeit, dessen Herkunft zu beurteilen, und
  eine falsche Vermutung wäre schlechter als die bisherige Behandlung.
