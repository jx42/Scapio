import { describe, expect, it } from 'vitest';
import { zuKursE6 } from '../../core/dezimal.ts';
import type { Kurspunkt } from '../../core/kursraster.ts';
import type { PositionsEingabe } from '../../core/positionsverlauf.ts';
import { berechnePositionsverlauf } from '../../core/positionsverlauf.ts';
import { EUROPA, T, WELT } from '../hilfen.ts';

const kurs = (tag: string, wert: string, isin = WELT): Kurspunkt => ({
  isin,
  tag: T(tag),
  kurs: zuKursE6(wert),
  herkunft: 'chart_1y',
});

const position = (isin: string, kurse: readonly Kurspunkt[], kaufTage: readonly string[] = []): PositionsEingabe => ({
  isin,
  name: isin,
  kurse,
  kaufTage: kaufTage.map(T),
});

const VON = T('2026-01-01');
const BIS = T('2026-12-31');
const rechne = (positionen: readonly PositionsEingabe[], von = VON, bis = BIS, ausduennen = false) =>
  berechnePositionsverlauf(positionen, von, bis, ausduennen);

/** Monatsenden 2020 bis 2024 als monatliche Reihe, wie `chart_max` sie liefert. */
const monatsenden = (isin = WELT): Kurspunkt[] => {
  const kurse: Kurspunkt[] = [];
  for (let jahr = 2020; jahr <= 2024; jahr += 1) {
    for (let monat = 1; monat <= 12; monat += 1) {
      const ende = new Date(Date.UTC(jahr, monat, 0)).toISOString().slice(0, 10);
      kurse.push(kurs(ende, String(100 + monat), isin));
    }
  }
  return kurse;
};

describe('berechnePositionsverlauf', () => {
  it('zählt ab dem ersten Kurs im Fenster: dort 0, danach das Verhältnis', () => {
    const { punkte } = rechne([position(WELT, [kurs('2025-12-30', '50'), kurs('2026-01-02', '100'), kurs('2026-01-05', '122.4')])]);
    expect(punkte).toEqual([
      { tag: '2026-01-02', werte: { [WELT]: 0 } },
      { tag: '2026-01-05', werte: { [WELT]: 0.224 } },
    ]);
  });

  it('rundet auf fünf Stellen und liefert nie NaN', () => {
    const { punkte } = rechne([position(WELT, [kurs('2026-01-02', '3'), kurs('2026-01-05', '1')])]);
    expect(punkte[1]!.werte[WELT]).toBe(-0.66667);
  });

  it('lässt eine Linie mit späterem Start beim eigenen ersten Kurs mit 0 beginnen', () => {
    const { punkte } = rechne([
      position(WELT, [kurs('2026-01-02', '100'), kurs('2026-02-02', '110')]),
      position(EUROPA, [kurs('2026-02-02', '40', EUROPA)]),
    ]);
    expect(punkte[0]!.werte[EUROPA]).toBeNull();
    expect(punkte[1]!.werte[EUROPA]).toBe(0);
  });

  it('füllt höchstens fünf Tage vorwärts, damit abweichende Handelstage keine Lücke werden', () => {
    const { punkte } = rechne([
      position(WELT, [kurs('2026-01-02', '100'), kurs('2026-01-06', '110'), kurs('2026-01-20', '120')]),
      position(EUROPA, [kurs('2026-01-02', '40', EUROPA), kurs('2026-01-07', '40', EUROPA), kurs('2026-01-08', '44', EUROPA)]),
    ]);
    const wert = (tag: string) => punkte.find((p) => p.tag === tag)!.werte[WELT];
    expect(wert('2026-01-07')).toBe(0.1);
    expect(wert('2026-01-08')).toBe(0.1);
    expect(wert('2026-01-20')).toBe(0.2);
    expect(punkte.find((p) => p.tag === '2026-01-20')!.werte[EUROPA]).toBeNull();
  });

  it('behält eine Position ohne Kurse im Fenster als Linie ohne Werte und Käufe', () => {
    const { linien, punkte } = rechne([
      position(WELT, [kurs('2026-01-02', '100')]),
      position(EUROPA, [kurs('2025-01-02', '40', EUROPA)], ['2026-01-02']),
    ]);
    expect(linien.find((l) => l.isin === EUROPA)).toEqual({ isin: EUROPA, name: EUROPA, kaeufe: [] });
    expect(punkte[0]!.werte[EUROPA]).toBeNull();
  });

  it('liefert ohne Kurse leere Punkte', () => {
    expect(rechne([position(WELT, [])]).punkte).toEqual([]);
    expect(rechne([])).toEqual({ linien: [], punkte: [] });
  });

  it('verwirft einen Kurs von null, statt durch ihn zu teilen', () => {
    const { punkte } = rechne([position(WELT, [kurs('2026-01-02', '0'), kurs('2026-01-05', '100')])]);
    expect(punkte).toEqual([{ tag: '2026-01-05', werte: { [WELT]: 0 } }]);
  });

  it('nimmt die Grenzen des Fensters mit', () => {
    const { punkte } = rechne([position(WELT, [kurs('2025-12-31', '90'), kurs('2026-01-01', '100'), kurs('2026-12-31', '110'), kurs('2027-01-01', '200')])]);
    expect(punkte.map((p) => p.tag)).toEqual(['2026-01-01', '2026-12-31']);
  });
});

describe('Lage der Käufe', () => {
  const kurse = [kurs('2026-02-28', '100'), kurs('2026-03-31', '110'), kurs('2026-04-30', '120')];
  const kaeufe = (kaufTage: readonly string[]) => rechne([position(WELT, kurse, kaufTage)]).linien[0]!.kaeufe;

  it('legt einen Kauf mit eigenem Kurs auf seinen Tag', () => {
    expect(kaeufe(['2026-03-31'])).toEqual([{ tag: '2026-03-31', punktTag: '2026-03-31' }]);
  });

  it('legt einen Kauf zwischen zwei Monatsenden auf den letzten Kurs davor', () => {
    expect(kaeufe(['2026-04-15'])).toEqual([{ tag: '2026-04-15', punktTag: '2026-03-31' }]);
  });

  it('legt einen Kauf vor dem ersten Kurs auf den ersten danach', () => {
    expect(kaeufe(['2026-01-15'])).toEqual([{ tag: '2026-01-15', punktTag: '2026-02-28' }]);
  });

  it('lässt zwei Käufe auf denselben Punkt fallen und nennt beide Tage', () => {
    expect(kaeufe(['2026-04-20', '2026-04-05'])).toEqual([
      { tag: '2026-04-05', punktTag: '2026-03-31' },
      { tag: '2026-04-20', punktTag: '2026-03-31' },
    ]);
  });

  it('zählt denselben Tag einmal und nichts außerhalb des Fensters', () => {
    expect(kaeufe(['2026-03-31', '2026-03-31', '2025-12-31', '2027-01-01'])).toEqual([
      { tag: '2026-03-31', punktTag: '2026-03-31' },
    ]);
  });

  it('gibt ohne Kauf keine Punkte', () => {
    expect(kaeufe([])).toEqual([]);
  });
});

describe('Ausdünnen', () => {
  const VON_LANG = T('2020-01-01');
  const BIS_LANG = T('2026-06-30');

  /** Monatsenden bis 2024, danach jeder Werktag. */
  const gemischt = (): Kurspunkt[] => {
    const kurse = monatsenden();
    for (let t = Date.UTC(2025, 0, 1); t <= Date.UTC(2026, 5, 30); t += 86_400_000) {
      const d = new Date(t);
      if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
      kurse.push(kurs(d.toISOString().slice(0, 10), '100'));
    }
    return kurse;
  };

  it('behält jedes Monatsende und je Woche die letzte Zeile', () => {
    const { punkte } = rechne([position(WELT, gemischt())], VON_LANG, BIS_LANG, true);
    const tage = punkte.map((p) => p.tag as string);
    // Ohne das letzte: der 31.12.2024 teilt die Woche mit dem ersten Freitag der Tagesreihe.
    for (const k of monatsenden().slice(0, -1)) expect(tage).toContain(k.tag);
    // Der Freitag, nicht der Montag derselben Woche.
    expect(tage).toContain('2025-06-13');
    expect(tage).not.toContain('2025-06-09');
    expect(tage.at(-1)).toBe('2026-06-30');
  });

  it('behält erste Zeile, ersten Wert jeder Linie und jeden Kauf-Punkt', () => {
    const { linien, punkte } = rechne(
      [
        position(WELT, gemischt(), ['2025-06-09', '2025-06-10']),
        position(EUROPA, [kurs('2025-06-11', '40', EUROPA), kurs('2025-06-13', '41', EUROPA)]),
      ],
      VON_LANG,
      BIS_LANG,
      true,
    );
    const tage = punkte.map((p) => p.tag as string);
    expect(tage[0]).toBe('2020-01-31');
    expect(tage).toContain('2025-06-11');
    for (const k of linien[0]!.kaeufe) expect(tage).toContain(k.punktTag);
    expect(tage).toContain('2025-06-09');
    expect(tage).toContain('2025-06-10');
  });

  it('findet bei einem monatlichen Sparplan über Jahre jeden Kauf auf einer Zeile', () => {
    const kaufTage: string[] = [];
    for (let jahr = 2020; jahr <= 2024; jahr += 1) {
      for (let monat = 1; monat <= 12; monat += 1) kaufTage.push(`${jahr}-${String(monat).padStart(2, '0')}-15`);
    }
    const { linien, punkte } = rechne([position(WELT, monatsenden(), kaufTage)], VON_LANG, BIS_LANG, true);
    const tage = new Set(punkte.map((p) => p.tag));
    expect(linien[0]!.kaeufe).toHaveLength(kaufTage.length);
    expect(linien[0]!.kaeufe.every((k) => tage.has(k.punktTag))).toBe(true);
    // Der erste Kauf liegt vor dem ersten Monatsende und fällt nach vorn.
    expect(linien[0]!.kaeufe[0]).toEqual({ tag: '2020-01-15', punktTag: '2020-01-31' });
  });

  it('dünnt ohne Schalter nicht aus', () => {
    const { punkte } = rechne([position(WELT, [kurs('2026-06-08', '1'), kurs('2026-06-09', '1'), kurs('2026-06-12', '1')])]);
    expect(punkte).toHaveLength(3);
  });
});
