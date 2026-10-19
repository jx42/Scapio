# Oberfläche

Sechs Kacheln, eine Seite, dunkel, dicht. Rendert nur — gerechnet wird in `core/`.

## Regeln
- Kein `style`-Attribut. Ausnahmen: `<Balken>` (`--anteil`), `<ChartRahmen>`
  (`--chart-hoehe`) und `<Kachel>` (`--kachel-hoehe`), alle mit begründetem
  eslint-disable. [INV-05]
- Kein Hex-Wert, keine Farbe, kein px-Literal in einer Komponente, keine Tailwind-Standardpalette
  (sie ist abgeschaltet). Tokens aus `styles/theme.css`, Maße der Charts aus `lib/chartmasse.ts`.
- Kein `dangerouslySetInnerHTML`, kein Fremdtext in `href`. [INV-06] Ausnahme: geprüfte ISIN
  zu onvista, feste Adressen im Footer (EZB, Eurostat, Scalable Capital, Repository) und im Demo-Band —
  geschlossene Liste, siehe ADR-021, ADR-022 und ADR-052.
- Formatierung ausschließlich über `lib/format.ts`, Texte aus `i18n/de.ts` — auch Doppelpunkt
  und Klammern (`de.satz`).
- Ansichtskomponenten holen keine Daten. Container (`*Kachel.tsx`) holen sie, rechnen aber ebenfalls
  nicht — jede Summe kommt fertig aus `core/` bzw. der API.
- Jede Kachel benutzt `<Kachel>` und erbt damit ihre drei Zustände (`kachelZustand` in `lib/api.ts`) und die ErrorBoundary.
- Charts nur über `<ChartRahmen>` — sonst fehlt die Alternative für Screenreader.
- Gewinn und Verlust nie allein über Farbe: Vorzeichen und Pfeil dazu, über `richtungswert()`
  aus `lib/format.ts`. Chart- und Richtungsfarben aus `lib/farben.ts`, Links über `linkVariants`
  bzw. `Button variant="link"`.

## Barrierefreiheit
- Nie `aria-hidden` über Fokussierbarem; ein `aria-hidden`-SVG bekommt `rootTabIndex={-1}`.
- Nichts Fokussierbares hinter einer Maske oder Blende: `invisible` oder `inert` (Tabelle: `innen`).
- Live-Regionen stehen leer im DOM und bekommen erst dann Text; nie gefüllt einfügen.
- Reduzierte Bewegung schaltet `theme.css` global ab; eine neue Animation außerhalb von CSS-Übergängen braucht `motion-safe:`.
- Klickziele mindestens 24 × 24 px (`min-h-6`), außer den onvista-Badges; Sprungziele mit `tabIndex={-1}`.
- Kein Überlauf bei 375 px: Grids mit `grid-cols-1`, nicht mit impliziter `auto`-Spalte.
- Ein Chart-Tabellenalternative hat die Auflösung des Fensters, nicht der Reihe.
- Fehlerzustand mit `role="alert"`; Erklärungen als Popover (`InfoKnopf`), kein Tooltip (es gibt keinen).
- Neues Farb-Token: Paarung in `start/kontrast.ts` eintragen, dann `npm run kontrast`.
- `test:e2e` fährt axe gegen die echte Seite und muss ohne Verstoß laufen. Gründe und Details:
  [`docs/BARRIEREFREIHEIT.md`](../docs/BARRIEREFREIHEIT.md).
