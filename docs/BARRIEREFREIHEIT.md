# Barrierefreiheit

Ziel ist WCAG 2.2 AA. Die Regeln stehen in `src/CLAUDE.md`; hier stehen ihre Gründe und die
Stelle, an der sie geprüft werden.

## Regeln und ihr Grund

| Regel | Grund | Wo |
|---|---|---|
| Nie `aria-hidden` über Fokussierbarem. Ein SVG mit `aria-hidden` braucht `rootTabIndex={-1}` (Recharts-`Pie` setzt sonst `tabindex=0`). | axe `aria-hidden-focus`: der Tabstopp läge im ausgeblendeten Baum, ein Screenreader landet im Nichts. | `AufteilungAnsicht.tsx` |
| Nichts Fokussierbares hinter einer Blende. Was die Maske `ausblenden-unten` abschneidet, ist `invisible` oder `inert`. | WCAG 2.4.11 (Fokus nicht verdeckt): ein Fokus, den man nicht sieht, ist keiner. Die angeschnittene Zeile bleibt als Andeutung stehen und ist deshalb `inert`. | `KennzahlenAnsicht.tsx`, `Kennzahlzeile` (`inert`) |
| Sprungziele sind fokussierbar: `<main id="kacheln" tabIndex={-1}>`. | Ohne `tabindex` springt der Sprunglink zwar, verschiebt aber den Fokus nicht (WCAG 2.4.3). | `App.tsx` |
| Klickziele mindestens 24 × 24 px (`min-h-6`, Tailwind, kein px-Literal). Ausgenommen: Inline-Textlinks im Fließtext (WCAG 2.5.8) und die onvista-Badges, die bewusst bei ihrer Optik bleiben. | Zielgröße. | — |
| Kein Inhalt läuft bei 375 px waagerecht über. Ein Grid, das schrumpfen soll, bekommt `grid-cols-1` (`minmax(0,1fr)`), nie die implizite `auto`-Spalte. | Die auto-Spalte wächst auf die Breite der Legende und schiebt die Kachel aus dem Fenster (WCAG 1.4.10). | `AufteilungAnsicht.tsx` |
| Spaltenköpfe haben Luft für vergrößerten Zeichenabstand (`w-12` bei „Rang“). | WCAG 1.4.12 Text Spacing. | `Top25Ansicht.tsx` |
| Die Datentabelle hinter einem Chart hat die Auflösung des Fensters, nicht der Reihe: bis 62 Punkte täglich, bis 400 wöchentlich, darüber monatlich; erster und letzter Punkt bleiben. Ein Satz (`hinweis`) nennt die Verdichtung. | Ein Jahr täglich vorzulesen ist keine Alternative, sondern eine zweite Hürde, und ein Vielfaches an DOM-Knoten. Gewählt wird nach Punktzahl: die Reihe ist eine lückenlose Tagesreihe. | `verlaufTabellen.ts`, `ChartRahmen` |
| Das Chart selbst ist nicht fokussierbar (kein `accessibilityLayer`). Im Vermögensmodus trägt die verborgene Tabelle die Vorgänge (Käufe, Sparplan, Erträge) der Marken als eigene Spalte. | WCAG 4.1.2: ein fokussierbares `role="application"` in `role="img"` kostete zwei leere Tabstopps. Die Marken standen sonst nur im Tooltip. | `VerlaufChartGeruest.tsx`, `verlaufTabellen.ts` |
| Kontrast wird aus den Farb-Tokens gerechnet, nicht gemessen: `test/invarianten/kontrast.test.ts` prüft jede Paarung aus `PAARUNGEN` (`start/kontrast.ts`), `npm run kontrast` schreibt die Tabelle [unten](#kontrast). Ein neues Token gehört in `PAARUNGEN`. Die Toast-Flächen sind `color-mix`; `TOAST_FLAECHEN` in `start/kontrast.ts` muss die Anteile aus `theme.css` mitziehen. | axe meldet Kontrast unter der Glas-Lichtkante (ADR-029) nur als „incomplete“, jsdom layoutet nicht. | `theme.css` |
| Zustand nicht allein über Fläche: das gewählte Segment trägt den Rand `--color-bedien-rand` (3 : 1). | WCAG 1.4.11: die Fläche allein hebt sich mit 1,19 : 1 ab. | `ui/toggle.tsx` |
| Fehlerzustände tragen `role="alert"`; Dialoge geben den Fokus an ihren Auslöser zurück; eine Erklärung („i“) und der Demo-Grund am Aktualisieren-Knopf sind Popover; `ui/tooltip.tsx` gibt es nicht (`test/keinTooltip.test.ts`). | WCAG 4.1.3, 2.4.3; ein Tooltip erscheint auf Touch nicht und verschwindet, bevor man ihn liest (1.4.13). | `Kachel`, `ui/dialog.tsx`, `InfoKnopf` |
| Eine überlaufende Tabelle ist eine benannte, fokussierbare Region (`bereich`), damit sie per Tastatur scrollt. | axe `scrollable-region-focusable` bei 375 px. | `ui/table.tsx`, `Top25Ansicht.tsx` |
| Eine Live-Region steht von Anfang an leer im DOM und bekommt erst dann Text (`Aktualisieren`: `role="status"`). Der Ladezustand einer Kachel ist `aria-busy`, nicht `aria-live`. | Eine bereits gefüllt eingefügte Region wird nicht vorgelesen; sechs ladende Kacheln, die gleichzeitig ansagen, sind Lärm (WCAG 4.1.3). | `Aktualisieren.tsx`, `Zustaende.tsx` |
| Ausklappzustand („Mehr zeigen“) steht mit `aria-expanded`/`aria-controls` am Knopf und bleibt über ein Neuladen (`useGespeicherterSchalter`). | WCAG 4.1.2; wer aufklappt, will es beim nächsten Mal nicht wieder tun. | `KennzahlenAnsicht.tsx`, `Top25Ansicht.tsx` |
| Unter `sm` sind die Kennzahlkarten ab der dritten einzeilig (Name links, Wert rechts, ohne Unterzeile). | Bei 320 px stünden sonst sechs volle Karten vor dem Chart (WCAG 1.4.10). | `VerlaufKennzahlen.tsx` |
| Die Zeitachse beschriftet Zeiträume bis 92 Tage mit Tag und Monat, längere mit Monat und Jahr. Entschieden wird nach Spannweite der Daten, nicht nach dem gewählten Zeitraum (YTD kann kurz oder lang sein). | Sonst tragen bei kurzen Zeiträumen alle Ticks dieselbe Beschriftung. | `format.ts` (`achsenDatumFormat`), `VerlaufChartGeruest.tsx` |

## Prüfung

- `test:e2e` fährt axe (`@axe-core/playwright`, Tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`,
  `wcag22aa`) gegen die fertig geladene Seite bei 1280 und 375 px in echtem Chromium mit der echten CSP —
  ohne `bypassCSP`, ohne externe Ressource [INV-11]. Es wird nichts ausgeschlossen. Mit offenem
  Menü, Popover und Dialog läuft axe zusätzlich auf der offenen Ebene allein: den Rest legt Radix
  unter `aria-hidden` und hinter die Fokusfalle.
- Daneben stehen dort die Prüfungen, die axe nicht kann: Sprunglink setzt den Fokus,
  bei 375 und 320 px kein waagerechter Überlauf (auch nicht in der Kennzahlenliste), kein fokussierbares
  Element unter der Blende der Kennzahlen, Fokusrückgabe des Dialogs, fokussierbare Top-25-Region.
- `eslint-plugin-jsx-a11y` kennt die ui-Komponenten über `settings['jsx-a11y'].components`
  (`Button` → `button`, `Table*` → `table`/`tr`/`th`/`td`).
- Die jsdom-Tests (`test/ui/`) fahren axe zusätzlich je Kachel; sie sehen aber kein Layout.
  Überlauf, Zielgrößen und verdeckten Fokus beweist nur der e2e-Lauf.

## Kontrast

Kontraste werden nicht einmal gemessen, sondern bei jeder Prüfung nachgerechnet:
`test/invarianten/kontrast.test.ts` liest die OKLCH-Werte aus `theme.css` (OKLab →
lineares sRGB → Luminanz, halbtransparente Tokens in sRGB auf `--color-grund` gelegt) und
prüft je Paarung aus `start/kontrast.ts` den Mindestwert: Text ≥ 4,5 : 1, Grafik und
Zustandsanzeige ≥ 3 : 1. Derselbe Test schlägt fehl, wenn die Tabelle nicht mehr
stimmt; `npm run kontrast` schreibt sie neu.

<!-- kontrast:anfang — erzeugt von `npm run kontrast` -->
| Vordergrund | Hintergrund | Verhältnis | Anforderung |
|---|---|---:|---|
| `--color-text` | `--color-grund` | 17,21 : 1 | Text ≥ 4,5 : 1 |
| `--color-text` | `--color-glas` | 16,24 : 1 | Text ≥ 4,5 : 1 |
| `--color-text` | `--color-flaeche` | 15,65 : 1 | Text ≥ 4,5 : 1 |
| `--color-text` | `--color-glas-hoch` | 16,34 : 1 | Text ≥ 4,5 : 1 |
| `--color-text` | `--color-bedien-aktiv` | 13,82 : 1 | Text ≥ 4,5 : 1 |
| `--color-text-leise` | `--color-grund` | 7,46 : 1 | Text ≥ 4,5 : 1 |
| `--color-text-leise` | `--color-glas` | 7,04 : 1 | Text ≥ 4,5 : 1 |
| `--color-text-leise` | `--color-flaeche` | 6,78 : 1 | Text ≥ 4,5 : 1 |
| `--color-text-leise` | `--color-glas-hoch` | 7,08 : 1 | Text ≥ 4,5 : 1 |
| `--color-text-leise` | `--color-bedien-aktiv` | 5,99 : 1 | Text ≥ 4,5 : 1 |
| `--color-gewinn` | `--color-glas` | 8,95 : 1 | Text ≥ 4,5 : 1 |
| `--color-gewinn` | `--color-glas-hoch` | 9,01 : 1 | Text ≥ 4,5 : 1 |
| `--color-verlust` | `--color-glas` | 6,52 : 1 | Text ≥ 4,5 : 1 |
| `--color-verlust` | `--color-glas-hoch` | 6,56 : 1 | Text ≥ 4,5 : 1 |
| `--color-warnung` | `--color-glas` | 10,41 : 1 | Text ≥ 4,5 : 1 |
| `--color-warnung` | `--color-glas-hoch` | 10,48 : 1 | Text ≥ 4,5 : 1 |
| `--color-text` | `--color-bedien` | 16,08 : 1 | Text ≥ 4,5 : 1 |
| `--color-gewinn` | `--color-grund` | 9,49 : 1 | Text ≥ 4,5 : 1 |
| `--color-verlust` | `--color-grund` | 6,91 : 1 | Text ≥ 4,5 : 1 |
| `--color-text` | `--color-rand-licht` | 9,76 : 1 | Badge ≥ 4,5 : 1 |
| `--color-grund` | `--color-chart-1` | 8,16 : 1 | Knopf ≥ 4,5 : 1 |
| `--color-fokus` | `--color-grund` | 10,84 : 1 | Fokusring ≥ 3 : 1 |
| `--color-fokus` | `--color-glas` | 10,23 : 1 | Fokusring ≥ 3 : 1 |
| `--color-fokus` | `--color-flaeche` | 9,86 : 1 | Fokusring ≥ 3 : 1 |
| `--color-fokus` | `--color-glas-hoch` | 10,30 : 1 | Fokusring ≥ 3 : 1 |
| `--color-fokus` | `--color-bedien` | 10,13 : 1 | Fokusring ≥ 3 : 1 |
| `--color-fokus` | `--color-bedien-aktiv` | 8,70 : 1 | Fokusring ≥ 3 : 1 |
| `--color-bedien-rand` | `--color-bedien` | 3,68 : 1 | Gewähltes Segment ≥ 3 : 1 |
| `--color-chart-1` | `--color-glas` | 7,70 : 1 | Grafik ≥ 3 : 1 |
| `--color-chart-2` | `--color-glas` | 7,06 : 1 | Grafik ≥ 3 : 1 |
| `--color-chart-3` | `--color-glas` | 9,92 : 1 | Grafik ≥ 3 : 1 |
| `--color-chart-4` | `--color-glas` | 7,09 : 1 | Grafik ≥ 3 : 1 |
| `--color-chart-5` | `--color-glas` | 9,92 : 1 | Grafik ≥ 3 : 1 |
| `--color-gewinn` | `--success-bg` | 8,09 : 1 | Toast ≥ 4,5 : 1 |
| `--color-text` | `--success-bg` | 14,68 : 1 | Toast ≥ 4,5 : 1 |
| `--color-warnung` | `--warning-bg` | 9,25 : 1 | Toast ≥ 4,5 : 1 |
| `--color-text` | `--warning-bg` | 14,43 : 1 | Toast ≥ 4,5 : 1 |
| `--color-verlust` | `--error-bg` | 5,91 : 1 | Toast ≥ 4,5 : 1 |
| `--color-text` | `--error-bg` | 14,73 : 1 | Toast ≥ 4,5 : 1 |
<!-- kontrast:ende -->

Das Farbfeld hinter dem Glas ([ADR-029](entscheidungen/ADR-029-liquid-glass-dezent.md)) hellt den Untergrund stellenweise um wenige Prozent auf
— am knappsten ist deshalb der Rand des gewählten Segments, gerechnet mit Luft über 3 : 1.
Gewinn und Verlust werden trotzdem nie allein über Farbe unterschieden: Vorzeichen und Pfeil
kommen immer dazu [`src/CLAUDE.md`], weil Kontrast keine Rotgrünschwäche ersetzt.

`axe-core`s automatische `color-contrast`-Prüfung ist in den jsdom-basierten Tests
(`test/ui/hilfen.tsx`) bewusst abgeschaltet — jsdom layoutet nicht. Im Browser liefert sie seit
der Lichtkante als `::before` fast nur „incomplete“. Der Token-Test schließt diese Lücke.
