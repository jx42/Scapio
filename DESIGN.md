---
name: Scapio
description: Lokales Dashboard für ein Scalable-Capital-Depot — dunkel, dicht, eine Seite.
---

# Design System: Scapio

Werte stehen nur in `src/styles/theme.css`. Diese Datei sagt, wofür sie da sind. Kontraste stehen in [docs/BARRIEREFREIHEIT.md](docs/BARRIEREFREIHEIT.md), Regeln für Komponentencode in [src/CLAUDE.md](src/CLAUDE.md). Ein Wert wird hier nicht wiederholt, weil eine zweite Kopie still veraltet.

## Overview

**Creative North Star: „Die Sternwarte"**

Ein ruhiges Messinstrument: dunkel, dicht, die Zahl im Vordergrund. Die Seite ist ein
Raster aus Glaskacheln über einem weichen, fest stehenden Farbfeld aus Blau, Türkis und Grün.
Die Fläche selbst bleibt fast unsichtbar, eine 1-px-Lichtkante gibt ihr Form
([ADR-029](docs/entscheidungen/ADR-029-liquid-glass-dezent.md)). Dekoration gibt es nur, wo
sie Lesbarkeit stiftet: leuchtende Chartlinien, leise getönte Kennzahlkarten.

**Key Characteristics:**
- Nur dunkel, ohne Umschalter (`color-scheme: dark`).
- Hohe Informationsdichte, kleine Radien, leise Kanten und Schatten.
- Tabellarische Ziffern überall, damit Spalten beim Wechsel der Zahlen stillstehen.
- Kein Element ohne Funktion: kein Hero, kein Logo-Bereich, keine Illustration.

## Colors

Tokens heißen nach ihrer Bedeutung (`grund`, `flaeche`, `gewinn`), nie nach dem Aussehen.
Alles ist in OKLCH notiert.

### Neutral
- **grund**: Seitenhintergrund, fast schwarz mit einem Hauch Blau.
- **flaeche**: deckende Fläche, wo Glas nicht passt (Skip-Link, Alias für shadcn).
- **text** / **text-leise**: Haupttext bzw. Beschriftungen, Achsen, Stand und Footer.
- **rand**, **zeile**: Trennlinien und Zeilen-Hover in derselben Farbe, damit die Linie in der
  Hover-Fläche aufgeht.

### Semantik
- **gewinn** (Grün) / **verlust** (Rot): ausschließlich für die Richtung einer Zahl, immer mit
  Vorzeichen und Pfeil (`richtungswert()`).
- **warnung** (Bernstein): Drift-Banner und Hinweise aus dem Lauf.
- **fokus** (helles Blau): Fokusring, mindestens 3:1 auf jeder Fläche.

### Chartfarben
Recharts bekommt nur `FARBE.*` aus `src/lib/farben.ts`. Jede Reihe hat eine feste Rolle:

- **chart-1** (Blau): das Depot selbst. Depotwert-Fläche, Investitionsbalken, `Balken`,
  primärer Knopf.
- **chart-2** (Grau-Blau): eingezahltes Kapital im Tooltip.
- **chart-3** (Gelb): Ereignisse und Bezugslinien wie Kauf/Verkauf-Marken, Zuflüsse und den
  Durchschnitt der Investition.
- **chart-4** (Magenta): der Vergleich (Benchmark).
- **chart-5** (Grün-Türkis): nur reihum in Aufteilung und Analyse.
- **chart-6** bis **chart-10** (Beere, Hellcyan, Oliv, Immergrün, Rosé): nur reihum in den Ringen der
  Länder und Sektoren, die bis zu zehn Gruppen zeigen. Dunkel und hell wechseln sich ab, damit Nachbarn trennen.
- Der Rendite-Chart verläuft von **gewinn** zu **verlust** und trennt sich an der Nulllinie.

### Named Rules
**Die Eine-Bedeutung-Regel.** Eine Farbe bedeutet auf der ganzen Seite dasselbe. Magenta ist
immer der Vergleich und Gelb immer ein Ereignis. Eine neue Reihe bekommt keine schon
belegte Farbe. Die Treemap der Unternehmen färbt nach Sektor, mit genau der Farbe des
Sektorrings daneben; was dort keine eigene Farbe hat, ist `rand`.

**Die Nie-allein-Regel.** Gewinn und Verlust werden nie allein über Farbe gezeigt — auch nicht in
der Gewinnspalte der Aufteilung, die Euro und Prozent als Badge mit Pfeil zeigt.

## Typography

**Schrift:** Geist Variable für alles, mitgebaut und selbst ausgeliefert. Rückfall sind die
Systemschriften. `--font-mono` ist definiert, wird aber nicht benutzt.

**Charakter:** neutral und technisch. Die Zahlen tragen, die Schrift tritt zurück.

Tailwinds Skala ist um je 1 px angehoben, die Zeilenhöhe im selben Maß.

### Hierarchy
- **Seitentitel**: `text-3xl font-semibold`, einmal je Seite.
- **Große Zahl**: Depotwert und Kennzahlkarten mit `text-2xl font-bold leuchten-zahl`. Auf
  schmalen Karten wird sie kleiner.
- **Kacheltitel**: `font-heading`, Card-Titel.
- **Body / Tabelle**: `text-sm`.
- **Beschriftung, Stand, Footer, Achsen**: `text-xs text-text-leise`.

## Layout

Eine Spalte bis `xl`, darüber ein Raster aus `1.45fr` und `0.55fr` (mindestens 19 rem),
höchstens `max-w-8xl` (88 rem) mit `px-4` und `gap-4`. Die Reihenfolge ist Verlauf (volle
Breite), Aufteilung (volle Breite, mit Look-Through die Reiter Aufteilung und Analyse rechts oben), Gewinne & Abzüge (volle
Breite), Käufe & Verkäufe neben Sparplänen; die Paare strecken sich auf gleiche Höhe. Kacheln lassen sich ausblenden
([ADR-034](docs/entscheidungen/ADR-034-kachel-ausblenden-im-browser.md)). Die Untergrenze
sind 375 px ohne Überlauf, Grids deshalb immer mit `grid-cols-1`.

Hinweise, die der ganzen Seite gelten (Drift, Lauf, Anmeldung), stehen als Alert-Reihe
zwischen Kopf und Kacheln, nicht in einer Kachel. Hinweise einer einzelnen Kachel stehen als
Warnsymbol mit Anzahl rechts in ihrer Titelzeile und öffnen einen Dialog (`HinweisKnopf`).

## Elevation & Depth

Tiefe entsteht aus zwei Ebenen, nicht aus Schattenstufen:

- **Liegend**: `glas`, also eine fast durchsichtige Fläche mit Lichtkante und `shadow-kachel`,
  ohne `backdrop-filter`. Kachel und Karte.
- **Schwebend**: `schwebend` mit Blur, Abdunkeln und `shadow-schwebend`. Menü, Select,
  Popover, Chart-Tooltip, Dialog und Toast teilen diese eine Fläche. Lesbar wird sie durch
  Blur, nicht durch Deckkraft.

Bedienelemente (Auswahl-Knöpfe, Reiter, Zeitraum-Leiste) liegen auf `bg-bedien` mit
derselben `lichtkante`. Das gewählte Segment hebt sich über `bedien-aktiv` und
`bedien-rand` ab.

### Named Rules
**Die Kante-statt-Schatten-Regel.** Hover hellt nur die Lichtkante auf. Kacheln heben dabei
um 1 px an, Bedienelemente nicht.

## Shapes

Kleine Radien zwischen `rounded-sm` und `rounded-xl` (0,375 bis 0,875 rem). Kacheln haben
`rounded-lg`, Knöpfe und Menüs `rounded-md`. Ein Menü hat denselben Radius wie sein
Auslöser. Voll gerundet ist nur `Balken`; Badges sind `rounded-sm`, klein und in Versalien. Die Lichtkante ist ein maskierter Ring
mit Verlauf statt eines `border` mit Farbe je Seite.

## Components

Basis ist shadcn `new-york-v4` auf Radix, im Aussehen angepasst
([ADR-024](docs/entscheidungen/ADR-024-shadcn-linie.md), Aliase in
[ADR-019](docs/entscheidungen/ADR-019-shadcn-variablen-als-aliase.md)).

### Kachel
Das ist der einzige Rahmen auf der Seite. `<section>` mit sichtbarem Titel, optionalem
Untertitel, `InfoKnopf` und Werkzeugen in der Kopfzeile. Sie hat genau drei Zustände: Laden
(Skeleton in Zielhöhe), Leer (Satz, warum) und Fehler (`role="alert"`, was fehlt und was zu
tun ist). Eine Fehlergrenze ist eingebaut.

### Kennzahlkarte
Eine Glaskarte über dem Verlauf mit Bezeichnung, großer Zahl, Subline, optional einer zweiten
leisen Zeile (Inflation, Volatilität) und `InfoKnopf`; das Popover nennt die Werte, aus denen die
Zahl entsteht. Sie
ist mit `glas-ton-gewinn` bzw. `glas-ton-verlust` leicht nach der Richtung getönt.

### Charts
Charts stehen nur in `<ChartRahmen>`, der Höhe, Beschreibung und eine verborgene
Tabellenalternative in Fensterauflösung mitbringt. Die Linien leuchten über `<Leuchtfilter>`
(SVG-Filter auf einer Kopie unter der Linie, weil `drop-shadow()` die Farbe eines
Verlaufsstrichs nicht kennt), die Linie selbst bleibt scharf. Der Tooltip ist
eine `schwebend`-Fläche mit Datum, Trennlinie und farbigem Punkt je Reihe.

### Buttons
`rounded-md text-sm font-medium`. Primär in **chart-1** mit innerem Lichtrand
(`shadow-primaer`), sonst Outline auf `bg-bedien`. Icons von lucide, `size-4`.

### Tabellen und Zeilen
Trennlinien in `rand`. Der Hover ist eine gerundete Fläche, die 8 px über die Linien
hinausragt (`zeile-hover`, `tabellenzeile-hover`). Leise Schrift wird dabei hell.

### Erklärungen
Erklärt wird mit `InfoKnopf` als Popover per Klick. Tooltips für Erklärungen gibt es nicht.

### Richtungswert
Vorzeichen, Pfeil ▲/▼ und Farbe immer zusammen (`RichtungsBadge`, `RichtungsPfeil`). Die
Strichstärke des Pfeils folgt dem Schriftgewicht.

## Do's and Don'ts

### Do:
- **Do** Farben, Radien und Schatten nur über Tokens und Tailwind-Utilities setzen.
- **Do** jede neue Zahl beschriften und mit `InfoKnopf` erklären.
- **Do** neue Bewegung als CSS-Übergang oder mit `motion-safe:` einbauen. Reduzierte
  Bewegung schaltet global ab.
- **Do** ein neues Farb-Token in `start/kontrast.ts` paaren und `npm run kontrast` laufen
  lassen.

### Don't:
- **Don't** einen Hex-Wert, ein px-Literal oder ein `style`-Attribut in eine Komponente
  schreiben (Ausnahmen nach INV-05).
- **Don't** einen hellen Modus, Theme-Umschalter oder Farbverläufe als Dekoration einbauen.
- **Don't** einen `backdrop-filter` auf einer Kachel setzen.
- **Don't** eine externe Schrift, ein externes Icon oder ein externes Bild laden (INV-11).
- **Don't** Tooltips als Erklärung verwenden oder eine Kachel ohne `<Kachel>` bauen.
- **Don't** eine Farbe einer zweiten Bedeutung zuordnen.
