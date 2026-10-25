# ADR-058: Länder und Sektoren neben den Unternehmen

## Kontext

[PRODUCT.md](../../PRODUCT.md) führte Sektoren und Länder bei der Aufteilung als „bewusst nicht“.
Die Positionen der Aufteilung haben auch keine: ein ETF hat weder Land noch Sektor. Die Bestandslisten
der Fondsanbieter, die Kachel 4 schon für die Unternehmen abruft ([ADR-038](ADR-038-top25-nur-auf-wunsch.md)),
tragen beides aber je Unternehmen. Die Frage „wie hoch ist mein echter USA- bzw. Tech-Anteil?“ lässt
sich damit ohne neuen Abruf beantworten.

## Entscheidung

- **Kachel 4 sind zwei Karten in einer Reihe im Verhältnis 2 : 3,** aus derselben Abfrage: links
  „Top 25 Unternehmen“ als kompakte Tabelle (Anteil und Anzahl rechts neben dem Titel), rechts „Länder & Sektoren“ (Länder über Sektoren, je Legende
  links und Ring rechts, ohne eigene Überschrift neben der Kopfzeile),
  Anteil vor Exposure. Zugeklappt fünf Gruppen je Ring; „Unternehmen“ folgt der Höhe von „Länder &
  Sektoren“ und zeigt so viele Zeilen, wie hineinpassen. Beide blenden die nächste Zeile aus und haben
  „Mehr zeigen“ wie die Kennzahlen. Einstellung (`top25`) und Route
  (`/api/top25`) bleiben, damit vorhandene `einstellungen.json` weiter greifen.
- **Fonds je Unternehmen nur in einer Hover-Karte** (Radix `HoverCard`), für Screenreader verborgen in der
  Zeile. Eine Hover-Karte ist kein Tooltip im Sinne von `test/keinTooltip.test.ts`: sie bleibt offen, solange
  der Zeiger auf ihr steht, und Escape schließt sie (WCAG 1.4.13).
- **Gerechnet wird in `core/lookthrough.ts`** über alle Bestandteile, nicht nur die Top 25, und bezogen
  auf das durchschaute Exposure: Gold, Cash und Fonds ohne Bestandsliste haben kein Land.
- **Die zehn größten Gruppen einzeln**, Rest und fehlende Angaben als „Übrige“ (`name: null`). Dafür hat
  die Oberfläche zehn Chartfarben; `chart-6` bis `chart-10` wechseln Ton und Helligkeit, damit Nachbarn im
  Ring auch bei Farbfehlsichtigkeit auseinandergehen.
- **Gruppiert wird nach dem Rohtext des Anbieters.** `src/lib/laender.ts` führt jede Schreibweise
  (englisch, deutsch von iShares, angezeigt) auf ein ISO-Kürzel; daran hängen der deutsche Name in
  `src/i18n/de.ts` und die Flagge. Unbekanntes erscheint unverändert, mit Erdkugel wie „Übrige“.

## Verworfene Alternativen

- **Länder und Sektoren in der Aufteilung** — dort stehen Positionen, nicht Unternehmen, und die
  Aufteilung braucht keine Fondsanbieter.
- **Zwei Reiter** „Unternehmen“ und „Länder & Sektoren“ — so sah man nie beides zugleich.
- **Eine Karte „Analyse“ über die volle Breite** mit drei Spalten — die Ringe über den Legenden machten
  sie doppelt so hoch wie die Tabelle daneben.
- **Flaggen und Sektorsymbole je Zeile** — ausprobiert und wieder entfernt: zehn Farben, Flagge und Symbol
  je Zeile waren zu unruhig. Ein Symbol steht nur in der Ringmitte, für die hervorgehobene Gruppe
  (Länder: Flagge, Sektoren: je eins aus lucide). Die Flaggen kommen aus `country-flag-icons` als
  React-Komponenten, nicht als Bilddateien: ein Bild aus berechneter Adresse bräuchte ein `href` (INV-06).
- **Fondsliste unter dem Namen** — verdoppelte die Zeilenhöhe; die Frage „aus welchem ETF?“ stellt sich
  nur je Unternehmen.
- **Normalisierung im Ingest** — Rohdaten bleiben, wie die Anbieter sie liefern; eine Übersetzung
  gehört zur Anzeige.

## Folgen

- `KERN_VERSION` 39.
- Auf Touchgeräten und per Tastatur ohne Screenreader ist die Fondsliste nicht sichtbar.
- Anbieter schreiben dasselbe Land unterschiedlich; gruppiert wird roh, also kann ein Land doppelt
  erscheinen (mit gleichem Namen und gleicher Flagge), bis die Zuordnung im Kern landet.
