/**
 * Sechs Saetze ueber zufaellig erzeugte Eingaben.
 *
 * Sie pruefen nicht Beispiele, sondern Gesetze: was gelten muss, egal welche Zahlen
 * kommen. `fc.assert` verkleinert jeden Fehlschlag auf das kleinste Gegenbeispiel und
 * nennt den `seed` — damit ist auch ein zufaelliger Fehlschlag wiederholbar.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { rundeAufCent, summe, wert } from '../../core/dezimal.ts';
import type { Cent, KursE6, MengeE8 } from '../../core/dezimal.ts';
import { fifo } from '../../core/fifo.ts';
import { ausgeglicheneUebertraege } from '../../core/uebertraege.ts';
import { plusTage } from '../../core/kalender.ts';
import type { Tag } from '../../core/kalender.ts';
import { twr } from '../../core/twr.ts';
import type { Fluss, Tx } from '../../core/typen.ts';
import { TAGE_IM_JAHR, xirr } from '../../core/xirr.ts';
import { T, WELT, depotTag, tx } from '../hilfen.ts';

const LAEUFE = { numRuns: 300 };

/** Ein Cashflow-Muster: eine Einzahlung, ein bis fuenf Nachzahlungen, ein Endwert. */
const flussMuster = fc
  .record({
    start: fc.integer({ min: 10_000, max: 1_000_000 }),
    weitere: fc.array(fc.record({ tage: fc.integer({ min: 1, max: 900 }), betrag: fc.integer({ min: 1_000, max: 500_000 }) }), {
      minLength: 0,
      maxLength: 5,
    }),
    endTage: fc.integer({ min: 400, max: 1500 }),
    faktor: fc.double({ min: 1.05, max: 3, noNaN: true }),
  })
  .map(({ start, weitere, endTage, faktor }) => {
    const anfang = T('2020-01-01');
    const fluesse: Fluss[] = [{ tag: anfang, betrag: BigInt(-start) as Cent }];
    let eingezahlt = start;
    for (const w of weitere) {
      if (w.tage >= endTage) continue;
      fluesse.push({ tag: plusTage(anfang, w.tage), betrag: BigInt(-w.betrag) as Cent });
      eingezahlt += w.betrag;
    }
    const ende = plusTage(anfang, endTage);
    fluesse.push({ tag: ende, betrag: BigInt(Math.round(eingezahlt * faktor)) as Cent });
    return { fluesse, ende };
  });

/** Barwert der Zahlungsreihe zum gefundenen Zins. Muss null sein — das ist die Definition. */
function barwert(fluesse: readonly Fluss[], rate: number, bezug: Tag): number {
  const tage = (t: Tag): number => (Date.parse(`${t}T00:00:00Z`) - Date.parse(`${bezug}T00:00:00Z`)) / 86_400_000;
  let summeBarwert = 0;
  for (const f of fluesse) summeBarwert += Number(f.betrag) / (1 + rate) ** (tage(f.tag) / TAGE_IM_JAHR);
  return summeBarwert;
}

describe('1 — der gefundene Zins loest die Barwertgleichung', () => {
  it('setzt man ihn ein, kommt null heraus', () => {
    // Der Zaehler haelt den Satz ehrlich: eine Eigenschaft, die nur ueber
    // uebersprungene Faelle laeuft, ist gruen, ohne etwas geprueft zu haben.
    let geprueft = 0;

    fc.assert(
      fc.property(flussMuster, ({ fluesse }) => {
        const e = xirr(fluesse, fluesse[0]!.tag);
        if (e.art !== 'ok') return;
        geprueft += 1;
        const eingesetzt = Math.abs(Number(fluesse[0]!.betrag));
        // Relativ zum Kapitaleinsatz, nicht absolut: bei Millionenbetraegen waere
        // ein absolutes Epsilon entweder unerfuellbar oder nichtssagend.
        expect(Math.abs(barwert(fluesse, e.rate, fluesse[0]!.tag)) / eingesetzt).toBeLessThan(1e-6);
      }),
      LAEUFE,
    );

    expect(geprueft).toBeGreaterThan(LAEUFE.numRuns / 2);
  });
});

describe('2 — der Zins haengt nicht an der Waehrungseinheit', () => {
  it('alle Betraege verdoppeln laesst den XIRR unveraendert', () => {
    fc.assert(
      fc.property(flussMuster, fc.integer({ min: 2, max: 1000 }), ({ fluesse, ende }, faktor) => {
        const a = xirr(fluesse, ende);
        const b = xirr(fluesse.map((f) => ({ ...f, betrag: f.betrag * BigInt(faktor) })), ende);
        expect(b.art).toBe(a.art);
        if (a.art === 'ok' && b.art === 'ok') expect(b.rate).toBeCloseTo(a.rate, 6);
      }),
      LAEUFE,
    );
  });
});

describe('3 — der Zins haengt nicht am Kalenderdatum', () => {
  it('alle Tage um n verschieben laesst den XIRR unveraendert', () => {
    fc.assert(
      fc.property(flussMuster, fc.integer({ min: -400, max: 400 }), ({ fluesse, ende }, n) => {
        const a = xirr(fluesse, ende);
        const b = xirr(fluesse.map((f) => ({ ...f, tag: plusTage(f.tag, n) })), plusTage(ende, n));
        expect(b.art).toBe(a.art);
        if (a.art === 'ok' && b.art === 'ok') expect(b.rate).toBeCloseTo(a.rate, 6);
      }),
      LAEUFE,
    );
  });
});

describe('4 — die TWR ist gegen die Hoehe externer Cashflows unempfindlich', () => {
  it('eine beliebig grosse Einzahlung aendert die Zeitgewichtung nicht', () => {
    const renditen = fc.array(fc.double({ min: -0.5, max: 0.5, noNaN: true }), { minLength: 2, maxLength: 8 });

    fc.assert(
      fc.property(renditen, fc.integer({ min: 1, max: 5 }), fc.integer({ min: 0, max: 5_000_000 }), (r, wo, cf) => {
        const start = 100_000n;
        const stelle = Math.min(wo, r.length - 1);

        // Zwei Reihen aus denselben Perioden-Renditen: einmal ohne Einzahlung,
        // einmal mit einer zu Beginn der Periode `stelle`.
        const bauen = (einzahlung: bigint) => {
          const reihe = [depotTag('2026-01-01', '0', { gesamtCent: start })];
          const fluesse: Fluss[] = [];
          let wert2 = start;
          for (let i = 0; i < r.length; i += 1) {
            if (i === stelle && einzahlung > 0n) {
              wert2 += einzahlung;
              fluesse.push({ tag: plusTage(T('2026-01-01'), i + 1), betrag: einzahlung as Cent });
            }
            wert2 = BigInt(Math.round(Number(wert2) * (1 + r[i]!)));
            reihe.push(depotTag('2026-01-01', '0', { gesamtCent: wert2 }));
          }
          return {
            reihe: reihe.map((z, i) => ({ ...z, tag: plusTage(T('2026-01-01'), i) })),
            fluesse,
          };
        };

        const ohne = bauen(0n);
        const mit = bauen(BigInt(cf));

        const a = twr(ohne.reihe, ohne.fluesse);
        const b = twr(mit.reihe, mit.fluesse);
        // Rundung auf Cent bewegt die Verkettung minimal — drei Nachkommastellen
        // sind mehr als die Anzeige je zeigt.
        expect(b.gesamt).toBeCloseTo(a.gesamt, 3);
      }),
      LAEUFE,
    );
  });
});

describe('5 — FIFO verliert keine Stuecke', () => {
  it('verbliebene Menge gleich Kaeufe minus Verkaeufe, fuer beliebige Folgen', () => {
    const bewegungen = fc.array(
      fc.record({
        kauf: fc.boolean(),
        menge: fc.integer({ min: 1, max: 100_000 }),
        preis: fc.integer({ min: 1, max: 1_000_000 }),
        tage: fc.integer({ min: 0, max: 800 }),
      }),
      { minLength: 1, maxLength: 30 },
    );

    fc.assert(
      fc.property(bewegungen, (b) => {
        const sortiert = [...b].sort((x, y) => x.tage - y.tage);
        const txe: Tx[] = [];
        let bestand = 0n;
        let erwartet = 0n;

        for (const s of sortiert) {
          const menge = BigInt(s.menge) * 100n;
          // Mehr verkaufen, als man hat, kann die Bank nicht liefern — solche
          // Folgen sind keine gueltigen Eingaben, also gar nicht erst erzeugen.
          const istKauf = s.kauf || bestand < menge;
          if (!istKauf && bestand === 0n) continue;
          const wirklich = istKauf ? menge : (menge > bestand ? bestand : menge);

          txe.push(
            tx({
              tag: '2026-01-01',
              ts: `2026-01-01T00:00:${String(txe.length).padStart(2, '0')}Z`,
              art: 'WERTPAPIER',
              typ: istKauf ? 'BUY' : 'SELL',
              isin: WELT,
              mengeE8: (istKauf ? wirklich : -wirklich) as MengeE8,
              betragCent: BigInt(s.preis) as Cent,
            }),
          );
          bestand += istKauf ? wirklich : -wirklich;
          erwartet += istKauf ? wirklich : -wirklich;
        }

        const e = fifo(txe, ausgeglicheneUebertraege(txe)).einstaende.get(WELT);
        expect(e === undefined ? 0n : e.menge).toBe(erwartet);
        if (e !== undefined) expect(e.einstand >= 0n).toBe(true);
      }),
      LAEUFE,
    );
  });
});

describe('6 — die Cent-Arithmetik verliert nie einen Cent', () => {
  it('die Summe der Teile ist das Ganze', () => {
    fc.assert(
      fc.property(fc.array(fc.bigInt({ min: -(10n ** 12n), max: 10n ** 12n }), { maxLength: 50 }), (teile) => {
        let vonHand = 0n;
        for (const t of teile) vonHand += t;
        expect(summe(teile as readonly Cent[])).toBe(vonHand);
      }),
      LAEUFE,
    );
  });

  it('aufteilen und wieder zusammenzaehlen ergibt denselben Betrag', () => {
    fc.assert(
      fc.property(fc.array(fc.bigInt({ min: 0n, max: 10n ** 9n }), { minLength: 1, maxLength: 20 }), (teile) => {
        const gesamt = teile.reduce((a, b) => a + b, 0n);
        expect(summe(teile as readonly Cent[])).toBe(gesamt);
      }),
      LAEUFE,
    );
  });

  it('rundet nur einmal: Menge mal Kurs kennt keinen Zwischenschritt', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10n ** 12n }),
        fc.bigInt({ min: 1n, max: 10n ** 10n }),
        (menge, kurs) => {
          // wert() ist per Definition kaufmaennisch gerundetes menge*kurs/1e14.
          const roh = menge * kurs;
          expect(wert(menge as MengeE8, kurs as KursE6)).toBe(rundeAufCent(roh, 10n ** 12n));
        },
      ),
      LAEUFE,
    );
  });

  it('rundet symmetrisch: das Vorzeichen aendert nur das Vorzeichen', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n }), fc.bigInt({ min: 1n, max: 10n ** 6n }), (z, n) => {
        expect(rundeAufCent(-z, n)).toBe(-rundeAufCent(z, n));
      }),
      LAEUFE,
    );
  });
});
