# ADR-060: Eine Kachel Aufteilung mit den Reitern Aufteilung | Analyse

## Kontext

Nach [ADR-059](ADR-059-kennzahlen-kachel-aufgeloest.md) standen Aufteilung (volle Breite) und
darunter Unternehmen neben Länder & Sektoren. Die beiden Look-Through-Karten hielt eine gemessene
Höhenbindung gleich hoch ([ADR-058](ADR-058-laender-und-sektoren-neben-den-unternehmen.md)), die
`<Kachel>` als dritte Ausnahme von INV-05 brauchte. Alle drei beantworten dieselbe Frage — worauf
sich das Geld verteilt — und standen doch untereinander.

## Entscheidung

- **Eine Kachel mit zwei Reitern rechts oben:** Aufteilung (Vorgabe) und Analyse. Titel
  (Aufteilung bzw. Analyse), Werkzeuge und Driftfußnote folgen dem Reiter; Rebalancing gibt es nur in der
  Aufteilung. Die Wahl wird nicht gespeichert: die Aufteilung beantwortet die Hauptfrage, die
  Analyse ist ein Blick tiefer.
- **Analyse in drei gleich breiten Spalten** ab `xl`, darunter untereinander: Länder, Sektoren,
  Unternehmen, je mit Überschrift. Je Spalte oben ein Chart gleicher Höhe (`ANALYSE_CHART_HOEHE`), darunter die Tabelle,
  zugeklappt fünf Zeilen, ein gemeinsames „Mehr zeigen“.
- **Unternehmen als Treemap**, Fläche nach Exposure, **Farbe nach Sektor in der Farbe des
  Sektorrings** (`gruppenFarbe` in `GruppenRing.tsx`); grau ist, was im Ring unter „Übrige“ fällt.
  Hover auf einen Sektor hebt dessen Unternehmen hervor, Hover auf ein Feld die Tabellenzeile. Die
  Farbe ist eine Zuordnung, keine Summe. Ein graues Feld „Andere“ steht für den Rest des Depots
  (`andereCent` und die Zahl der übrigen Unternehmen, `andereAnzahl`, aus `core/lookthrough.ts`), damit die Flächen Anteile am ganzen Depot sind und nicht
  nur an den Top 25 — auch wenn es meist das größte Feld ist.
  Auswahl und Hover in den Ringen hängen am Gruppennamen, nicht an der Position, damit ein Lauf
  mit neuer Reihenfolge die Auswahl nicht auf eine andere Gruppe schiebt.
- **Die Aufteilung zeigt den Gewinn in einer eigenen Spalte** statt in einer zweiten Zeile; schmal
  rutscht er darunter. **Der Name ist der onvista-Link**, ohne eigene Spalte; Strich und Pfeil
  „neues Fenster“ erst bei Hover oder Fokus, damit die Legende keine Liste unterstrichener Zeilen
  wird. Art und Werte bleiben der Knopf zum Hervorheben.
  Ein überzogenes Verrechnungskonto steht in Legende und Tabelle, aber nicht im Ring.
- **Reiter gibt es nur, wenn der Look-Through Unternehmen kennt** (`top25` an und mindestens eine
  Zeile in `/api/top25`). Lädt der Look-Through noch oder scheitert er, steht die Aufteilung allein
  mit Rebalancing, damit kein Reiter ins Leere führt. Verschwinden die Reiter, fällt die Wahl auf Aufteilung zurück. Kennt er keine Unternehmen, trägt die Aufteilung die Hinweise zu `funds.json` im
  Kopf: fehlende Fonds als `HinweisKnopf`, gar kein bekannter Fonds als Link zur Anleitung. Fehlen
  nur einige Fonds, steht der `HinweisKnopf` im Reiter Analyse.
- **Höhenbindung entfällt**, und mit ihr `--kachel-hoehe`: INV-05 kennt nur noch `<Balken>` und
  `<ChartRahmen>`.

## Verworfene Alternativen

- **Look-Through als eigene Kachel neben der Aufteilung** — kurz umgesetzt. Die Aufteilung wird in
  halber Breite zu eng für Name, Art, Anteil, Wert und Gewinn, und drei Ringe nebeneinander
  konkurrieren um denselben Blick.
- **Drei Reiter Aufteilung | Länder & Sektoren | Unternehmen** — dann sieht man Länder und
  Unternehmen nie zusammen; dasselbe Argument, mit dem ADR-058 „zwei Reiter“ verwarf.
- **Treemap in eigener Farbreihe oder einfarbig** — eigene Farben hätten neben dem Sektorring eine
  zweite Bedeutung bekommen (DESIGN.md, Eine-Bedeutung-Regel), einfarbig verschenkt den Sektor.
- **Look-Through auch ohne bekannte Fonds, mit Leerzustand** — ein Reiter, der nur erklärt, warum
  er leer ist; der Hinweis im Kopf der Aufteilung reicht.

## Folgen

- Fünf Kacheln; Kachel 4 bleibt frei, die Nummern der übrigen ändern sich nicht.
- ADR-058 gilt für Inhalt und Rechnung der Ringe und der Tabelle weiter, nicht mehr für ihre
  Anordnung.
- Die Beschriftung der Treemap ist Text auf Chartfarbe: dunkel (`grund`) auf `chart-1` bis
  `chart-10`, hell (`text`) auf `rand`, gemessen in `start/kontrast.ts`.
