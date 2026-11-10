# ADR-063: Kursentwicklung je Position im Dialog der Aufteilung

## Kontext

Die Aufteilung zeigt, was eine Position heute wert ist, aber nicht, wie sich ihr Kurs entwickelt
hat und wann gekauft wurde. Der Klick auf den Namen führte bisher zu onvista, also weg aus der
Anwendung.

## Entscheidung

- **Der Name öffnet einen Dialog „Kursentwicklung“.** Anfangs mit der geklickten Position, über
  einen Filter lassen sich die übrigen einblenden, dazu die Zeitraumwahl. Der Titel ist
  generisch, die geklickte Position ist nicht hervorgehoben: nach dem Einblenden sind alle
  Linien gleichrangig. Die Zeitraumwahl kennt hier zusätzlich **3M** (`KURS_ZEITRAEUME`); die
  Verlauf-Kachel bleibt bei `ZEITRAEUME`, ihr Server lehnt `3m` ab.
- **onvista wandert in eine eigene Spalte „Info“** zwischen Art und Anteil, der Name ist jetzt der Knopf. Im Dialog
  gibt es keinen Link: dort sind alle Linien gleichrangig.
- **Der Dialog trägt seinen Blur auf einer eigenen Ebene** (`schwebend-ebene`). Ein Element mit
  `backdrop-filter` ist Backdrop Root, der Tooltip im Dialog verschwämme sonst nur die
  Dialogfläche statt der Linien. Die Ebene scrollt mit dem Element, deshalb scrollt der Inhalt
  aller Dialoge jetzt in einem inneren Container.
- **Kursentwicklung statt geldgewichtet**, je Linie ab dem eigenen ersten Kurs im Fenster gleich
  0 %. Nur so sind Positionen untereinander vergleichbar; Kurse vor dem ersten Kauf werden gezeigt.
- **Ein Punkt je Kauf** auf der Linie, damit sichtbar bleibt, ab wann die Position gehalten wird.
- **Eine Route für alle aktuellen Positionen eines Fensters.** Der Filter löst keine Anfrage aus,
  und der Demo-Abzug bleibt aufzählbar.
- **Drift ohne Sperre.** Die Linien sind reine Marktkurse und hängen nicht an der Rekonstruktion,
  die die Drift misst; die Fußnote reicht.
- **Zeitgetreue Achse statt der Kategorie-Achse der Verlauf-Kachel.** Dort bekommt jede Zeile
  gleich viel Breite, bei 3J nähme das taggenaue letzte Jahr fast die ganze Fläche ein. Deshalb ein
  eigener Chart; Linien, Leuchten, Animation, Achsenformat und Tooltip folgen der Verlauf-Kachel.
- **Kaufpunkte in einer eigenen Ebene** über die Skalen der Achsen, nicht als `dot` der Linie:
  Recharts baut `dot` in jedem Animationsframe je Linie und Tag neu, bei 24 Linien blockierte im Dev-Build
  ein Klick die Seite rund zehn Sekunden. Die Punkte springen beim Morphen sofort an ihr Ziel.

## Verworfene Alternativen

- **Vergleichs-ETFs im Filter** — die Frage ist, wie sich die eigenen Positionen entwickelt
  haben; Vergleiche beantwortet die Verlauf-Kachel.
- **Liste der Positionen unter dem Chart** — der Filter nennt sie, der Chart bekommt die Fläche.
- **Animation oder Leuchten ab vielen Linien abschalten** — gemessen kostete beides kaum etwas,
  teuer war allein `dot`.

## Offen

Ausschüttungen fehlen in den Kursen, Ausschütter schneiden gegen Thesaurierer systematisch
schlechter ab. Ob die Kurse splitbereinigt sind, ist nur mit echten Daten zu klären.
