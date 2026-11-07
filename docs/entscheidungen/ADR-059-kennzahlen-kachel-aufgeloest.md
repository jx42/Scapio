# ADR-059: Kennzahlen-Kachel aufgelöst

## Kontext

Kachel 3 „Kennzahlen“ listete 16 Zeilen, davon fünf (Kursgewinn, Marktrendite p.a., Realrendite,
Max. Drawdown, Sharpe) doppelt zu den Karten über dem Verlauf. Realisierte Gewinne, Erträge, Steuern
und Gebühren beantworten dieselbe Frage wie die Sankey-Kachel „Gewinne & Abzüge“. Um ohne
Scrollbalken neben der Aufteilung zu stehen, brauchte die Kachel „Mehr zeigen“ und eine gegenseitige
Höhenbindung mit der Aufteilung in `App.tsx`.

## Entscheidung

- **Jede Zahl steht an einem Ort.** Die übrigen Zeilen ziehen dorthin, wo ihre Frage beantwortet wird:
  - Investiertes Kapital → Unterzeile der Karte Depotwert (der Stand steht schon im Seitenkopf).
  - Ø Inflation → zweite Zeile der Karte Realrendite, IZF und Inflation im Popover.
  - Volatilität → zweite Zeile der Karte Max. Drawdown.
  - Realisierte Gewinne → Kopfzeile der Sankey-Kachel neben Brutto, mit Buchungsliste
    (`KennzahlDetailsDialog`).
  - Erträge, Steuern, Gebühren → die Knoten im Sankey selbst. Ein Klick auf Knoten oder Band öffnet
    die Buchungsliste; bei einer Position ihre realisierten Verkäufe.
  - Hinweise der Kennzahlen → `HinweisKnopf` im Kopf der Verlaufskachel.
- **Kein Fuß mit vier Summen.** Er wiederholte, was im Diagramm steht. Leere Töpfe fehlen im
  Diagramm; „0 € Steuern“ ist damit keine sichtbare Antwort mehr.
- **Höhenbindung und „Mehr zeigen“ entfallen.** Die Aufteilung steht in voller Breite; es bleiben
  fünf Kacheln (seit [ADR-060](ADR-060-aufteilung-mit-reitern.md) mit dem Look-Through als Reiter Analyse).
- [ADR-016](ADR-016-gesamtgewinn-statt-kursgewinn-im-verlauf.md) gilt weiter: Kursgewinn (Karte) und
  Gesamtgewinn (Verlaufskopf, Sankey) bleiben getrennte Begriffe mit Erklärtext, der den anderen nennt.
- Die Route `/api/kennzahlen` und `src/features/kennzahlen/` (Dialog, Hinweise) bleiben; nur die
  Kachel fehlt.

## Verworfene Alternativen

- **Kachel gruppieren** (Rendite, Risiko, Geld) — kürzer, aber die Dubletten blieben.
- **Aufteilung neben die Sankey-Kachel** — das Diagramm braucht die Breite.

## Folgen

- Volatilität und Inflation sind nicht mehr auf einen Blick, sondern als zweite Kartenzeile sichtbar.
- Der Klick im Sankey ist nur für Zeiger: In `role="img"` liegt nichts Bedienbares ([ChartRahmen](../../src/components/ChartRahmen.tsx)).
  Per Tastatur erreichbar bleibt nur die Liste der realisierten Gewinne; Erträge, Steuern und Gebühren
  stehen als Beträge in der Tabellenalternative.
- Der Nachtrag in [ADR-053](ADR-053-stichtag-und-isin-wechsel-im-kern.md) zu „Hinweise in der Kachel“ meint
  jetzt den Kopf der Verlaufskachel.
