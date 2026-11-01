# ADR-053: Stichtag der Kennzahlen, ISIN-Wechsel und Selbstkontrolle ohne Cash

Nachtrag zu [ADR-036](ADR-036-kennzahlen-korrekturen-nach-pruefung.md) und
[ADR-043](ADR-043-flusskonvention-und-kapitalmassnahmen.md); Befund aus dem Audit vom 2026-10-17.

## Kontext

- IZF, Realrendite und Positions-IZF setzten den Endwert auf `heute`, obwohl er der Wert des
  letzten Reihentags ist. Ohne neuen Lauf sank der IZF mit jedem Kalendertag.
- Der Topf aus ADR-043 übertrug einen Einstand bis zu 30 Tage auf jeden Zugang ohne Bestand —
  auch auf fremde Gratisstücke nach einer Ausbuchung.
- Nach einem ISIN-Wechsel fehlte dem Positions-IZF der Kauf der Vorgängerin; die neue ISIN
  hatte Einstand, aber keinen Einsatz.
- Ohne Cash verglich die Selbstkontrolle den Depotwert mit einem Wert ohne Verrechnungskonto
  und meldete Drift, die keine war.

## Entscheidung

- **Stichtag = letzter Reihentag.** `berechneKennzahlen` datiert Endwert, Realrendite und
  Monatsrenditen auf `letzte.tag`; `heute` gilt nur, wenn die Reihe leer ist. Die Sparrate
  bleibt bei `heute` — sie zählt Kalendermonate.
- **Topf nur am selben Tag.** Ein Abgang ohne Bestand wird nur mit Zugängen desselben Tags
  verpaart. Ohne Zugang am selben Tag wird der Einstand sofort als realisierter Verlust
  gebucht und als Hinweis `H_AUSBUCHUNG` gezählt.
- **Positions-IZF mit Vorgängerin.** `fifo` liefert je ISIN ihre `herkunft` (Vorgängerin, Tag,
  Anteil, auch über mehrere Wechsel). `positionsFluesse` nimmt deren Flüsse bis zum Wechseltag
  anteilig auf.
- **Selbstkontrolle ohne Cash ausgesetzt.** Fehlt `cashCent`, prüft `selbstkontrolle` nicht und
  protokolliert das.

## Verworfene Alternativen

- **Frist von 30 Tagen beibehalten.** Ein ISIN-Wechsel über mehrere Tage bliebe richtig, aber eine
  Ausbuchung mit späteren Gratisstücken einer anderen ISIN würde still zum Übertrag.
- **Endwert auf `heute` fortschreiben.** Das wäre eine Schätzung des heutigen Kurses.

## Folgen

- `KERN_VERSION` 34: Die Historie wird beim nächsten Lauf neu berechnet.
- Bucht die Bank einen ISIN-Wechsel über mehrere Tage, entstehen ein Totalverlust und
  Gratisstücke, sichtbar über `H_AUSBUCHUNG`. Die Kennzahlen-Hinweise gehen über
  `/api/kennzahlen`, die Oberfläche zeigt sie bisher nicht.
- Grenztests halten drei bisher überlebende Mutanten fest (`fifo.ts`, `xirr.ts`, `twr.ts`),
  dazu ein Test, dass die Depotreihe lückenlos ist.

## Nachtrag: Hinweise in der Kachel

Ein Kennzahlen-Hinweis ist jetzt `{ code, anzahl }` wie ein Lauf-Hinweis; den Satz baut
`de.kennzahlen.hinweis` (`KERN_VERSION` 35). Die Kennzahlen-Kachel zählt die Hinweise rechts in der Titelzeile und listet sie im Dialog
(`HinweisKnopf`, wie die fehlenden Fonds der Top 25).
`H_KEIN_VPI` und `H_DRIFT_AUSGESETZT` bleiben dort still: die Inflationszeile und das
Drift-Banner sagen dasselbe schon.

Seit [ADR-059](ADR-059-kennzahlen-kachel-aufgeloest.md) steht der `HinweisKnopf` im Kopf der Verlaufskachel.
