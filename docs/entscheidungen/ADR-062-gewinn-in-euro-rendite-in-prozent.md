# ADR-062: Gewinn heißt Euro, Rendite heißt Prozent

## Kontext

Dieselbe Zahl, Depotwert minus eingezahltes Kapital, hieß über dem Verlauf „Gesamtgewinn“ und
in der Kachel Gewinne & Abzüge „Nettogewinn“. Eine Prozentspalte hieß „Gesamtgewinn“, die
Jahrestabelle „Rendite (TWR)“ statt „Marktrendite (TWR)“, und „Brutto“ stand ohne Bezugswort.
Die Realrendite der Jahrestabelle beruhte auf der TWR, die gleichnamige Karte auf dem IZF.

## Entscheidung

- **Gewinn ist ein Euro-Betrag, Rendite eine Verzinsung in Prozent p.a.** Drei Gewinne:
  Kursgewinn → Vor Abzügen → Gesamtgewinn. Drei Renditen: Marktrendite (TWR) → Interner
  Zinsfuß (IZF) → Realrendite.
- **Ein Name je Zahl.** „Nettogewinn“/„Nettoverlust“ werden „Gesamtgewinn“/„Gesamtverlust“,
  „Brutto“ wird „Vor Abzügen“, die Prozentspalte „Gesamtgewinn in %“, die Jahresspalte
  „Marktrendite (TWR)“.
- **Interner Zinsfuß (IZF) bleibt** der Name der geldgewichteten Rendite, wie in Portfolio
  Performance und deutschen Finanzlehrbüchern.
- **Karten über dem Verlauf: Beschriftung und Unterzeile je eine Zeile.** Deshalb bleiben dort
  die Kurzformen „Marktrendite p.a.“, „Realrendite p.a.“ und „IZF: … – Inflat.: …“; die
  Langformen stehen im Popover.
- **Realrendite rechnet überall über den IZF.** Die Jahrestabelle bekommt eine Spalte „Interner Zinsfuß“
  und rechnet die Realrendite wie die Karte: IZF über Flüsse in Kaufkraft des letzten Monats
  der Zeile, statt Fisher auf die TWR. Je Jahr zählt der Depotwert am Vorjahresende als
  Einzahlung; IZF und Realrendite gelten wie die TWR für den Zeitraum der Zeile, nicht p.a.
- **Code-Namen bleiben** (`nettoCent`, `brutto`, `xirr`): eine Umbenennung im Vertrag änderte
  nichts für den Leser der Oberfläche.

## Verworfene Alternativen

- **„Persönliche Rendite“ statt IZF** — verständlicher, aber in keinem Kontoauszug und keiner
  Steuerunterlage so genannt; der Erklärtext sagt bereits, dass das Timing zählt.
- **„Nettogewinn“ überall** — legt nahe, die Kursgewinne seien schon versteuert. Sie sind es nicht.

## Nachtrag: Gesamtgewinn der Sankey gleich dem Verlauf

`nettoCent` war die Summe der Töpfe und lief am Gesamtgewinn vorbei, sobald eine Buchung in
keinen Topf fiel: unbekannter Cash-Typ, Wertpapierbuchung ohne Menge, Überverkauf. Jetzt
rechnet `berechneKennzahlen` den Rest `gesamt − netto − Σ Töpfe` aus und zeigt ihn als Topf
„Nicht zugeordnet“ (`nichtZugeordnet`, ohne Buchungsliste). Damit gilt
`nettoCent = gesamtCent − nettoEinzahlungCent` per Konstruktion, geprüft in
`test/gewinnquellen-summe.test.ts`. Der Topf ist im Normalfall leer. Steht er, ist er ein Befund.
