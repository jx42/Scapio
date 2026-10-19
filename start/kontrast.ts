/**
 * Kontraste der Farb-Tokens aus `src/styles/theme.css` und das Skript, das die Tabelle in
 * `docs/BARRIEREFREIHEIT.md` schreibt.
 *
 * axe misst seit der Glas-Darstellung (ADR-029) keinen Textkontrast mehr — die Lichtkante
 * als `::before` macht fast jeden Knoten „incomplete“, jsdom layoutet ohnehin nicht. Also
 * wird aus den Tokens gerechnet: OKLCH → OKLab → lineares sRGB → Luminanz, halbtransparente
 * Tokens in sRGB ueber ihren Untergrund gelegt, wie der Browser es tut.
 * `test/invarianten/kontrast.test.ts` prueft die Mindestwerte und dass die Tabelle aktuell ist;
 * `npm run kontrast` schreibt sie neu.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = fileURLToPath(new URL('../', import.meta.url)).replace(/[/\\]$/, '');
export const THEME_DATEI = join(WURZEL, 'src', 'styles', 'theme.css');
export const DOKUMENT_DATEI = join(WURZEL, 'docs', 'BARRIEREFREIHEIT.md');
const TABELLE_ANFANG = '<!-- kontrast:anfang — erzeugt von `npm run kontrast` -->';
const TABELLE_ENDE = '<!-- kontrast:ende -->';

type Rgba = { r: number; g: number; b: number; a: number };

/** Alle `--color-*: oklch(…)` aus theme.css; Tokens mit `color-mix`/`var` fehlen bewusst. */
export function tokens(css: string): Map<string, Rgba> {
  const ergebnis = new Map<string, Rgba>();
  for (const treffer of css.matchAll(/--color-([\w-]+):\s*oklch\(([^)]*)\)/g)) {
    const [werte = '', alpha] = (treffer[2] ?? '').split('/');
    const [l = 0, c = 0, h = 0] = werte.trim().split(/\s+/).map(Number);
    ergebnis.set(treffer[1] ?? '', { ...oklchZuSrgb(l, c, h), a: alpha === undefined ? 1 : Number(alpha) });
  }
  return ergebnis;
}

/** OKLCH → gamma-kodiertes sRGB, 0…1, auf den Farbraum beschnitten. */
function oklchZuSrgb(l: number, c: number, h: number): Omit<Rgba, 'a'> {
  const winkel = (h * Math.PI) / 180;
  return oklabZuSrgb(l, c * Math.cos(winkel), c * Math.sin(winkel));
}

/** Die Rohwerte eines Tokens in OKLab, fuer `color-mix(in oklab, …)`. */
function oklab(css: string, name: string): { l: number; a: number; b: number } {
  const treffer = new RegExp(`--color-${name}:\\s*oklch\\(([^)/]*)\\)`).exec(css);
  if (treffer === null) throw new Error(`theme.css: --color-${name} fehlt oder ist nicht deckend`);
  const [l = 0, c = 0, h = 0] = (treffer[1] ?? '').trim().split(/\s+/).map(Number);
  const winkel = (h * Math.PI) / 180;
  return { l, a: c * Math.cos(winkel), b: c * Math.sin(winkel) };
}

/** `color-mix(in oklab, <farbe> <anteil>, <rest>)` fuer zwei deckende Tokens. */
function mischeOklab(css: string, farbe: string, anteil: number, rest: string): Rgba {
  const [v, h] = [oklab(css, farbe), oklab(css, rest)];
  const m = (x: number, y: number): number => x * anteil + y * (1 - anteil);
  return { ...oklabZuSrgb(m(v.l, h.l), m(v.a, h.a), m(v.b, h.b)), a: 1 };
}

function oklabZuSrgb(l: number, a: number, b: number): Omit<Rgba, 'a'> {
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ].map((kanal) => Math.min(1, Math.max(0, kanal)));
  const [r = 0, g = 0, bl = 0] = linear.map((kanal) =>
    kanal <= 0.0031308 ? 12.92 * kanal : 1.055 * kanal ** (1 / 2.4) - 0.055,
  );
  return { r, g, b: bl };
}

function ueber(vorne: Rgba, hinten: Rgba): Rgba {
  const mische = (v: number, h: number): number => v * vorne.a + h * (1 - vorne.a);
  return { r: mische(vorne.r, hinten.r), g: mische(vorne.g, hinten.g), b: mische(vorne.b, hinten.b), a: 1 };
}

function luminanz({ r, g, b }: Rgba): number {
  const lin = (k: number): number => (k <= 0.04045 ? k / 12.92 : ((k + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function verhaeltnis(a: Rgba, b: Rgba): number {
  const [hell, dunkel] = [luminanz(a), luminanz(b)].sort((x, y) => y - x) as [number, number];
  return (hell + 0.05) / (dunkel + 0.05);
}

/**
 * Untergruende, jeweils auf `grund` gelegt. Das Farbfeld hinter dem Glas (ADR-029) hellt
 * stellenweise um wenige Prozent auf; die Mindestwerte haben dafuer Luft.
 */
type Untergrund =
  | 'grund'
  | 'flaeche'
  | 'glas'
  | 'glas-hoch'
  | 'bedien'
  | 'bedien-aktiv'
  | 'rand-licht'
  | 'chart-1'
  | ToastFlaeche;

/**
 * Die Toast-Flaechen aus theme.css (`--success-bg` usw.) sind `color-mix` und keine Tokens;
 * hier mit denselben Anteilen nachgebaut. Aendert sich ein Anteil dort, muss er hier mit.
 */
const TOAST_FLAECHEN = {
  'toast-erfolg': { farbe: 'gewinn', anteil: 0.14, variable: '--success-bg' },
  'toast-warnung': { farbe: 'warnung', anteil: 0.14, variable: '--warning-bg' },
  'toast-fehler': { farbe: 'verlust', anteil: 0.16, variable: '--error-bg' },
} as const;
type ToastFlaeche = keyof typeof TOAST_FLAECHEN;

export type Paarung = {
  readonly vorne: string;
  readonly hinten: Untergrund;
  /** WCAG: Text 4,5, Grafik und Zustandsanzeige 3. */
  readonly mindestens: 4.5 | 3;
  readonly wofuer: string;
};

const PAARUNGEN: readonly Paarung[] = [
  ...(['grund', 'glas', 'flaeche', 'glas-hoch', 'bedien-aktiv'] as const).map(
    (hinten): Paarung => ({ vorne: 'text', hinten, mindestens: 4.5, wofuer: 'Text' }),
  ),
  ...(['grund', 'glas', 'flaeche', 'glas-hoch', 'bedien-aktiv'] as const).map(
    (hinten): Paarung => ({ vorne: 'text-leise', hinten, mindestens: 4.5, wofuer: 'Text' }),
  ),
  ...(['gewinn', 'verlust', 'warnung'] as const).flatMap((vorne) =>
    (['glas', 'glas-hoch'] as const).map((hinten): Paarung => ({ vorne, hinten, mindestens: 4.5, wofuer: 'Text' })),
  ),
  { vorne: 'text', hinten: 'bedien', mindestens: 4.5, wofuer: 'Text' },
  ...(['gewinn', 'verlust'] as const).map(
    (vorne): Paarung => ({ vorne, hinten: 'grund', mindestens: 4.5, wofuer: 'Text' }),
  ),
  { vorne: 'text', hinten: 'rand-licht', mindestens: 4.5, wofuer: 'Badge' },
  { vorne: 'grund', hinten: 'chart-1', mindestens: 4.5, wofuer: 'Knopf' },
  { vorne: 'fokus', hinten: 'grund', mindestens: 3, wofuer: 'Fokusring' },
  ...(['glas', 'flaeche', 'glas-hoch', 'bedien', 'bedien-aktiv'] as const).map(
    (hinten): Paarung => ({ vorne: 'fokus', hinten, mindestens: 3, wofuer: 'Fokusring' }),
  ),
  { vorne: 'bedien-rand', hinten: 'bedien', mindestens: 3, wofuer: 'Gewähltes Segment' },
  ...(['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'] as const).map(
    (vorne): Paarung => ({ vorne, hinten: 'glas', mindestens: 3, wofuer: 'Grafik' }),
  ),
  ...(Object.entries(TOAST_FLAECHEN) as [ToastFlaeche, (typeof TOAST_FLAECHEN)[ToastFlaeche]][]).flatMap(
    ([hinten, { farbe }]): Paarung[] => [
      { vorne: farbe, hinten, mindestens: 4.5, wofuer: 'Toast' },
      { vorne: 'text', hinten, mindestens: 4.5, wofuer: 'Toast' },
    ],
  ),
];

export function messe(css: string): { paarung: Paarung; wert: number }[] {
  const farben = tokens(css);
  const grund = farben.get('grund');
  if (grund === undefined) throw new Error('theme.css: --color-grund fehlt');
  const farbe = (name: string, hinten: Rgba): Rgba => {
    const token = farben.get(name);
    if (token === undefined) throw new Error(`theme.css: --color-${name} fehlt oder ist kein oklch()`);
    return ueber(token, hinten);
  };
  const untergrund = (name: Untergrund): Rgba => {
    if (name in TOAST_FLAECHEN) {
      const { farbe: vorne, anteil } = TOAST_FLAECHEN[name as ToastFlaeche];
      return mischeOklab(css, vorne, anteil, 'grund');
    }
    return farbe(name, grund);
  };
  return PAARUNGEN.map((paarung) => {
    const hinten = untergrund(paarung.hinten);
    return { paarung, wert: verhaeltnis(farbe(paarung.vorne, hinten), hinten) };
  });
}

const zahl = (wert: number): string => wert.toFixed(2).replace('.', ',');

export function tabelle(css: string): string {
  const zeilen = messe(css).map(
    ({ paarung, wert }) =>
      `| \`--color-${paarung.vorne}\` | \`${paarung.hinten in TOAST_FLAECHEN ? TOAST_FLAECHEN[paarung.hinten as ToastFlaeche].variable : `--color-${paarung.hinten}`}\` | ${zahl(wert)} : 1 | ${paarung.wofuer} ≥ ${zahl(paarung.mindestens).replace(/,00$/, '').replace(/,50$/, ',5')} : 1 |`,
  );
  return [
    TABELLE_ANFANG,
    '| Vordergrund | Hintergrund | Verhältnis | Anforderung |',
    '|---|---|---:|---|',
    ...zeilen,
    TABELLE_ENDE,
  ].join('\n');
}

/** Der Abschnitt zwischen den Markern in BARRIEREFREIHEIT.md, oder `null`, wenn sie fehlen. */
export function tabelleImDokument(dokument: string): string | null {
  const anfang = dokument.indexOf(TABELLE_ANFANG);
  const ende = dokument.indexOf(TABELLE_ENDE);
  return anfang === -1 || ende === -1 ? null : dokument.slice(anfang, ende + TABELLE_ENDE.length);
}

function haupt(): void {
  const dokument = readFileSync(DOKUMENT_DATEI, 'utf8');
  const alt = tabelleImDokument(dokument);
  if (alt === null) throw new Error(`docs/BARRIEREFREIHEIT.md: Marker ${TABELLE_ANFANG} fehlt`);
  writeFileSync(DOKUMENT_DATEI, dokument.replace(alt, tabelle(readFileSync(THEME_DATEI, 'utf8'))));
  process.stdout.write('docs/BARRIEREFREIHEIT.md: Kontrasttabelle neu geschrieben.\n');
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) haupt();
