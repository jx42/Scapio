/**
 * Der wichtigste Test der Suite: ein kleines Depot, sieben Tage, zwei Instrumente,
 * und daneben die von Hand gerechnete Tageswertreihe.
 *
 * Steht dieser Test, steht das grosse Chart. Er geht durch dieselbe Kette wie die
 * Anwendung — Kurspunkte verschmelzen, Raster bauen, Reihe rechnen — und vergleicht
 * das Ergebnis mit Zahlen, die unten im Kommentar nachgerechnet sind.
 */

import { describe, expect, it } from 'vitest';
import { zuCent } from '../../core/dezimal.ts';
import { baueDepotreihe, externeFluesse } from '../../core/depotreihe.ts';
import { ausgeglicheneUebertraege } from '../../core/uebertraege.ts';
import { KERN_VERSION } from '../../core/version.ts';
import type { Tag } from '../../core/kalender.ts';
import { rasterFuer, verschmelzeKurse } from '../../core/kursraster.ts';
import type { Kurspunkt, Rasterwert } from '../../core/kursraster.ts';
import { twr } from '../../core/twr.ts';
import type { Isin, Tx } from '../../core/typen.ts';
import { xirr } from '../../core/xirr.ts';
import { EUROPA, T, WELT, einzahlung, kauf } from '../hilfen.ts';
import { zuKursE6 } from '../../core/dezimal.ts';

const VON = T('2026-03-02'); // Montag
const BIS = T('2026-03-08'); // Sonntag

/**
 * 02.03. Einzahlung 1.000,00
 * 03.03. Kauf  4 × Welt   zu 62,50 = 250,00
 *        Kauf 10 × Europa zu 30,00 = 300,00
 * 06.03. Einzahlung 200,00
 */
const TRANSAKTIONEN: Tx[] = [
  einzahlung('2026-03-02', '1000'),
  kauf('2026-03-03', WELT, '4', '250'),
  kauf('2026-03-03', EUROPA, '10', '300'),
  einzahlung('2026-03-06', '200'),
];

const AUSGEGLICHEN = ausgeglicheneUebertraege(TRANSAKTIONEN);

/** Chartpunkte der Bank, Werktage. Das Wochenende fuellt das Raster fort. */
const KURSPUNKTE: Kurspunkt[] = [
  { isin: WELT, tag: T('2026-03-03'), kurs: zuKursE6('62.50'), herkunft: 'transaktion' },
  { isin: WELT, tag: T('2026-03-04'), kurs: zuKursE6('63.00'), herkunft: 'chart_1m' },
  { isin: WELT, tag: T('2026-03-05'), kurs: zuKursE6('61.00'), herkunft: 'chart_1m' },
  { isin: WELT, tag: T('2026-03-06'), kurs: zuKursE6('64.00'), herkunft: 'chart_1m' },
  { isin: EUROPA, tag: T('2026-03-03'), kurs: zuKursE6('30.00'), herkunft: 'transaktion' },
  { isin: EUROPA, tag: T('2026-03-04'), kurs: zuKursE6('30.50'), herkunft: 'chart_1m' },
  { isin: EUROPA, tag: T('2026-03-05'), kurs: zuKursE6('29.90'), herkunft: 'chart_1m' },
  { isin: EUROPA, tag: T('2026-03-06'), kurs: zuKursE6('31.20'), herkunft: 'chart_1m' },
];

function raster(punkte: readonly Kurspunkt[] = KURSPUNKTE, bis: Tag = BIS): Map<Isin, Map<Tag, Rasterwert>> {
  const verschmolzen = verschmelzeKurse(punkte);
  const jeIsin = new Map<Isin, Map<Tag, Rasterwert>>();
  for (const isin of new Set(verschmolzen.map((p) => p.isin))) {
    jeIsin.set(isin, rasterFuer(verschmolzen.filter((p) => p.isin === isin), VON, bis));
  }
  return jeIsin;
}

function punkteJeIsin(punkte: readonly Kurspunkt[] = KURSPUNKTE): Map<Isin, Kurspunkt[]> {
  const verschmolzen = verschmelzeKurse(punkte);
  const ergebnis = new Map<Isin, Kurspunkt[]>();
  for (const p of verschmolzen) {
    const liste = ergebnis.get(p.isin);
    if (liste === undefined) ergebnis.set(p.isin, [p]);
    else liste.push(p);
  }
  return ergebnis;
}

const reihe = (): ReturnType<typeof baueDepotreihe> =>
  baueDepotreihe({ transaktionen: TRANSAKTIONEN, raster: raster(), punkteJeIsin: punkteJeIsin(), von: VON, bis: BIS });

/**
 * Von Hand:
 *
 * | Tag   | Welt        | Europa       | Wertpapiere | Cash    | Gesamt  | Einzahlung |
 * |-------|-------------|--------------|-------------|---------|---------|-----------|
 * | 02.03 | —           | —            |    0,00     | 1000,00 | 1000,00 |   1000,00 |
 * | 03.03 | 4×62,50=250 | 10×30,00=300 |  550,00     |  450,00 | 1000,00 |   1000,00 |
 * | 04.03 | 4×63,00=252 | 10×30,50=305 |  557,00     |  450,00 | 1007,00 |   1000,00 |
 * | 05.03 | 4×61,00=244 | 10×29,90=299 |  543,00     |  450,00 |  993,00 |   1000,00 |
 * | 06.03 | 4×64,00=256 | 10×31,20=312 |  568,00     |  650,00 | 1218,00 |   1200,00 |
 * | 07.03 | fortgeschrieben, Samstag    |  568,00     |  650,00 | 1218,00 |   1200,00 |
 * | 08.03 | fortgeschrieben, Sonntag    |  568,00     |  650,00 | 1218,00 |   1200,00 |
 */
const ERWARTET = [
  { tag: '2026-03-02', wertpapiere: '0', cash: '1000', gesamt: '1000', einzahlung: '1000' },
  { tag: '2026-03-03', wertpapiere: '550', cash: '450', gesamt: '1000', einzahlung: '1000' },
  { tag: '2026-03-04', wertpapiere: '557', cash: '450', gesamt: '1007', einzahlung: '1000' },
  { tag: '2026-03-05', wertpapiere: '543', cash: '450', gesamt: '993', einzahlung: '1000' },
  { tag: '2026-03-06', wertpapiere: '568', cash: '650', gesamt: '1218', einzahlung: '1200' },
  { tag: '2026-03-07', wertpapiere: '568', cash: '650', gesamt: '1218', einzahlung: '1200' },
  { tag: '2026-03-08', wertpapiere: '568', cash: '650', gesamt: '1218', einzahlung: '1200' },
];

describe('Rekonstruktion — sieben Tage von Hand nachgerechnet', () => {
  it('trifft jede Zeile der Tabelle', () => {
    const gerechnet = reihe();
    expect(gerechnet).toHaveLength(7);

    expect(
      gerechnet.map((z) => ({
        tag: z.tag,
        wertpapiere: z.wertpapiereCent,
        cash: z.cashCent,
        gesamt: z.gesamtCent,
        einzahlung: z.nettoEinzahlungKumCent,
      })),
    ).toEqual(
      ERWARTET.map((e) => ({
        tag: e.tag,
        wertpapiere: zuCent(e.wertpapiere),
        cash: zuCent(e.cash),
        gesamt: zuCent(e.gesamt),
        einzahlung: zuCent(e.einzahlung),
      })),
    );
  });

  it('haelt jeden der sieben Tage fuer vollstaendig', () => {
    expect(reihe().filter((z) => z.lueckenhaft)).toEqual([]);
  });

  it('nennt beide Positionen am letzten Tag', () => {
    const letzte = reihe()[6]!;
    expect(letzte.positionen.get(WELT)).toBe(zuCent('256'));
    expect(letzte.positionen.get(EUROPA)).toBe(zuCent('312'));
  });

  it('zeigt den Gewinn als Abstand zwischen Wert und Einzahlung', () => {
    const letzte = reihe()[6]!;
    expect(letzte.gesamtCent - letzte.nettoEinzahlungKumCent).toBe(zuCent('18'));
  });

  it('zaehlt die Kaeufe nicht als Einzahlung — sonst waere die Rendite bedeutungslos', () => {
    expect(externeFluesse(TRANSAKTIONEN, AUSGEGLICHEN).map((f) => f.betrag)).toEqual([zuCent('1000'), zuCent('200')]);
  });

  it('ergibt eine TWR, die zum Verlauf passt', () => {
    // 1000 → 1218 bei 1200 eingezahltem Kapital: knapp ein Prozent Zeitgewichtung.
    const e = twr(reihe(), externeFluesse(TRANSAKTIONEN, AUSGEGLICHEN));
    expect(e.gesamt).toBeGreaterThan(0);
    expect(e.gesamt).toBeLessThan(0.03);
    expect(e.proJahr).toBeNull(); // sieben Tage werden nicht hochgerechnet
  });

  it('ergibt einen XIRR, der ohne NaN auskommt', () => {
    const fluesse = externeFluesse(TRANSAKTIONEN, AUSGEGLICHEN).map((f) => ({ ...f, betrag: -f.betrag }));
    const e = xirr([...fluesse, { tag: BIS, betrag: zuCent('1218') }], BIS);
    expect(e.art).toBe('ok');
    if (e.art === 'ok') expect(Number.isNaN(e.rate)).toBe(false);
  });

  it('markiert einen Tag, an dem einer Position der Kurs fehlt', () => {
    // Europa hat nach dem Kauf ueberhaupt keinen Kurs — der Wert der Position
    // fehlt, und der Tag sagt das, statt einen Kurssturz vorzutaeuschen.
    const ohneEuropa = KURSPUNKTE.filter((p) => p.isin === WELT);
    const gerechnet = baueDepotreihe({
      transaktionen: TRANSAKTIONEN,
      raster: raster(ohneEuropa),
      punkteJeIsin: punkteJeIsin(ohneEuropa),
      von: VON,
      bis: BIS,
    });
    expect(gerechnet[0]!.lueckenhaft).toBe(false); // vor dem Kauf
    expect(gerechnet.slice(1).every((z) => z.lueckenhaft)).toBe(true);
    expect(gerechnet[1]!.wertpapiereCent).toBe(zuCent('250'));
  });

  it('traegt jenseits der Fuellgrenze den letzten gemessenen Kurs fort, statt den Wert zu kappen', () => {
    // Sechs Tage nach dem letzten Chartpunkt vom 06.03. ist der 12.03. — das Raster
    // fuellt nicht mehr, aber der Kurs von damals bleibt die beste bekannte Schaetzung.
    const langeReihe = baueDepotreihe({
      transaktionen: TRANSAKTIONEN,
      raster: raster(KURSPUNKTE, T('2026-03-12')),
      punkteJeIsin: punkteJeIsin(KURSPUNKTE),
      von: VON,
      bis: T('2026-03-12'),
    });
    const letzte = langeReihe[langeReihe.length - 1]!;
    expect(letzte.tag).toBe('2026-03-12');
    expect(letzte.lueckenhaft).toBe(true);
    // Unveraendert gegenueber dem 06.03.: 4×64,00 + 10×31,20 = 568,00.
    expect(letzte.wertpapiereCent).toBe(zuCent('568'));
  });
});

describe('Inkrementalitaet', () => {
  it('rechnet einen Ausschnitt genauso wie die ganze Reihe', () => {
    const ganz = reihe();
    const ausschnitt = baueDepotreihe({
      transaktionen: TRANSAKTIONEN,
      raster: raster(),
      punkteJeIsin: punkteJeIsin(),
      von: T('2026-03-05'),
      bis: BIS,
    });
    expect(ausschnitt).toEqual(ganz.slice(3));
  });

  it('gibt gleichen Eingaben gleiche Hashes — daran erkennt der Lauf, dass nichts zu tun ist', () => {
    const ganz = reihe();
    const nochmal = reihe();
    expect(nochmal.map((z) => z.eingabeHash)).toEqual(ganz.map((z) => z.eingabeHash));
  });

  it('aendert nur die Hashes ab dem Tag, an dem sich etwas geaendert hat', () => {
    const vorher = reihe();
    const nachgereicht = [...TRANSAKTIONEN, kauf('2026-03-05', WELT, '1', '61')];
    const nachher = baueDepotreihe({
      transaktionen: nachgereicht,
      raster: raster(),
      punkteJeIsin: punkteJeIsin(),
      von: VON,
      bis: BIS,
    });

    expect(nachher.slice(0, 3).map((z) => z.eingabeHash)).toEqual(vorher.slice(0, 3).map((z) => z.eingabeHash));
    for (let i = 3; i < 7; i += 1) {
      expect(nachher[i]!.eingabeHash).not.toBe(vorher[i]!.eingabeHash);
    }
  });

  it('haelt KERN_VERSION als ganze Zahl bereit — sie steht in jeder gespeicherten Zeile', () => {
    expect(Number.isInteger(KERN_VERSION)).toBe(true);
    expect(KERN_VERSION).toBeGreaterThanOrEqual(1);
  });
});
