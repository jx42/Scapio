/**
 * Tageslogik. Ein Kalendertag ist `YYYY-MM-DD` in Europe/Berlin. [INV-03]
 *
 * `toISOString().slice(0,10)` ist verboten: zwischen Mitternacht und zwei Uhr morgens
 * liefert es den Vortag, und zwar lautlos. Tagesarithmetik laeuft auf dem Kalender,
 * nicht auf Millisekunden — ein Tag ist nicht 86.400.000, zweimal im Jahr nicht.
 *
 * `tagAus` konstruiert dafuer ein `Date` aus dem UEBERGEBENEN Zeitstempel, nur um es an
 * `Intl.DateTimeFormat` zu reichen (Bauanleitung §7.2) — das liest keine Uhr, sondern
 * parst einen Parameter. Verboten bleibt `Date.now()` und `new Date()` ohne Argument;
 * der heutige Tag kommt immer von aussen, nie vom System. [INV-04]
 */

export const ZEITZONE = 'Europe/Berlin';

/** `YYYY-MM-DD` in Europe/Berlin. Der Marker verhindert, dass eine beliebige Zeichenkette durchrutscht. */
export type Tag = string & { readonly __tag: unique symbol };

const TAG_MUSTER = /^(\d{4})-(\d{2})-(\d{2})$/;

const berlin = new Intl.DateTimeFormat('sv-SE', {
  timeZone: ZEITZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export class KalenderFehler extends Error {
  constructor(eingabe: string, grund: string) {
    super(`Tag nicht lesbar (${grund}): ${JSON.stringify(eingabe)}`);
    this.name = 'KalenderFehler';
  }
}

/**
 * Prueft eine bereits im Tagesformat vorliegende Zeichenkette und macht sie zum `Tag`.
 * Fuer ISO-Zeitstempel mit Uhrzeit ist `tagAus` zustaendig.
 */
export function alsTag(text: string): Tag {
  const treffer = TAG_MUSTER.exec(text);
  if (treffer === null) throw new KalenderFehler(text, 'nicht YYYY-MM-DD');

  const [, j = '', m = '', d = ''] = treffer;
  const jahr = Number(j);
  const monat = Number(m);
  const tag = Number(d);
  if (monat < 1 || monat > 12) throw new KalenderFehler(text, 'Monat ausserhalb 1..12');
  if (tag < 1 || tag > tageImMonat(jahr, monat)) throw new KalenderFehler(text, 'Tag gibt es nicht');

  return text as Tag;
}

/**
 * Berliner Kalendertag eines ISO-Zeitstempels.
 * `sv-SE` formatiert bereits im ISO-Format — das spart eine eigene Formatierung.
 */
export function tagAus(iso: string): Tag {
  const kurz = TAG_MUSTER.exec(iso.trim());
  if (kurz !== null) return alsTag(iso.trim());

  const zeitpunkt = new Date(iso);
  if (Number.isNaN(zeitpunkt.getTime())) throw new KalenderFehler(iso, 'kein Zeitstempel');
  return alsTag(berlin.format(zeitpunkt));
}

function istSchaltjahr(jahr: number): boolean {
  return (jahr % 4 === 0 && jahr % 100 !== 0) || jahr % 400 === 0;
}

const LAENGEN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export function tageImMonat(jahr: number, monat: number): number {
  if (monat === 2 && istSchaltjahr(jahr)) return 29;
  return LAENGEN[monat - 1] ?? 31;
}

function teile(t: Tag): { jahr: number; monat: number; tag: number } {
  const treffer = TAG_MUSTER.exec(t)!;
  return { jahr: Number(treffer[1]), monat: Number(treffer[2]), tag: Number(treffer[3]) };
}

function baue(jahr: number, monat: number, tag: number): Tag {
  const j = String(jahr).padStart(4, '0');
  const m = String(monat).padStart(2, '0');
  const d = String(tag).padStart(2, '0');
  return `${j}-${m}-${d}` as Tag;
}

/**
 * Tageszahl seit einer festen Epoche (1970-01-01), rein auf dem Kalender gerechnet.
 * Kein `Date`, keine Millisekunden, keine Zeitumstellung.
 */
function zuTageszahl(t: Tag): number {
  const { jahr, monat, tag } = teile(t);
  // Howard Hinnants days_from_civil — exakt in Ganzzahlarithmetik.
  const j = monat <= 2 ? jahr - 1 : jahr;
  const aera = Math.floor(j / 400);
  const jahrInAera = j - aera * 400;
  const tagImJahr = Math.floor((153 * (monat + (monat > 2 ? -3 : 9)) + 2) / 5) + tag - 1;
  const tagInAera = jahrInAera * 365 + Math.floor(jahrInAera / 4) - Math.floor(jahrInAera / 100) + tagImJahr;
  return aera * 146097 + tagInAera - 719468;
}

function ausTageszahl(z: number): Tag {
  const verschoben = z + 719468;
  const aera = Math.floor(verschoben / 146097);
  const tagInAera = verschoben - aera * 146097;
  const jahrInAera = Math.floor(
    (tagInAera - Math.floor(tagInAera / 1460) + Math.floor(tagInAera / 36524) - Math.floor(tagInAera / 146096)) / 365,
  );
  const j = jahrInAera + aera * 400;
  const tagImJahr = tagInAera - (365 * jahrInAera + Math.floor(jahrInAera / 4) - Math.floor(jahrInAera / 100));
  const mp = Math.floor((5 * tagImJahr + 2) / 153);
  const tag = tagImJahr - Math.floor((153 * mp + 2) / 5) + 1;
  const monat = mp + (mp < 10 ? 3 : -9);
  return baue(monat <= 2 ? j + 1 : j, monat, tag);
}

export function plusTage(t: Tag, n: number): Tag {
  return ausTageszahl(zuTageszahl(t) + n);
}

export function tageZwischen(a: Tag, b: Tag): number {
  return zuTageszahl(b) - zuTageszahl(a);
}

// Generisch statt auf Tag beschraenkt: derselbe Drei-Wege-Vergleich wird auch fuer
// ISIN, Zeitstempel und Cent-Betraege als Sortier-Kriterium gebraucht.
export function vergleiche<T extends string | number | bigint>(a: T, b: T): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function istVor(a: Tag, b: Tag): boolean {
  return a < b;
}

export function frueher(a: Tag, b: Tag): Tag {
  return a <= b ? a : b;
}

export function spaeter(a: Tag, b: Tag): Tag {
  return a >= b ? a : b;
}

/** Alle Tage von `von` bis `bis`, beide einschliesslich. */
export function spanne(von: Tag, bis: Tag): Tag[] {
  const tage: Tag[] = [];
  const ende = zuTageszahl(bis);
  for (let z = zuTageszahl(von); z <= ende; z += 1) tage.push(ausTageszahl(z));
  return tage;
}

/** `YYYY-MM` — der Monat, in dem der Tag liegt. */
export function monatVon(t: Tag): string {
  return t.slice(0, 7);
}

/** Erster Tag eines `YYYY-MM`. */
export function monatsAnfang(monat: string): Tag {
  return alsTag(`${monat}-01`);
}

/** Letzter Tag eines `YYYY-MM`. */
export function monatsEnde(monat: string): Tag {
  const jahr = Number(monat.slice(0, 4));
  const m = Number(monat.slice(5, 7));
  return baue(jahr, m, tageImMonat(jahr, m));
}

/** Alle Monate von `von` bis `bis`, beide einschliesslich, als `YYYY-MM`. */
export function monatsSpanne(von: string, bis: string): string[] {
  const monate: string[] = [];
  let jahr = Number(von.slice(0, 4));
  let monat = Number(von.slice(5, 7));
  while (`${String(jahr).padStart(4, '0')}-${String(monat).padStart(2, '0')}` <= bis) {
    monate.push(`${String(jahr).padStart(4, '0')}-${String(monat).padStart(2, '0')}`);
    monat += 1;
    if (monat > 12) {
      monat = 1;
      jahr += 1;
    }
  }
  return monate;
}

/** Monate zwischen zwei `YYYY-MM`, als Differenz. */
export function monateZwischen(von: string, bis: string): number {
  const jv = Number(von.slice(0, 4));
  const mv = Number(von.slice(5, 7));
  const jb = Number(bis.slice(0, 4));
  const mb = Number(bis.slice(5, 7));
  return (jb - jv) * 12 + (mb - mv);
}

/** Samstag oder Sonntag? Nur fuer Erklaerungen an der Oberflaeche, nie fuer Rechenwege. */
export function istWochenende(t: Tag): boolean {
  const wochentag = ((zuTageszahl(t) % 7) + 7 + 4) % 7; // 1970-01-01 war ein Donnerstag
  return wochentag === 0 || wochentag === 6;
}
