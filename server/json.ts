/**
 * Die Serialisierungsgrenze. Hier — und nur hier — wird aus einem `bigint` eine JSON-Zahl.
 *
 * `bigint` ist nicht JSON-serialisierbar; `JSON.stringify` wirft darauf. Statt an jeder
 * Route ein `Number(...)` zu streuen, geht jeder Cent-Betrag durch `centAlsZahl`.
 *
 * ENTSCHEIDUNG (gilt fuer das gesamte Projekt): Cent-Werte gehen als **JSON-Zahl** ueber
 * die Leitung — nie als Zeichenkette, nie als Kommazahl in Euro. Der sichere
 * Ganzzahlbereich von JavaScript reicht bis 9.007.199.254.740.991 Cent, also rund
 * 90 Billionen Euro; ein privates Depot erreicht das nicht. Eine Zeichenkette haette das
 * Frontend zu einer eigenen Umwandlung gezwungen — genau die Stelle, an der
 * Rundungsfehler entstehen. Feldnamen behalten das Suffix `Cent`, damit im Browser nie
 * ein Zweifel an der Einheit entsteht. [INV-02]
 *
 * Die Bereichspruefung ist der eigentliche Grund, warum diese Funktion existiert: sie
 * wirft, statt still zu runden. Ein still gerundeter Kontostand ist schlimmer als ein
 * Fehler, den man sieht.
 *
 * Verhaeltniszahlen (`anteil`, `abweichung`, `gewinnProzent`, Renditen) sind kein Geld
 * und bleiben gewoehnliche Fliesskommazahlen.
 */

import type { Cent } from '../core/dezimal.ts';
import type { DriftErgebnis, Stufe } from '../core/drift.ts';
import type { Tag } from '../core/kalender.ts';
import type { MaxDrawdownErgebnis, SharpeErgebnis, VolatilitaetErgebnis } from '../core/risiko.ts';
import type { XirrErgebnis } from '../core/xirr.ts';

class SerialisierungsFehler extends Error {
  constructor(wert: bigint) {
    super(`Cent-Betrag ausserhalb des sicheren Ganzzahlbereichs: ${wert.toString(10)}`);
    this.name = 'SerialisierungsFehler';
  }
}

const OBERGRENZE = BigInt(Number.MAX_SAFE_INTEGER);
const UNTERGRENZE = -OBERGRENZE;

/** Cent als JSON-Zahl. Wirft, statt zu runden. */
export function centAlsZahl(c: Cent): number {
  if (c > OBERGRENZE || c < UNTERGRENZE) throw new SerialisierungsFehler(c);
  return Number(c);
}

/** Ein Kalendertag als schlichte Zeichenkette. Der Marker aus `core/kalender.ts` faellt weg. */
export function tagAlsText(t: Tag): string {
  return t;
}

/**
 * Ein Fliesskommawert, der die Leitung ueberleben muss.
 * `NaN` und `Infinity` haben in JSON keine Entsprechung — sie werden zu `null`,
 * statt als `null` beim Empfaenger zu ueberraschen oder die Antwort zu sprengen.
 */
export function zahlOderNull(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return Number.isFinite(v) ? v : null;
}

/**
 * `XirrErgebnis` ist eine Union — das Frontend soll den Grund sehen, warum keine Zahl
 * herauskam, statt eine stille Null zu bekommen. Die Union bleibt ueber die Leitung
 * erhalten: `art: 'ok'` traegt immer eine Zahl, jede andere `art` nie.
 */
export type XirrJson =
  | { readonly art: 'ok'; readonly rate: number; readonly mehrdeutig: boolean }
  | { readonly art: Exclude<XirrErgebnis['art'], 'ok'>; readonly rate: null };

export function xirrAlsJson(e: XirrErgebnis): XirrJson {
  if (e.art !== 'ok') return { art: e.art, rate: null };
  return { art: 'ok', rate: e.rate, mehrdeutig: e.mehrdeutig };
}

export type MaxDrawdownJson =
  | { readonly art: 'ok'; readonly anteil: number; readonly tagHoch: string; readonly tagTief: string }
  | { readonly art: Exclude<MaxDrawdownErgebnis['art'], 'ok'>; readonly anteil: null; readonly tagHoch: null; readonly tagTief: null };

export function maxDrawdownAlsJson(e: MaxDrawdownErgebnis): MaxDrawdownJson {
  if (e.art !== 'ok') return { art: e.art, anteil: null, tagHoch: null, tagTief: null };
  return { art: 'ok', anteil: e.anteil, tagHoch: tagAlsText(e.tagHoch), tagTief: tagAlsText(e.tagTief) };
}

export type VolatilitaetJson =
  | { readonly art: 'ok'; readonly proJahr: number; readonly monate: number }
  | { readonly art: Exclude<VolatilitaetErgebnis['art'], 'ok'>; readonly proJahr: null; readonly monate: null };

export function volatilitaetAlsJson(e: VolatilitaetErgebnis): VolatilitaetJson {
  if (e.art !== 'ok') return { art: e.art, proJahr: null, monate: null };
  return { art: 'ok', proJahr: e.proJahr, monate: e.monate };
}

export type SharpeJson =
  | { readonly art: 'ok'; readonly wert: number; readonly monate: number; readonly zinsProJahr: number }
  | {
      readonly art: Exclude<SharpeErgebnis['art'], 'ok'>;
      readonly wert: null;
      readonly monate: null;
      readonly zinsProJahr: null;
    };

export function sharpeAlsJson(e: SharpeErgebnis): SharpeJson {
  if (e.art !== 'ok') return { art: e.art, wert: null, monate: null, zinsProJahr: null };
  return { art: 'ok', wert: e.wert, monate: e.monate, zinsProJahr: e.zinsProJahr };
}

export type DriftJson = {
  readonly stufe: Stufe;
  readonly abweichung: number;
  readonly cashAbweichung: number;
  readonly berechnetGesamtCent: number;
  readonly gemeldetGesamtCent: number;
  readonly grund: string | null;
  readonly positionen: readonly {
    readonly isin: string;
    readonly berechnetCent: number;
    readonly gemeldetCent: number;
    readonly abweichung: number;
  }[];
};

export type Umschlag = {
  /** Zeitstempel des letzten erfolgreichen Laufs. `null`, solange es keinen gab. */
  readonly stand: string | null;
  readonly drift: DriftJson;
};

/**
 * Jede Antwort traegt `stand` und `drift` [§8]. `drift.stufe` ist das Signal, an dem
 * die Oberflaeche entscheidet, ob sie das Diagramm ueberhaupt zeigt: bei `abbruch`
 * sind die rekonstruierten Zahlen nicht vertrauenswuerdig und werden verborgen,
 * nicht beschoenigt.
 */
export function umschlagAus(stand: string | null, d: DriftErgebnis): Umschlag {
  return {
    stand,
    drift: {
      stufe: d.stufe,
      abweichung: zahlOderNull(d.abweichung) ?? 0,
      cashAbweichung: zahlOderNull(d.cashAbweichung) ?? 0,
      berechnetGesamtCent: centAlsZahl(d.berechnetGesamtCent),
      gemeldetGesamtCent: centAlsZahl(d.gemeldetGesamtCent),
      grund: d.grund,
      positionen: d.positionen.map((p) => ({
        isin: p.isin,
        berechnetCent: centAlsZahl(p.berechnetCent),
        gemeldetCent: centAlsZahl(p.gemeldetCent),
        abweichung: zahlOderNull(p.abweichung) ?? 0,
      })),
    },
  };
}

/**
 * JSON-Schema-Gegenstuecke zu den Typen oben, fuer `schema.response` an den Routen.
 *
 * Handgeschrieben statt generiert: das Projekt fuehrt dafuer keine weitere Abhaengigkeit
 * ein (kein zod-to-json-schema, kein typebox). Fastify serialisiert eine Antwort mit
 * `schema.response` ueber fast-json-stringify, das jedes Feld, das hier fehlt, still
 * verschweigt statt einen Fehler zu werfen. `objektSchema` bindet die Feldliste deshalb
 * an den Vertragstyp: fehlt ein Feld, scheitert der Typcheck, und `required` folgt aus
 * derselben Liste statt aus einer zweiten.
 */
export type SchemaFeld = { readonly [schluessel: string]: unknown };

type OptionaleSchluessel<T> = { [K in keyof T]-?: Record<never, never> extends Pick<T, K> ? K : never }[keyof T];

/** Die optionalen Felder eines Typs, als Pflichtliste: ein vergessenes scheitert am Typcheck. */
type OptionalListe<T> = [OptionaleSchluessel<T>] extends [never]
  ? []
  : [optional: { readonly [K in OptionaleSchluessel<T>]: true }];

export function objektSchema<T extends object>(
  felder: { readonly [K in keyof T]-?: SchemaFeld },
  ...[optional]: OptionalListe<T>
): {
  readonly type: 'object';
  readonly properties: { readonly [K in keyof T]-?: SchemaFeld };
  readonly required: readonly string[];
} {
  const frei: Readonly<Record<string, true>> = optional ?? {};
  return {
    type: 'object',
    properties: felder,
    required: Object.keys(felder).filter((k) => !(k in frei)),
  };
}

type AlleSchluessel<T> = T extends unknown ? keyof T : never;

/** Eine Union als ein Objekt fuer `objektSchema`: was nicht jede Variante traegt, wird optional. */
export type Vereinigt<T> = { readonly [K in keyof T]: unknown } & { readonly [K in Exclude<AlleSchluessel<T>, keyof T>]?: unknown };

/** `objektSchema` als `object | null` — fuer Felder, die `null` sein duerfen. */
export function oderNull<S extends SchemaFeld>(schema: S): S & { readonly type: readonly ['object', 'null'] } {
  return { ...schema, type: ['object', 'null'] };
}

export const xirrJsonSchema = objektSchema<Vereinigt<XirrJson>>(
  { art: { type: 'string' }, rate: { type: ['number', 'null'] }, mehrdeutig: { type: 'boolean' } },
  { mehrdeutig: true },
);

export const maxDrawdownJsonSchema = objektSchema<Vereinigt<MaxDrawdownJson>>({
  art: { type: 'string' },
  anteil: { type: ['number', 'null'] },
  tagHoch: { type: ['string', 'null'] },
  tagTief: { type: ['string', 'null'] },
});

export const volatilitaetJsonSchema = objektSchema<Vereinigt<VolatilitaetJson>>({
  art: { type: 'string' },
  proJahr: { type: ['number', 'null'] },
  monate: { type: ['number', 'null'] },
});

export const sharpeJsonSchema = objektSchema<Vereinigt<SharpeJson>>({
  art: { type: 'string' },
  wert: { type: ['number', 'null'] },
  monate: { type: ['number', 'null'] },
  zinsProJahr: { type: ['number', 'null'] },
});

const driftJsonSchema = objektSchema<DriftJson>({
  stufe: { type: 'string' },
  abweichung: { type: 'number' },
  cashAbweichung: { type: 'number' },
  berechnetGesamtCent: { type: 'number' },
  gemeldetGesamtCent: { type: 'number' },
  grund: { type: ['string', 'null'] },
  positionen: {
    type: 'array',
    items: objektSchema<DriftJson['positionen'][number]>({
      isin: { type: 'string' },
      berechnetCent: { type: 'number' },
      gemeldetCent: { type: 'number' },
      abweichung: { type: 'number' },
    }),
  },
});

/** Die zwei Felder, die jede Antwort traegt [§8] — zum Spreaden in die Feldliste der Route. */
export const umschlagSchemaEigenschaften = {
  stand: { type: ['string', 'null'] },
  drift: driftJsonSchema,
} satisfies { readonly [K in keyof Umschlag]-?: SchemaFeld };
