/**
 * Rebalancing auf synthetischen Depots: Beispiele aus dem Plan und die Eigenschaften,
 * die fuer jedes Depot gelten muessen. [ADR-057]
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { verteileNachGroesstemRest } from '../../core/dezimal.ts';
import type { Cent } from '../../core/dezimal.ts';
import { BP_GANZ, KONTO, rebalanciere } from '../../core/rebalancing.ts';
import type { RebalancingErgebnis, Schluessel } from '../../core/rebalancing.ts';

const WELT = 'IE00B4L5Y983';
const EM = 'IE00BKM4GZ66';
const GOLD = 'IE00B579F325';

const ist = (e: Record<string, number>): Map<Schluessel, Cent> =>
  new Map(Object.entries(e).map(([k, v]) => [k, BigInt(v)]));
const ziel = (e: Record<string, number>): Map<Schluessel, number> => new Map(Object.entries(e));

function zeile(e: RebalancingErgebnis, s: Schluessel) {
  const z = e.zeilen.find((x) => x.schluessel === s);
  if (z === undefined) throw new Error(`Zeile ${s} fehlt`);
  return z;
}

const summeDelta = (e: RebalancingErgebnis): bigint => e.zeilen.reduce((s, z) => s + z.deltaCent, 0n);

describe('verteileNachGroesstemRest', () => {
  it('trifft die Summe genau und gibt den Rest den groessten Resten', () => {
    expect(verteileNachGroesstemRest([1n, 1n, 1n], 3n)).toEqual([1n, 0n, 0n]);
    expect(verteileNachGroesstemRest([10n, 25n, 65n], 10n)).toEqual([1n, 3n, 6n]);
  });
});

describe('rebalanciere mit Verkaeufen', () => {
  it('rechnet das Beispiel aus dem Plan', () => {
    const e = rebalanciere(
      ist({ [KONTO]: 120_000, [WELT]: 1_780_000, [EM]: 600_000 }),
      ziel({ [KONTO]: 0, [WELT]: 7000, [EM]: 3000 }),
      false,
    );
    expect(e.art).toBe('ok');
    expect(zeile(e, KONTO).deltaCent).toBe(-120_000n);
    expect(zeile(e, WELT).deltaCent).toBe(-30_000n);
    expect(zeile(e, EM).deltaCent).toBe(150_000n);
    expect(e.abstandDanachCent).toBe(0n);
  });

  it('verkauft eine gehaltene Position ohne Zielanteil ganz', () => {
    const e = rebalanciere(ist({ [WELT]: 50_000, [GOLD]: 50_000 }), ziel({ [WELT]: BP_GANZ }), false);
    expect(zeile(e, GOLD).deltaCent).toBe(-50_000n);
    expect(zeile(e, GOLD).zielBp).toBe(0);
  });

  it('nimmt eine Ziel-ISIN ausserhalb des Depots mit Ist 0 auf', () => {
    const e = rebalanciere(ist({ [WELT]: 100_000 }), ziel({ [WELT]: 8000, [GOLD]: 2000 }), false);
    expect(zeile(e, GOLD).istCent).toBe(0n);
    expect(zeile(e, GOLD).deltaCent).toBe(20_000n);
  });
});

describe('rebalanciere ohne Verkaeufe', () => {
  it('verteilt nur das Konto und laesst Uebergewichte stehen', () => {
    const e = rebalanciere(
      ist({ [KONTO]: 120_000, [WELT]: 1_780_000, [EM]: 600_000 }),
      ziel({ [KONTO]: 0, [WELT]: 7000, [EM]: 3000 }),
      true,
    );
    expect(zeile(e, KONTO).deltaCent).toBe(-120_000n);
    expect(zeile(e, WELT).deltaCent).toBe(0n);
    expect(zeile(e, EM).deltaCent).toBe(120_000n);
    expect(e.abstandDanachCent).toBe(30_000n);
  });

  it('fuellt mehrere Untergewichte auf dieselbe Hoehe', () => {
    // W = 100 000; Soll A 50 000, B 30 000, C 20 000. Ist A 50 000, B 10 000, C 0, Konto 40 000.
    const e = rebalanciere(
      ist({ [KONTO]: 40_000, A: 50_000, B: 10_000 }),
      ziel({ A: 5000, B: 3000, C: 2000 }),
      true,
    );
    expect(zeile(e, 'A').deltaCent).toBe(0n);
    expect(zeile(e, 'B').deltaCent).toBe(20_000n);
    expect(zeile(e, 'C').deltaCent).toBe(20_000n);
    expect(e.abstandDanachCent).toBe(0n);
  });

  it('kauft nichts, wenn das Konto leer ist', () => {
    const e = rebalanciere(ist({ [WELT]: 80_000, [EM]: 20_000 }), ziel({ [WELT]: 5000, [EM]: 5000 }), true);
    expect(e.zeilen.every((z) => z.deltaCent === 0n)).toBe(true);
    expect(e.abstandDanachCent).toBe(30_000n);
  });

  it('behaelt das Ziel-Cash auf dem Konto', () => {
    const e = rebalanciere(ist({ [KONTO]: 20_000, [WELT]: 80_000 }), ziel({ [KONTO]: 1000, [WELT]: 9000 }), true);
    expect(zeile(e, KONTO).deltaCent).toBe(-10_000n);
    expect(zeile(e, WELT).deltaCent).toBe(10_000n);
  });
});

describe('rebalanciere, Randfaelle', () => {
  it('meldet ein Ziel, das nicht 10 000 Basispunkte ergibt', () => {
    const e = rebalanciere(ist({ [WELT]: 100 }), ziel({ [WELT]: 9999 }), false);
    expect(e.art).toBe('zielUngueltig');
    expect(summeDelta(e)).toBe(0n);
  });

  it('meldet ein Depot ohne Wert', () => {
    expect(rebalanciere(new Map(), ziel({ [KONTO]: BP_GANZ }), false).art).toBe('ohneWert');
  });
});

/* ---------------------------------------------------------------- Eigenschaften */

const depot = fc
  .array(fc.record({ ist: fc.integer({ min: 0, max: 50_000_000 }), z: fc.integer({ min: 0, max: 100 }) }), {
    minLength: 1,
    maxLength: 8,
  })
  .chain((positionen) =>
    fc.record({
      positionen: fc.constant(positionen),
      konto: fc.integer({ min: 0, max: 5_000_000 }),
      kontoZ: fc.integer({ min: 0, max: 100 }),
      ohneVerkaeufe: fc.boolean(),
    }),
  )
  .filter((d) => d.konto + d.positionen.reduce((s, p) => s + p.ist, 0) > 0)
  .filter((d) => d.kontoZ + d.positionen.reduce((s, p) => s + p.z, 0) > 0);

/** Gewichte auf genau 10 000 Basispunkte gebracht, Rest an die erste Zeile. */
type Depot = typeof depot extends fc.Arbitrary<infer T> ? T : never;

function eingaben(d: Depot) {
  const roh = [d.kontoZ, ...d.positionen.map((p) => p.z)];
  const summeRoh = roh.reduce((s, z) => s + z, 0);
  const bp = roh.map((z) => Math.floor((z * BP_GANZ) / summeRoh));
  bp[roh.findIndex((z) => z > 0)]! += BP_GANZ - bp.reduce((s, z) => s + z, 0);
  const schluessel = [KONTO, ...d.positionen.map((_, i) => `XX${String(i).padStart(9, '0')}0`)];
  return {
    ist: new Map<Schluessel, Cent>(schluessel.map((s, i) => [s, BigInt(i === 0 ? d.konto : d.positionen[i - 1]!.ist)])),
    ziel: new Map<Schluessel, number>(schluessel.map((s, i) => [s, bp[i]!])),
  };
}

describe('rebalanciere, Eigenschaften', () => {
  it('Σ delta = 0', () => {
    fc.assert(
      fc.property(depot, (d) => {
        const { ist: i, ziel: z } = eingaben(d);
        expect(summeDelta(rebalanciere(i, z, d.ohneVerkaeufe))).toBe(0n);
      }),
    );
  });

  it('ohne Verkaeufe ist kein Positionsdelta negativ und kein Kauf ueber dem Soll', () => {
    fc.assert(
      fc.property(depot, (d) => {
        const { ist: i, ziel: z } = eingaben(d);
        const e = rebalanciere(i, z, true);
        for (const zl of e.zeilen) {
          if (zl.schluessel === KONTO) continue;
          expect(zl.deltaCent >= 0n).toBe(true);
          if (zl.deltaCent > 0n) expect(zl.danachCent <= zl.sollCent + 1n).toBe(true);
        }
      }),
    );
  });

  it('ein Depot auf dem Ziel ergibt 0', () => {
    fc.assert(
      fc.property(depot, (d) => {
        const { ist: i, ziel: z } = eingaben(d);
        const erst = rebalanciere(i, z, false);
        const danach = new Map(erst.zeilen.map((zl) => [zl.schluessel, zl.danachCent]));
        const zweit = rebalanciere(danach, z, d.ohneVerkaeufe);
        expect(zweit.zeilen.every((zl) => zl.deltaCent === 0n)).toBe(true);
      }),
    );
  });

  it('ein Depot auf dem Ziel ergibt 0, auch wenn sich die Reihenfolge der Werte aendert', () => {
    // Gefundenes Gegenbeispiel: Gleichstand beim Rest, nach dem Umschichten andere Reihenfolge.
    const d: Depot = {
      positionen: [{ ist: 48631326, z: 98 }, { ist: 12279906, z: 0 }, { ist: 4712015, z: 71 }, { ist: 4798399, z: 1 }],
      konto: 1409274,
      kontoZ: 30,
      ohneVerkaeufe: false,
    };
    const { ist: i, ziel: z } = eingaben(d);
    const danach = new Map(rebalanciere(i, z, false).zeilen.map((zl) => [zl.schluessel, zl.danachCent]));
    expect(rebalanciere(danach, z, false).zeilen.map((zl) => zl.deltaCent)).toEqual([0n, 0n, 0n, 0n, 0n]);
  });

  it('mit Verkaeufen liegt jede Zeile hoechstens 1 Cent neben dem exakten Soll', () => {
    fc.assert(
      fc.property(depot, (d) => {
        const { ist: i, ziel: z } = eingaben(d);
        const e = rebalanciere(i, z, false);
        for (const zl of e.zeilen) {
          const exakt = e.gesamtCent * BigInt(zl.zielBp);
          const abweichung = zl.danachCent * BigInt(BP_GANZ) - exakt;
          expect(abweichung < BigInt(BP_GANZ) && abweichung > -BigInt(BP_GANZ)).toBe(true);
        }
      }),
    );
  });

  it('haengt nicht von der Reihenfolge der Eingabe ab', () => {
    fc.assert(
      fc.property(depot, (d) => {
        const { ist: i, ziel: z } = eingaben(d);
        const vorwaerts = rebalanciere(i, z, d.ohneVerkaeufe);
        const rueckwaerts = rebalanciere(new Map([...i].reverse()), new Map([...z].reverse()), d.ohneVerkaeufe);
        expect(rueckwaerts).toEqual(vorwaerts);
      }),
    );
  });
});
