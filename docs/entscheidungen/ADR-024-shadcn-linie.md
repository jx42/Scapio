# ADR-024: Die shadcn-Linie — `radix-ui`, `new-york-v4`, bewusst abweichende Bausteine

## Kontext

`src/components/ui/` besteht aus shadcn-Bausteinen, die von Anfang an an die fachlichen
Tokens ([ADR-019](ADR-019-shadcn-variablen-als-aliase.md)), an die Invarianten und an die
dichte, dunkle Oberfläche angepasst wurden. Über die Zeit liefen sie auseinander:
`alert.tsx` stammte aus einer neueren Registry-Generation (`radix-nova`) als die übrigen,
`package.json` führte neun einzelne `@radix-ui/react-*`-Pakete, während die Registry seit
`new-york-v4` das Monopaket `radix-ui` importiert, und `components.json` benannte keinen
Stand, gegen den man hätte vergleichen können. `shadcn add` und der Vergleich mit der
Registry taugten dadurch nicht mehr als Aktualisierungsweg.

## Entscheidung

1. **Ein Registry-Stand: `new-york-v4`, Basis `radix`** — der, den `components.json`
   nennt (`style`; die Basis leitet die CLI aus dem Stil ab). Alle vierzehn Bausteine
   folgen Struktur und API dieses Stands: `import { X as XPrimitive } from 'radix-ui'`,
   `data-slot`, `data-variant`/`data-size` (außer `tabs` und `toggle-group`, die keine Varianten haben), Vorgabewerte in der Signatur, `className`
   über `cn(variants({ … }), className)`.
2. **`radix-ui` statt neun `@radix-ui/react-*`.** Ein Paket, ein Lockfile-Eintrag, dieselbe
   Schreibweise wie in der Registry. `npm ci --ignore-scripts` und `npm run audit` laufen
   unverändert.
3. **Vergleich mit der Registry per `npx shadcn@latest add <baustein> --diff
   <baustein>.tsx`.** `shadcn diff` liefert in dieser CLI-Version für jeden Baustein „No
   updates found" und taugt nicht als Prüfung. `--overwrite` nur nach Durchsicht der
   Liste unten, nie pauschal: es würde jede Abweichung tilgen.
4. **Das Aussehen bleibt unser eigenes.** Die Abweichungen unten sind gewollt; alles
   Übrige soll dem Registry-Stand entsprechen. Ein neuer Unterschied, der nicht in der
   Liste steht, ist ein Fehler oder gehört hier eingetragen.
5. **Kein `ui/chart.tsx`.** Charts laufen über Recharts und `<ChartRahmen>`; ein
   shadcn-`Chart` kommt nicht dazu (siehe Fußnote zu `--chart-n` in ADR-019).

## Bewusste Abweichungen von der Registry

Durchgängig: fachliche Tokens statt shadcn-Namen (`bg-flaeche`, `text-text`, `border-rand`,
`text-text-leise`, `bg-grund`, `bg-chart-1` als Akzent; ADR-019), Oberflächenklassen aus
`theme.css` (`glas`, `glas-hover`, `schwebend`; ADR-029), kein `"use client"` (Vite-SPA),
deutsche Kopfkommentare mit dem Grund. Kein `style`-Attribut in `ui/**` [INV-05]. Den
Fokusring setzt `theme.css` global und unlayerte; Bausteine tragen deshalb kein eigenes
`focus-visible:ring-…` (Ausnahme: `triggerVariants`, siehe unten). `outline-none` ohne
Fokusring in derselben Klasse ist per Lint verboten (`eslint.config.js`, Block `ui/**`),
`button.tsx` nimmt die begründete Ausnahme. Übergänge mit `transition-farben` statt
`transition-colors`, damit der Fokusring nicht einblendet (`theme.css`).

| Baustein | Abweichung |
|---|---|
| `alert` | Varianten `default`, `gewinn`, `warnung`, `verlust` statt `default`/`destructive`. Kompakter (`px-2.5 py-2`). `AlertAction` bleibt (aus `radix-nova`). Beschreibung ist ein Block statt eines Grids, damit gemischter Inline-Inhalt nicht in Zeilen zerfällt. |
| `badge` | Varianten `default`, `warnung`, `verlust`, `gewinnLeise`, `verlustLeise`, `link` statt der shadcn-Palette; eckiger, Großbuchstaben, eigene Größen. `link` mit `text-text` statt `text-text-leise`: auf `rand-licht` kam das leise Grau nur auf 4,23:1 (WCAG 1.4.3). |
| `button` | Varianten `default`, `outline`, `ghost`, `link` (kein `destructive`/`secondary` — die Anwendung löscht nichts); Größen `default`, `sm`, `lg`, `icon` (kein `xs`, keine `icon-*`); `cursor-pointer`, `transition-farben`; keine `aria-invalid`-Stile (keine Formulare). Symbolgröße steht wie in der Registry in der Basisklasse — Symbole im Knopf tragen kein eigenes `size-4`. |
| `card` | `glas glas-hover rounded-lg` statt `rounded-xl border bg-card shadow-sm`; nur `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` (kein `CardAction`, kein `CardFooter`); `asChild` als Erweiterung. |
| `collapsible` | `cursor-pointer` am Auslöser. |
| `dialog` | Nur `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription` (Overlay und Portal intern, kein `DialogTrigger`/`DialogClose`/`DialogFooter`). `schwebend`, Tokens, Überschrift in `font-heading`; Schließen-Text aus `i18n/de.ts`. `DialogContent` merkt sich den Auslöser beim Öffnen und fokussiert ihn beim Schließen — Radix gibt den Fokus nur an einen `DialogTrigger` zurück, und unsere Dialoge sind gesteuert (WCAG 2.4.3). |
| `dropdown-menu` | Nur `DropdownMenu`, `Trigger`, `Content`, `CheckboxItem`. `CheckboxItem` mit Farbpunkt (`punkt`) und rechtem Inhalt (`rechts`) für Linien- und Benchmarkwahl. |
| `popover` | Fläche `schwebend`, Pfeil `fill-rand`, `max-w-xs`, ohne Ein-/Ausblend-Animation. Trägt die Erklärungen des `InfoKnopf` und den Demo-Grund am Aktualisieren-Knopf, weil ein Tooltip auf Touchgeräten nicht aufgeht (WCAG 1.4.13). |
| `trigger` (kein Registry-Baustein) | `triggerVariants` (cva, Größen `default`/`sm`, `aktiv` für eine gesetzte Auswahl) mit eigenem Fokusring für die Menü-Auslöser im Kachelkopf. Ersetzt das gelöschte `select.tsx`, das nur noch diesen Stil lieferte. |
| `skeleton` | `bg-rand` und `motion-safe:animate-pulse` statt `animate-pulse bg-accent`. |
| `sonner` | Ohne `next-themes` (Theme fest dunkel), ohne `style`-Attribut, Farben als Klassen aus den Tokens, `closeButton`, `duration={3000}`. Die beiden CSP-Hashes stehen in `server/sicherheit.ts`. |
| `table` | Dichter (`h-8`, `py-1.5`, `text-xs`), Rahmen `border-rand`, Randzellen ohne Außenpolster, damit die Linien bündig mit dem Text enden; Zeilen-Hover als gerundete Fläche darüber hinaus (`tabellenzeile-hover`, ADR-029). Mit `bereich` wird der Scroll-Container eine fokussierbare, benannte Region — für Tabellen, die bei schmaler Breite überlaufen (WCAG 2.1.1). `innen` setzt Klassen am Scroll-Container (etwa die Blende `ausblenden-unten`), damit die Maske nicht über dem Fokusring der Region liegt. |
| `tabs` | Liste als Bedienfläche (`lichtkante lichtkante-hover bg-bedien p-0.75`), feste Höhe `h-9`, Reiter `h-7`. |
| `toggle`, `toggle-group` | `toggle.tsx` exportiert nur `toggleVariants` (ein einzelner Toggle kommt nicht vor). Feste Höhe (`h-7`) statt Größenstufen, kein `spacing` (die Registry setzt es per `style`). Die Gruppe ist eine Segmentleiste in derselben Bedienfläche wie `tabs`, Einträge ohne eigenen Rand. |

## Folgen

- `radix-ui` ersetzt die neun Einzelpakete in `package.json`; sonst ändert sich zur
  Laufzeit nichts.
- Die Chart-Tooltips teilen sich eine Fläche (`components/ChartTooltipFlaeche.tsx`).
  Einen `ui/tooltip.tsx` gibt es nicht mehr: Erklärungen stehen im Popover, und
  `test/keinTooltip.test.ts` hält den Radix-Tooltip draußen.
- Ein `shadcn add` eines neuen Bausteins ist wieder möglich: Ergebnis prüfen, Tokens statt
  shadcn-Namen einsetzen (Aliase aus ADR-019 fangen das Vergessene ab), INV-05 wahren und
  die neue Abweichung hier eintragen.
- `ui/**` hat einen eigenen, reduzierten Lint-Regelsatz (Barrierefreiheit, `outline-none`);
  die Oberflächenregeln aus `src/**` gelten dort nicht.
