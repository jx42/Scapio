/*
 * Gemeinsame Bausteine fuer Vertrags-Fixtures in den Kachel-Tests.
 *
 * `Drift` und die Kennzahl-Unionen (`XirrErgebnis` & Co.) aus `server/vertrag.ts`
 * verlangen jedes Feld einer Ausgangsart, auch die null-Felder auf dem gescheiterten
 * Zweig — von Hand wiederholt sich das in jeder Testdatei gleich unvollstaendig.
 */

import type {
  Drift,
  DriftStufe,
  Health,
  KennzahlenAntwort,
  MaxDrawdownErgebnis,
  SharpeErgebnis,
  UnternehmenZeile,
  VolatilitaetErgebnis,
  XirrErgebnis,
} from '@/lib/api';

export function drift(stufe: DriftStufe = 'ok', ueberschreibungen: Partial<Drift> = {}): Drift {
  return {
    stufe,
    abweichung: 0,
    cashAbweichung: 0,
    berechnetGesamtCent: 0,
    gemeldetGesamtCent: 0,
    grund: null,
    positionen: [],
    ...ueberschreibungen,
  };
}

export function xirrOk(rate: number, mehrdeutig = false): XirrErgebnis {
  return { art: 'ok', rate, mehrdeutig };
}

export function xirrOhne(art: Exclude<XirrErgebnis['art'], 'ok'>): XirrErgebnis {
  return { art, rate: null };
}

export function maxDrawdownOk(anteil: number, tagHoch: string, tagTief: string): MaxDrawdownErgebnis {
  return { art: 'ok', anteil, tagHoch, tagTief };
}

export function maxDrawdownOhne(art: Exclude<MaxDrawdownErgebnis['art'], 'ok'>): MaxDrawdownErgebnis {
  return { art, anteil: null, tagHoch: null, tagTief: null };
}

export function volatilitaetOk(proJahr: number, monate: number): VolatilitaetErgebnis {
  return { art: 'ok', proJahr, monate };
}

export function volatilitaetOhne(art: Exclude<VolatilitaetErgebnis['art'], 'ok'>): VolatilitaetErgebnis {
  return { art, proJahr: null, monate: null };
}

export function sharpeOk(wert: number, monate: number, zinsProJahr: number): SharpeErgebnis {
  return { art: 'ok', wert, monate, zinsProJahr };
}

export function sharpeOhne(art: Exclude<SharpeErgebnis['art'], 'ok'>): SharpeErgebnis {
  return { art, wert: null, monate: null, zinsProJahr: null };
}

export function realFixture(
  exakt: XirrErgebnis,
  ueberschreibungen: Partial<KennzahlenAntwort['real']> = {},
): KennzahlenAntwort['real'] {
  return {
    exakt,
    fisher: null,
    basisMonat: '2026-07',
    teuerungBisMonat: null,
    fortgeschriebeneMonate: [],
    teuerungLaufendesJahr: null,
    ...ueberschreibungen,
  };
}

/** Eine vollstaendige Antwort mit gueltigen Werten; Tests ueberschreiben nur, was sie pruefen. */
export function kennzahlenAntwort(ueberschreibungen: Partial<KennzahlenAntwort> = {}): KennzahlenAntwort {
  return {
    stand: '2026-08-26T12:08:00+02:00',
    drift: drift(),
    investiertCent: 28_759_296,
    kursgewinnCent: 9_046_241,
    kursgewinnProzent: 0.3145,
    realisiertCent: 0,
    zinsenCent: 12_345,
    steuernCent: 234_567,
    gebuehrenCent: 0,
    gesamtCent: 37_805_537,
    twr: 0.284,
    twrProJahr: 0.061,
    twrGrob: false,
    xirr: xirrOk(0.058),
    inflation: 0.021,
    real: realFixture(xirrOk(0.036), { fisher: 0.037, teuerungBisMonat: '2026-07' }),
    sparrateCent: 50_000,
    sparrate12Cent: 55_000,
    maxDrawdown: maxDrawdownOk(-0.152, '2026-02-15', '2026-03-20'),
    volatilitaetProJahr: volatilitaetOk(0.142, 18),
    sharpe: sharpeOk(0.85, 18, 0.023),
    hinweise: [],
    zinsenTransaktionen: [],
    steuernTransaktionen: [],
    gebuehrenTransaktionen: [],
    realisierteVerkaeufe: [],
    ...ueberschreibungen,
  };
}

export function unternehmenZeile(
  rang: number,
  ueberschreibungen: Partial<UnternehmenZeile> = {},
): UnternehmenZeile {
  return {
    rang,
    name: `Firma ${rang}`,
    isin: `TEST00000${String(rang).padStart(3, '0')}`,
    exposureCent: 1_000_00 * rang,
    anteilDepot: 0.01 * rang,
    ausFonds: [],
    sektor: null,
    land: null,
    ...ueberschreibungen,
  };
}

export function health(top25: boolean): Health {
  return {
    stand: '2026-08-26T12:08:00+02:00',
    drift: drift(),
    ok: true,
    version: '0.0.0-test',
    kernVersion: 1,
    top25,
    lauf: null,
  };
}
