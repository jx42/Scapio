/**
 * Deflationierung und Realrendite.
 *
 * Angezeigt wird die exakte Rechnung: jeder Cashflow wird mit dem Verbraucherpreisindex
 * seines Monats auf heutige Kaufkraft hochgerechnet, danach laeuft dieselbe XIRR-Rechnung
 * ueber die deflationierten Betraege:
 *
 *   CF_real,i = CF_i × (VPI_heute / VPI_Monat(i))
 *   r_real    = XIRR(CF_real)
 *
 * Sie beruecksichtigt, dass eine Einzahlung von 2021 mehr Kaufkraft gekostet hat als eine
 * von 2026 — die Teuerung wirkt nur auf das Geld, das zu der Zeit angelegt war. Als Ersatz,
 * falls sie scheitert, steht die Fisher-Gleichung mit der durchschnittlichen Teuerung:
 *
 *   r_real = (1 + r_nominal) / (1 + Teuerung_p.a.) - 1
 *
 * Sie unterstellt, das ganze Kapital sei die ganze Zeit angelegt gewesen, und verzerrt
 * bei einem Sparplan zugunsten der fruehen Jahre. [P-05] [ADR-036]
 *
 * Fuer die Teuerung_p.a. zaehlt nur, wofuer der Verbraucherpreisindex tatsaechlich
 * vorliegt: das laufende Jahr geht erst mit hinein, sobald es eine echte Zahl hat.
 * Sonst wuerde eine angenommene Nullinflation fuer die fehlenden Monate den
 * Durchschnitt verwaessern. [P-05]
 *
 * Daneben steht `teuerungLaufendesJahr` — kein Rechenwert, sondern eine Einordnung: die
 * Teuerung_p.a. mittelt ueber die gesamte Anlagedauer und beantwortet damit nicht, wie hoch
 * die Inflation GERADE ist. Beide Zahlen kommen aus derselben Indexreihe.
 */

import type { Cent } from './dezimal.ts';
import { rundeAufCent } from './dezimal.ts';
import type { Tag } from './kalender.ts';
import { monatVon } from './kalender.ts';
import type { Fluss } from './typen.ts';
import type { XirrErgebnis } from './xirr.ts';
import { xirr } from './xirr.ts';

export type Vpi = ReadonlyMap<string, number>;

export type RealErgebnis = {
  /** Fisher-Gleichung (1+r)/(1+i)-1 — Ersatz, wenn `exakt` scheitert. null, wenn eine Groesse fehlt. */
  readonly fisher: number | null;
  /** XIRR ueber deflationierte Cashflows — die angezeigte reale Rendite. */
  readonly exakt: XirrErgebnis;
  /** Monat, auf dessen Kaufkraft die exakte Rechnung deflationiert hat. */
  readonly basisMonat: string;
  /** Jahresteuerung, annualisiert ueber die Monate mit echter VPI-Zahl. null ohne Daten. */
  readonly teuerungProJahr: number | null;
  /** Letzter Monat mit echter VPI-Zahl, auf dem `teuerungProJahr` beruht. null ohne Daten. */
  readonly teuerungBisMonat: string | null;
  /** Monate, fuer die der letzte bekannte Index fortgeschrieben wurde (nur die exakte Rechnung). */
  readonly fortgeschriebeneMonate: readonly string[];
  /** Durchschnittliche Teuerung der Monate des laufenden Jahres. Nur Anzeige. null ohne Daten. */
  readonly teuerungLaufendesJahr: number | null;
};

/**
 * Index eines Monats. Fehlt er, wird der letzte bekannte fortgeschrieben und der
 * Monat im Ergebnis vermerkt — eine Luecke in der Statistik ist kein Grund, die
 * Kennzahl wegzulassen, aber einer, sie zu kennzeichnen.
 */
function indexFuer(vpi: Vpi, monat: string, fortgeschrieben: string[]): number | null {
  const genau = vpi.get(monat);
  if (genau !== undefined) return genau;

  let bester: { monat: string; wert: number } | null = null;
  for (const [m, w] of vpi) {
    if (m > monat) continue;
    if (bester === null || m > bester.monat) bester = { monat: m, wert: w };
  }

  if (bester === null) {
    // Kein Index vor diesem Monat: der aelteste bekannte muss herhalten.
    let aeltester: { monat: string; wert: number } | null = null;
    for (const [m, w] of vpi) {
      if (aeltester === null || m < aeltester.monat) aeltester = { monat: m, wert: w };
    }
    if (aeltester === null) return null;
    fortgeschrieben.push(monat);
    return aeltester.wert;
  }

  fortgeschrieben.push(monat);
  return bester.wert;
}

/** Deflationiert eine Cashflow-Reihe auf die Kaufkraft des Basismonats. */
export function deflationiere(
  fluesse: readonly Fluss[],
  vpi: Vpi,
  basisMonat: string,
): { fluesse: Fluss[]; fortgeschriebeneMonate: string[] } {
  const fortgeschrieben: string[] = [];
  const basis = indexFuer(vpi, basisMonat, fortgeschrieben);
  if (basis === null || basis === 0) return { fluesse: [...fluesse], fortgeschriebeneMonate: fortgeschrieben };

  const umgerechnet = fluesse.map((f) => {
    const index = indexFuer(vpi, monatVon(f.tag), fortgeschrieben);
    if (index === null || index === 0) return f;
    // Faktor als Bruch in Ganzzahlen, damit die Rundung an einer Stelle bleibt.
    const zaehler = BigInt(Math.round(basis * 1_000_000));
    const nenner = BigInt(Math.round(index * 1_000_000));
    return { tag: f.tag, betrag: rundeAufCent(f.betrag * zaehler, nenner) as Cent };
  });

  return { fluesse: umgerechnet, fortgeschriebeneMonate: [...new Set(fortgeschrieben)].sort() };
}

/**
 * Reale Rendite.
 *
 * @param fluesse Cashflows aus Anlegersicht, inklusive Endwert — dieselbe Reihe,
 *                die auch in den nominalen XIRR geht.
 */
export function realeRendite(
  fluesse: readonly Fluss[],
  vpi: Vpi,
  heute: Tag,
  nominal?: XirrErgebnis,
): RealErgebnis {
  const basisMonat = monatVon(heute);

  if (vpi.size === 0) {
    return {
      exakt: { art: 'zu_wenige_fluesse' },
      fisher: null,
      basisMonat,
      teuerungProJahr: null,
      teuerungBisMonat: null,
      fortgeschriebeneMonate: [],
      teuerungLaufendesJahr: null,
    };
  }

  const { fluesse: real, fortgeschriebeneMonate } = deflationiere(fluesse, vpi, basisMonat);
  const exakt = xirr(real, heute);

  const teuerung = teuerungProJahr(fluesse, vpi, basisMonat);
  const teuerungBisMonat = teuerung === null ? null : letzterEchterMonat(vpi, basisMonat);
  const fisher =
    nominal !== undefined && nominal.art === 'ok' && teuerung !== null
      ? (1 + nominal.rate) / (1 + teuerung) - 1
      : null;

  return {
    exakt,
    fisher,
    basisMonat,
    teuerungProJahr: teuerung,
    teuerungBisMonat,
    fortgeschriebeneMonate,
    teuerungLaufendesJahr: teuerungLaufendesJahr(vpi, basisMonat),
  };
}

/** Letzter Monat, fuer den der Verbraucherpreisindex wirklich vorliegt — kein Fortschreiben. */
function letzterEchterMonat(vpi: Vpi, bis: string): string | null {
  let bester: string | null = null;
  for (const monat of vpi.keys()) {
    if (monat > bis) continue;
    if (bester === null || monat > bester) bester = monat;
  }
  return bester;
}

/**
 * Annualisierte Teuerung zwischen dem ersten Fluss — oder dem aeltesten VPI-Monat, falls
 * die Reihe spaeter beginnt [ADR-043] — und dem letzten Monat mit echter VPI-Zahl. Das laufende Jahr zaehlt erst mit, sobald es eine echte Zahl hat — ein
 * fortgeschriebener (angenommener) Indexwert wuerde den Durchschnitt sonst mit einer
 * unterstellten Nullinflation verwaessern.
 */
export function teuerungProJahr(fluesse: readonly Fluss[], vpi: Vpi, basisMonat: string): number | null {
  if (fluesse.length === 0) return null;

  let ersterMonat = monatVon(fluesse[0]!.tag);
  for (const f of fluesse) {
    const m = monatVon(f.tag);
    if (m < ersterMonat) ersterMonat = m;
  }
  const aeltester = [...vpi.keys()].sort()[0];
  if (aeltester !== undefined && aeltester > ersterMonat) ersterMonat = aeltester;

  const endeMonat = letzterEchterMonat(vpi, basisMonat);
  if (endeMonat === null) return null;

  const leer: string[] = [];
  const start = indexFuer(vpi, ersterMonat, leer);
  const ende = vpi.get(endeMonat) ?? null;
  if (start === null || ende === null || start <= 0) return null;

  const jahre =
    (Number(endeMonat.slice(0, 4)) - Number(ersterMonat.slice(0, 4))) +
    (Number(endeMonat.slice(5, 7)) - Number(ersterMonat.slice(5, 7))) / 12;

  if (jahre <= 0) return null;
  return Math.pow(ende / start, 1 / jahre) - 1;
}

/**
 * Durchschnittliche Teuerung der Monate des laufenden Jahres.
 *
 * Je Monat des laufenden Jahres, fuer den eine echte Zahl vorliegt, die Veraenderung zum
 * gleichen Monat des Vorjahres; daraus das arithmetische Mittel. Das ist die Zahl, die
 * gemeinhin "die Inflation" heisst.
 *
 * Bewusst der Vorjahresvergleich und nicht der Anstieg seit Dezember: der Warenkorb hat
 * einen Jahresrhythmus (Heizung, Urlaub, Schlussverkauf), und ein auf zwoelf Monate
 * hochgerechnetes Halbjahr misst vor allem diesen Rhythmus. Der Vorjahresvergleich stellt
 * Januar neben Januar und ist damit schon bereinigt.
 *
 * Bewusst das arithmetische und nicht das geometrische Mittel: gemittelt werden acht
 * Messungen DERSELBEN Groesse, nicht acht aufeinanderfolgende Wachstumsschritte.
 *
 * Fortgeschriebene Monate zaehlen nicht mit — wie bei `teuerungProJahr` wuerde eine
 * unterstellte Nullinflation den Durchschnitt nur verwaessern.
 */
export function teuerungLaufendesJahr(vpi: Vpi, basisMonat: string): number | null {
  const jahr = basisMonat.slice(0, 4);

  const raten: number[] = [];
  for (const [monat, wert] of vpi) {
    if (monat.slice(0, 4) !== jahr || monat > basisMonat) continue;
    const vorjahr = `${String(Number(jahr) - 1)}-${monat.slice(5, 7)}`;
    const davor = vpi.get(vorjahr);
    if (davor === undefined || davor <= 0 || wert <= 0) continue;
    raten.push(wert / davor - 1);
  }

  if (raten.length === 0) return null;
  return raten.reduce((a, b) => a + b, 0) / raten.length;
}
