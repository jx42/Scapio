# ADR-029: Liquid Glass dezent als einzige Darstellung

## Kontext

Das bisherige Glas (leichter Verlauf, `blur(8px)`, Rand oben/links hell) wirkte flach und
unentschieden. Verglichen wurden vier Varianten mit Umschalter: das bisherige Glas,
Klassisch (ohne Verlauf und Blur), Liquid Glass und Liquid Glass dezent. Der Stand liegt
als Referenz im Branch `themes-vergleich` und wird nicht gemergt.

## Entscheidung

Liquid Glass dezent wird die einzige Darstellung, ohne Umschalter.

- Farbfeld hinter der Seite nur aus den Farben der Oberfläche (Blau, Türkis, Grün).
- Kleine Radien (`0.375`–`0.875rem`), leise Kanten und Schatten.
- Kacheln ohne `backdrop-filter`: hinter ihnen liegt nur das weiche Farbfeld, und Chrome
  zeichnet am oberen Viewportrand einen hellen Schleier auf angeschnittene Kacheln.
  Außerdem wäre jede Kachel eine Backdrop Root, und ein Tooltip darin könnte nichts mehr
  blurren.
- Lichtkante als maskierter Ring mit Verlauf statt als `border` mit Farbe je Seite: die
  Seitenfarben stoßen in den Ecken diagonal aneinander.
- Alles Schwebende (Menü, Select, Tooltip, Chart-Tooltip, Dialog, Toast) teilt eine
  Fläche, `schwebend`. Lesbar durch Blur und Abdunkeln, nicht durch Deckkraft. Ein Menü
  hat denselben Radius wie sein Auslöser (`rounded-md`).
- Alle Bedienelemente (Auswahl-Knöpfe, Reiter, Zeitraum-Leiste, Outline-Knopf) teilen
  Fläche (`bg-bedien`) und die Lichtkante der Kacheln samt Hover (`lichtkante`,
  `lichtkante-hover`), ohne Innenschatten — der doppelte Glanz oben ließ die Kante
  unscharf wirken. Anders als Kacheln heben sie sich beim Überfahren nicht an. Das
  gewählte Segment hebt sich nur über die Fläche ab (`bg-bedien-aktiv`); ein Auslöser mit
  gesetzter Auswahl zeigt die Schrift hell (`triggerVariants({ aktiv })`).
- Trennlinien enden bündig mit dem Text. Der Zeilen-Hover (Tabellen, Positionsliste) ist
  eine gerundete Fläche, die seitlich 8px darüber hinausragt, in der Farbe der Linien
  (`--color-zeile`), sodass diese darin aufgehen (`zeile-hover`; für `<tr>` stückweise
  aus den Zellen, `tabellenzeile-hover`, weil Chrome ein `::before` der Zeile als eigene
  Zelle anlegt). Leise Schrift wird dabei hell. Jeder abschneidende Behälter — auch
  eine Maske und eine Zelle mit `truncate` — braucht dafür 8px Luft (`-mx-2 px-2`).
- Alle Werte sind Tokens in `theme.css`, die shadcn-Bausteine nutzen sie über Klassen.
  Keine Überschreibung per `data-slot`-Selektor.

## Folgen

- Kontrast hängt an der hellsten Stelle des Farbfelds. Gemessen wird dort, nicht auf
  `--color-grund`.
- `leuchten-titel` und `--color-schimmer` entfallen.
