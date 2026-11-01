# ADR-061: Einzelaktien im Durchblick

## Kontext

Der Durchblick zählte nur Fondsbestandteile. Wer NVIDIA direkt und über einen World-ETF hält,
sah NVIDIA nur mit dem ETF-Anteil, und die Abdeckung wies die Aktie als nicht durchschaut aus,
obwohl es bei ihr nichts zu durchschauen gibt.

## Entscheidung

- **Eine Position der Art `STOCK` zählt mit Gewicht 1 als ihr eigener Bestandteil.** In
  `ausFonds` steht sie unter ihrer eigenen ISIN; die Oberfläche nennt das „Direktanlage“.
- **Sie zählt zur Abdeckung** und geht in Länder und Sektoren ein. Sektor und Land kommen aus
  einer Fonds-Bestandsliste, die das Unternehmen führt; fehlt eine, landet sie unter „Übrige“.
- **Name der ersten Fundstelle gewinnt** wie bisher: steckt die Aktie auch in einem Fonds, bleibt
  dessen Schreibweise.
- **„mindestens“ vor der Anzahl**, wenn ein ETF oder Fonds im Depot keine Bestandsliste hat
  (`anzahlMindestens`). Dann stecken mehr Unternehmen im Depot, als gezählt. Krypto-ETPs ohne
  Liste lösen das nicht aus, weil sie keine Unternehmen halten.

## Verworfene Alternativen

- **Synthetische Bestandteile im Lesemodell** — dann stünde die Aktie in `ausFonds` wie ein Fonds,
  und die Herleitung läge außerhalb des Kerns.
- **Eigenes Feld `direkt` im Vertrag** — die gleiche ISIN trägt dieselbe Information.
