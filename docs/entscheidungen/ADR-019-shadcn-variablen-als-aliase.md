# ADR-019: shadcn-Variablen als Aliase auf fachliche Tokens statt als Ersatz

Ergänzt durch [ADR-024](ADR-024-shadcn-linie.md): welcher Registry-Stand gilt und welche
Bausteine bewusst abweichen.

## Kontext

`styles/theme.css` definiert seit Beginn eigene, fachlich benannte Farb-Tokens
(`--color-grund`, `--color-flaeche`, `--color-gewinn`, `--color-verlust`, …) statt der
Namen, die `npx shadcn init` normalerweise anlegt (`--background`, `--foreground`,
`--card`, `--border`, `--ring`, …). Der Grund steht bereits im Dateikopf: ein Token soll
nach seiner fachlichen Rolle heissen, nicht nach seinem Aussehen, sonst heisst eines
Tages etwas "blau" und ist grün. Jede Komponente unter `components/` und `components/ui/`
benutzt ausschliesslich diese fachlichen Utilities (`bg-flaeche`, `text-text`,
`border-rand`, …); keine einzige verweist heute auf einen shadcn-Standardnamen.

Das Projekt importiert trotzdem `shadcn/tailwind.css` (siehe `theme.css`) — das Paket
liefert aber keine Farb-Tokens, sondern nur Utilities und Keyframes (`no-scrollbar`,
`shimmer`, `scroll-fade`, die `accordion-*`-Keyframes). Faerbung kommt ausschliesslich aus
dem eigenen `@theme`-Block. Fehlen dort die shadcn-ueblichen Variablennamen, rendert eine
kuenftig per `npx shadcn add` eingefuegte Komponente unlackiert: ihr generierter Code
verwendet Klassen wie `bg-background`, `text-muted-foreground`, `border-border`,
`ring-ring`, die ohne passenden `--color-*`-Eintrag in Tailwind v4 keine Utility erzeugen.

## Entscheidung: Aliase zusaetzlich zu den fachlichen Tokens, nicht anstelle von ihnen

`@theme` bekommt einen zweiten Block mit den shadcn-ueblichen Namen, jeder einzelne ein
reiner `var(...)`-Verweis auf ein bestehendes fachliches Token. Nichts wird umbenannt,
nichts entfernt. Kein bestehender Komponentencode wird umgestellt — die fachlichen
Utilities bleiben die einzigen, die tatsaechlich benutzt werden. Der Effekt ist rein
additiv: `grep` nach `bg-background`, `text-foreground` & Co. in `src/` liefert vor und
nach dieser Änderung nichts, das Rendering ist unveraendert.

Zuordnung (Rolle des shadcn-Namens → bestehendes fachliches Token):

| shadcn | fachlich | Begruendung |
|---|---|---|
| `--background` | `--color-grund` | Seitenhintergrund |
| `--foreground` | `--color-text` | Fliesstext |
| `--card`, `--popover`, `--secondary`, `--accent`, `--muted` | `--color-flaeche` | einzige "erhöhte" Flaeche, die das Projekt kennt |
| `--card-foreground`, `--popover-foreground`, `--secondary-foreground`, `--accent-foreground` | `--color-text` | Text auf `--color-flaeche` |
| `--muted-foreground` | `--color-text-leise` | shadcns "muted" ist unser "leise" |
| `--primary` | `--color-chart-1` | Ton, den `Button`s `default`-Variante bereits als Akzent nutzt |
| `--primary-foreground` | `--color-grund` | Text auf `--primary`, wie in `buttonVariants` |
| `--destructive` | `--color-verlust` | einzige Ton, den das Projekt fuer "gefaehrlich/negativ" kennt |
| `--destructive-foreground` | `--color-grund` | Text auf `--destructive` |
| `--border`, `--input` | `--color-rand` | eine Randfarbe fuers ganze Projekt |
| `--ring` | `--color-fokus` | der Fokusring-Ton, den `:focus-visible` schon verwendet |
| `--radius` | `--radius-lg` | siehe unten |

Nicht aliasiert: `--chart-1` bis `--chart-5`. Als Tailwind-Utility (`bg-chart-1`) stimmen
die Namen mit der shadcn-Konvention ueberein, weil `theme.css` `--color-chart-1..5`
definiert; eine rohe Variable `var(--chart-1)` fände dagegen nichts. Ein Alias haette nur
generierten Chart-Code bedient — und den gibt es nicht: das Projekt hat kein
`ui/chart.tsx` und bekommt keins, Charts laufen ueber Recharts und `<ChartRahmen>`
([ADR-024](ADR-024-shadcn-linie.md)). Die Ansichten lesen `var(--color-chart-n)`.

### Radius bleibt fest, `--radius` zeigt nur darauf

Die vier festen Radius-Stufen (`--radius-sm/md/lg/xl`, siehe Kommentar an Ort und Stelle)
sind eine bewusste, schon getroffene Entscheidung: `calc()` auf einer Zwischenvariablen
macht aus einer lesbaren Zahl eine, die man im Kopf ausrechnen muss, für einen Wertebereich
mit genau vier benutzten Stufen. Diese ADR aendert daran nichts, haelt sie aber jetzt auch
schriftlich fest statt nur im Code-Kommentar — Konvention aus `AGENTS.md`: eine
Entscheidung, die eine Änderung beruehrt, gehoert als ADR dokumentiert. `--radius` (ohne
Suffix) wird zusaetzlich als reiner Alias auf `--radius-lg` gefuehrt, fuer denselben Zweck
wie die Farb-Aliase: eine eingefuegte shadcn-Komponente, die `rounded-[var(--radius)]`
schreibt, statt `rounded-lg`, trifft denselben Wert.

### Warum kein eigener `.dark`-Block

Das Projekt ist dunkel-only (`color-scheme: dark` in `:root`, kein `.dark`-Selektor, keine
`prefers-color-scheme`-Weiche irgendwo in `theme.css`). Ein zweiter, `.dark`-gescopter
Alias-Block waere eine Vorbereitung auf einen hellen Modus, den es nicht gibt und der hier
nicht geplant ist — ein einziger, unbedingter Alias-Block reicht.

## Folgen

- `styles/theme.css` bleibt die einzige Datei mit einer Farbe; die Aliase verweisen nur,
  sie definieren nichts neu.
- Bestehende Komponenten sind unveraendert: keine nutzt einen der neuen Namen.
- Eine kuenftig per `npx shadcn add` eingefuegte Komponente rendert mit den richtigen
  Farben, ohne dass ihr generierter Code vor dem ersten Einsatz von Hand auf die
  fachlichen Namen umgeschrieben werden muss.
- Neuer Anwendungscode benutzt weiterhin die fachlichen Utilities (`bg-flaeche`, nicht
  `bg-card`) — die Aliase sind eine Kompatibilitätsschicht fuer fremden/generierten Code,
  keine zweite erlaubte Schreibweise fuer eigenen.

## Nachtrag: ohne shadcn-CSS und ohne Standardpalette

Die Kopie von `shadcn/tailwind.css` ist entfernt: keine ihrer Utilities, Keyframes und
`data-*`-Varianten wurde benutzt. `@theme` beginnt mit `--color-*: initial`, damit Tailwind
seine Standardpalette (`bg-red-500`, `text-white`, …) gar nicht erst erzeugt; Farbe gibt es
nur noch über die fachlichen Tokens und die Aliase oben. `@import 'tailwindcss' source("..")`
begrenzt die Klassensuche auf `src/`; die Randfallseite holt ihren Ordner in
`test/edgecases/edgecases.css` dazu. Lint verbietet Palettenklassen und px-Werte in
Klassen zusätzlich, damit ein Verstoß im Editor auffällt und nicht erst als fehlende Farbe.
