import { describe, expect, it } from 'vitest';
import { zuCent } from '../../core/dezimal.ts';
import { drift } from '../../core/drift.ts';
import type { DriftErgebnis } from '../../core/drift.ts';
import { JUNGE_SPANNE_TAGE, berechneKennzahlen } from '../../core/kennzahlen.ts';
import type { KennzahlenEingaben } from '../../core/kennzahlen.ts';
import type { Vpi } from '../../core/inflation.ts';
import type { Zinsreihe } from '../../core/risiko.ts';
import type { Cent } from '../../core/dezimal.ts';
import type { Isin, Tx } from '../../core/typen.ts';
import { EUROPA, T, WELT, bestand, depotTag, einzahlung, kauf, tx, verkauf, zins } from '../hilfen.ts';

const OK: DriftErgebnis = {
  stufe: 'ok',
  abweichung: 0,
  berechnetGesamtCent: 0n,
  gemeldetGesamtCent: 0n,
  cashAbweichung: 0,
  positionen: [],
  grund: null,
};

const KEIN_VPI: Vpi = new Map<string, number>();
const KEIN_ZINS: Zinsreihe = new Map();

/** Ein Depot, das seit einem Jahr steht: 1000 rein, 1000 in den Welt-ETF, heute 1200 wert. */
function standard(ueber: Partial<KennzahlenEingaben> = {}): KennzahlenEingaben {
  const transaktionen: Tx[] = [
    einzahlung('2025-08-26', '1000'),
    kauf('2025-08-26', WELT, '10', '1000'),
  ];
  return {
    transaktionen,
    reihe: [
      depotTag('2025-08-26', '1000', { wertpapiereCent: zuCent('1000'), nettoEinzahlungKumCent: zuCent('1000') }),
      depotTag('2026-08-26', '1200', { wertpapiereCent: zuCent('1200'), nettoEinzahlungKumCent: zuCent('1000') }),
    ],
    positionswerte: new Map<Isin, Cent>([[WELT, zuCent('1200')]]),
    bestand: [bestand(WELT, '10', '120', 'Welt-ETF')],
    vpi: KEIN_VPI,
    zinsreihe: KEIN_ZINS,
    heute: T('2026-08-26'),
    drift: OK,
    ...ueber,
  };
}

describe('berechneKennzahlen — Summen', () => {
  it('nimmt Gesamt, Cash und eingezahltes Kapital vom letzten Tag der Reihe', () => {
    const k = berechneKennzahlen(standard());
    expect(k.gesamtCent).toBe(zuCent('1200'));
    expect(k.nettoEinzahlungCent).toBe(zuCent('1000'));
    expect(k.cashCent).toBe(0n);
  });

  it('gibt den Positionsanteilen den Rest bis 1 als Cash-Anteil', () => {
    const e = standard();
    const k = berechneKennzahlen({
      ...e,
      reihe: [
        depotTag('2025-08-26', '1000', { wertpapiereCent: zuCent('1000'), nettoEinzahlungKumCent: zuCent('1000') }),
        depotTag('2026-08-26', '1500', {
          wertpapiereCent: zuCent('1200'),
          cashCent: zuCent('300'),
          nettoEinzahlungKumCent: zuCent('1000'),
        }),
      ],
    });
    expect(k.cashAnteil).toBeCloseTo(300 / 1500, 12);
  });

  it('sortiert die Reihe selbst, statt sich auf die Eingabe zu verlassen', () => {
    const e = standard();
    const k = berechneKennzahlen({ ...e, reihe: [...e.reihe].reverse() });
    expect(k.gesamtCent).toBe(zuCent('1200'));
  });

  it('haelt eine leere Reihe aus', () => {
    const k = berechneKennzahlen(standard({ reihe: [], positionswerte: new Map() }));
    expect(k.gesamtCent).toBe(0n);
    expect(k.cashCent).toBe(0n);
    expect(k.nettoEinzahlungCent).toBe(0n);
  });

  it('weist Einstand und Buchgewinn getrennt aus', () => {
    const k = berechneKennzahlen(standard());
    expect(k.investiertCent).toBe(zuCent('1000'));
    expect(k.kursgewinnCent).toBe(zuCent('200'));
    expect(k.kursgewinnProzent).toBeCloseTo(0.2);
  });

  it('haelt den Kursgewinn in Prozent bei einem Einstand von null bei null', () => {
    const k = berechneKennzahlen(
      standard({ transaktionen: [], reihe: [], positionswerte: new Map() }),
    );
    expect(k.investiertCent).toBe(0n);
    expect(k.kursgewinnProzent).toBe(0);
  });

  it('trennt Zinsen von Steuern nach Typ, nicht nach Vorzeichen', () => {
    const e = standard();
    const k = berechneKennzahlen({
      ...e,
      transaktionen: [
        ...e.transaktionen,
        zins('2026-01-31', '15'),
        tx({ tag: '2026-02-01', art: 'CASH', typ: 'TAX_RETURN', betragCent: zuCent('4') }),
      ],
    });
    expect(k.zinsenCent).toBe(zuCent('15'));
    expect(k.steuernCent).toBe(zuCent('4'));
  });

  it('zaehlt den Steuerabzug mit, obwohl `TAX` intern eingeordnet ist', () => {
    // Der Grund fuer ADR-014: `TAX` ist kein Ertrag und war deshalb aus BEIDEN Toepfen
    // gefallen — die Kennzahl "Steuern" zeigte den Steuerabzug ueberhaupt nicht.
    const e = standard();
    const k = berechneKennzahlen({
      ...e,
      transaktionen: [
        ...e.transaktionen,
        tx({ tag: '2026-01-20', art: 'CASH', typ: 'TAX', betragCent: -zuCent('330') }),
        tx({ tag: '2026-04-13', art: 'CASH', typ: 'TAX_RETURN', betragCent: zuCent('60') }),
      ],
    });
    expect(k.steuernCent).toBe(-zuCent('270'));
    expect(k.steuernTransaktionen.map((z) => z.typ)).toEqual(['TAX_RETURN', 'TAX']);
    expect(k.zinsenTransaktionen).toHaveLength(0);
  });

  it('summiert Gebuehren getrennt von Steuern und Zinsen, neueste zuerst', () => {
    const e = standard();
    const k = berechneKennzahlen({
      ...e,
      transaktionen: [
        ...e.transaktionen,
        tx({ tag: '2026-01-01', art: 'CASH', typ: 'FEE', betragCent: -zuCent('2.99') }),
        tx({ tag: '2026-02-01', art: 'CASH', typ: 'FEE', betragCent: -zuCent('2.99') }),
        tx({ tag: '2026-03-01', art: 'CASH', typ: 'FEE', betragCent: -zuCent('2.99'), storniert: true }),
      ],
    });
    expect(k.gebuehrenCent).toBe(-zuCent('5.98'));
    expect(k.gebuehrenTransaktionen.map((z) => z.tag)).toEqual(['2026-02-01', '2026-01-01']);
    expect(k.steuernCent).toBe(0n);
    expect(k.zinsenTransaktionen).toHaveLength(0);
  });

  it('laesst negative Zinsen Zinsen bleiben — ein Sollzins ist keine Steuer', () => {
    const e = standard();
    const k = berechneKennzahlen({
      ...e,
      transaktionen: [...e.transaktionen, zins('2026-03-31', '-1.21')],
    });
    expect(k.zinsenCent).toBe(-zuCent('1.21'));
    expect(k.steuernCent).toBe(0n);
  });

  it('nennt den Bezug jeder Ertragszeile: Wertpapier, Verrechnungskonto oder gar nichts', () => {
    const e = standard();
    const k = berechneKennzahlen({
      ...e,
      transaktionen: [
        ...e.transaktionen,
        // Zinsen auf Cash: es gibt kein anderes Guthaben, auf das sie sich beziehen koennten.
        zins('2026-01-31', '15'),
        // Ausschuettung: bewegt keine Stuecke, traegt den Bezug in `bezugIsin`.
        tx({
          tag: '2026-02-02',
          art: 'CASH',
          typ: 'DISTRIBUTION',
          bezugIsin: WELT,
          betragCent: zuCent('7'),
        }),
        // Vorabpauschale ohne `relatedIsin`: die Bank sagt nicht, zu welchem ETF sie gehoert.
        tx({ tag: '2026-01-20', art: 'CASH', typ: 'TAX', betragCent: -zuCent('30') }),
      ],
    });

    const bezuege = new Map(k.zinsenTransaktionen.map((z) => [z.typ, z]));
    expect(bezuege.get('INTEREST')?.bezug).toBe('verrechnungskonto');
    expect(bezuege.get('DISTRIBUTION')?.bezug).toBe('wertpapier');
    expect(bezuege.get('DISTRIBUTION')?.isin).toBe(WELT);
    expect(k.steuernTransaktionen[0]?.bezug).toBe('unbekannt');
  });

  it('zaehlt einen Kauf nicht als Ertrag', () => {
    const k = berechneKennzahlen(standard());
    expect(k.zinsenCent).toBe(0n);
    expect(k.steuernCent).toBe(0n);
  });

  it('uebergeht einen stornierten Ertrag bei Zinsen und Steuern', () => {
    const e = standard();
    const k = berechneKennzahlen({
      ...e,
      transaktionen: [...e.transaktionen, zins('2026-01-31', '15', { storniert: true })],
    });
    expect(k.zinsenCent).toBe(0n);
  });
});

describe('berechneKennzahlen — Positionen', () => {
  it('nennt Wert, Anteil, Einstand und Gewinn je Position', () => {
    const p = berechneKennzahlen(standard()).positionen;
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({
      isin: WELT,
      name: 'Welt-ETF',
      wertCent: zuCent('1200'),
      investiertCent: zuCent('1000'),
      gewinnCent: zuCent('200'),
      anteil: 1,
    });
    expect(p[0]!.gewinnProzent).toBeCloseTo(0.2, 10);
  });

  it('faellt auf die ISIN zurueck, wenn der Bestand keinen Namen liefert', () => {
    expect(berechneKennzahlen(standard({ bestand: [] })).positionen[0]!.name).toBe(WELT);
  });

  it('laesst eine vollstaendig verkaufte Position weg, behaelt aber ihren realisierten Gewinn', () => {
    const e = standard();
    const k = berechneKennzahlen({
      ...e,
      transaktionen: [...e.transaktionen, verkauf('2026-08-01', WELT, '10', '1200')],
      positionswerte: new Map(),
    });
    expect(k.positionen).toHaveLength(0);
    expect(k.realisiertCent).toBe(zuCent('200'));
    expect(k.investiertCent).toBe(0n);
  });

  it('sortiert absteigend nach Wert', () => {
    const e = standard();
    const k = berechneKennzahlen({
      ...e,
      transaktionen: [...e.transaktionen, kauf('2025-09-01', EUROPA, '10', '2000')],
      positionswerte: new Map<Isin, Cent>([[WELT, zuCent('1200')], [EUROPA, zuCent('2500')]]),
      reihe: [depotTag('2026-08-26', '3700', { nettoEinzahlungKumCent: zuCent('3000') })],
    });
    expect(k.positionen.map((p) => p.isin)).toEqual([EUROPA, WELT]);
    expect(k.positionen[0]!.anteil).toBeCloseTo(2500 / 3700, 10);
  });

  it('belaesst zwei Positionen, die bereits absteigend liegen, in ihrer Reihenfolge', () => {
    // Der zuerst gekaufte Titel ist bereits der wertvollere: die Eingabereihenfolge
    // an den Vergleich stimmt schon mit dem Sortierziel ueberein.
    const e = standard();
    const k = berechneKennzahlen({
      ...e,
      transaktionen: [...e.transaktionen, kauf('2025-09-01', EUROPA, '10', '1000')],
      positionswerte: new Map<Isin, Cent>([[WELT, zuCent('2500')], [EUROPA, zuCent('1200')]]),
      reihe: [depotTag('2026-08-26', '3700', { nettoEinzahlungKumCent: zuCent('2000') })],
    });
    expect(k.positionen.map((p) => p.isin)).toEqual([WELT, EUROPA]);
  });

  it('behandelt gleichen Wert als Gleichstand beim Sortieren', () => {
    const e = standard();
    const k = berechneKennzahlen({
      ...e,
      transaktionen: [...e.transaktionen, kauf('2025-09-01', EUROPA, '10', '1000')],
      positionswerte: new Map<Isin, Cent>([[WELT, zuCent('1200')], [EUROPA, zuCent('1200')]]),
      reihe: [depotTag('2026-08-26', '2400', { nettoEinzahlungKumCent: zuCent('2000') })],
    });
    expect(k.positionen).toHaveLength(2);
    expect(k.positionen.map((p) => p.wertCent)).toEqual([zuCent('1200'), zuCent('1200')]);
  });

  it('gibt jeder Position eine eigene Rendite', () => {
    const p = berechneKennzahlen(standard()).positionen[0]!;
    expect(p.xirr.art).toBe('ok');
    if (p.xirr.art === 'ok') expect(p.xirr.rate).toBeCloseTo(0.2, 2);
  });

  it('teilt nicht durch null, wenn der Einstand null ist', () => {
    const e = standard();
    const k = berechneKennzahlen({
      ...e,
      // Ein Uebertrag ohne Gegenwert: Menge da, Einstand null.
      transaktionen: [tx({ tag: '2025-08-26', isin: WELT, typ: 'BUY', mengeE8: 1000000000n, betragCent: 0n })],
    });
    expect(k.positionen[0]!.gewinnProzent).toBe(0);
    expect(Number.isFinite(k.positionen[0]!.gewinnProzent)).toBe(true);
  });
});

describe('berechneKennzahlen — Renditen', () => {
  it('rechnet XIRR aus externen Fluessen plus Endwert, nicht aus Kaeufen', () => {
    const k = berechneKennzahlen(standard());
    expect(k.xirr.art).toBe('ok');
    if (k.xirr.art === 'ok') expect(k.xirr.rate).toBeCloseTo(0.2, 2);
  });

  it('rechnet TWR aus der Reihe', () => {
    const k = berechneKennzahlen(standard());
    expect(k.twr.gesamt).toBeCloseTo(0.2, 6);
  });

  it('meldet ohne Preisindex keine Realrendite, statt die nominale auszugeben', () => {
    const k = berechneKennzahlen(standard());
    expect(k.real.exakt.art).toBe('zu_wenige_fluesse');
    expect(k.real.fisher).toBeNull();
    expect(k.real.teuerungProJahr).toBeNull();
  });

  it('rechnet die Realrendite, sobald der Preisindex vorliegt', () => {
    const vpi: Vpi = new Map([['2025-08', 100], ['2026-08', 102]]);
    const k = berechneKennzahlen(standard({ vpi }));
    expect(k.real.exakt.art).toBe('ok');
    expect(k.real.basisMonat).toBe('2026-08');
    // Zwei Prozent Teuerung kosten Rendite: real liegt unter nominal.
    if (k.real.exakt.art === 'ok' && k.xirr.art === 'ok') {
      expect(k.real.exakt.rate).toBeLessThan(k.xirr.rate);
    }
    expect(k.real.fisher).not.toBeNull();
  });

  it('datiert den Endwert auf den letzten Reihentag, nicht auf heute [ADR-053]', () => {
    const vpi: Vpi = new Map([['2025-08', 100], ['2026-08', 102]]);
    const amStichtag = berechneKennzahlen(standard({ vpi }));
    const spaeter = berechneKennzahlen(standard({ vpi, heute: T('2026-11-24') }));
    expect(spaeter.xirr).toEqual(amStichtag.xirr);
    expect(spaeter.real).toEqual(amStichtag.real);
    expect(spaeter.positionen[0]!.xirr).toEqual(amStichtag.positionen[0]!.xirr);
  });

  it('zaehlt den Monat des letzten Reihentags nicht als vollen, auch wenn heute spaeter liegt', () => {
    const monatsenden = ['2025-07-31', '2025-08-31', '2025-09-30', '2025-10-31', '2025-11-30', '2025-12-31',
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30', '2026-07-31'];
    const reihe = [
      ...monatsenden.map((tag, i) => depotTag(tag, String(1000 + (i % 3) * 40 + i * 10))),
      depotTag('2026-08-15', '700'),
    ];
    const amStichtag = berechneKennzahlen(standard({ transaktionen: [], reihe }));
    const spaeter = berechneKennzahlen(standard({ transaktionen: [], reihe, heute: T('2026-10-01') }));
    expect(amStichtag.volatilitaetProJahr.art).toBe('ok');
    expect(spaeter.volatilitaetProJahr).toEqual(amStichtag.volatilitaetProJahr);
  });

  it('gibt bei leerer Historie kein NaN aus', () => {
    const k = berechneKennzahlen(standard({ transaktionen: [], reihe: [], positionswerte: new Map() }));
    expect(k.xirr.art).toBe('zu_wenige_fluesse');
    expect(Number.isNaN(k.twr.gesamt)).toBe(false);
  });
});

describe('berechneKennzahlen — Sparrate', () => {
  it('nimmt Schnitt, 12-Monats-Schnitt und Median aus den externen Fluessen', () => {
    const einzahlungen = ['2026-01', '2026-02', '2026-03'].map((m) => einzahlung(`${m}-05`, '300'));
    const k = berechneKennzahlen(standard({ transaktionen: einzahlungen, heute: T('2026-03-20') }));
    expect(k.sparrateCent).toBe(zuCent('300'));
    expect(k.medianCent).toBe(zuCent('300'));
    expect(k.fluesse.monate).toHaveLength(3);
  });

  it('zaehlt die Monate bis heute, nicht bis zur letzten Zahlung', () => {
    // Drei Einzahlungen bis Maerz, heute ist August: 900 € auf acht Monate. Sonst
    // stuende nach einer Sparpause weiter die alte Rate da. [ADR-036]
    const einzahlungen = ['2026-01', '2026-02', '2026-03'].map((m) => einzahlung(`${m}-05`, '300'));
    const k = berechneKennzahlen(standard({ transaktionen: einzahlungen }));
    expect(k.fluesse.monate).toHaveLength(8);
    expect(k.sparrateCent).toBe(zuCent('112.50'));
  });

  it('nennt dieselben Zahlen wie die Flussuebersicht — keine zweite Rechnung', () => {
    const k = berechneKennzahlen(standard());
    expect(k.sparrateCent).toBe(k.fluesse.schnitt);
    expect(k.sparrate12Cent).toBe(k.fluesse.schnitt12);
    expect(k.medianCent).toBe(k.fluesse.median);
  });
});

describe('berechneKennzahlen — Hinweise', () => {
  const codes = (e: KennzahlenEingaben): string[] => berechneKennzahlen(e).hinweise.map((h) => h.code);

  it('meldet unbekannte Transaktionstypen', () => {
    const e = standard();
    const h = codes({ ...e, transaktionen: [...e.transaktionen, tx({ tag: '2026-01-01', typ: 'IRGENDWAS_NEUES' })] });
    expect(h).toContain('H_UNBEKANNTER_TYP');
  });

  it('meldet Kursluecken mit ihrer Anzahl', () => {
    const e = standard();
    const k = berechneKennzahlen({
      ...e,
      reihe: [depotTag('2026-08-25', '1100', { lueckenhaft: true }), ...e.reihe],
    });
    const hinweis = k.hinweise.find((h) => h.code === 'H_KURSLUECKE');
    expect(hinweis?.anzahl).toBe(1);
  });

  it('meldet nur Kursluecken der letzten JUNGE_SPANNE_TAGE Tage, den letzten Tag eingeschlossen', () => {
    const e = standard();
    const luecke = (tag: string) => depotTag(tag, '1100', { lueckenhaft: true });
    const k = berechneKennzahlen({
      ...e,
      reihe: [...e.reihe, luecke('2025-09-01'), luecke('2026-07-27'), luecke('2026-07-28')],
    });
    expect(JUNGE_SPANNE_TAGE).toBe(30);
    expect(k.hinweise.find((h) => h.code === 'H_KURSLUECKE')?.anzahl).toBe(1);
  });

  it('schweigt bei Kursluecken, die nur in der Fruehzeit liegen', () => {
    const e = standard();
    const h = codes({ ...e, reihe: [...e.reihe, depotTag('2025-09-01', '1050', { lueckenhaft: true })] });
    expect(h).not.toContain('H_KURSLUECKE');
  });

  it('meldet den fehlenden Preisindex', () => {
    expect(codes(standard())).toContain('H_KEIN_VPI');
    expect(codes(standard({ vpi: new Map([['2026-08', 100]]) }))).not.toContain('H_KEIN_VPI');
  });

  it('meldet den fehlenden risikofreien Zins', () => {
    expect(codes(standard())).toContain('H_KEIN_ZINS');
    expect(codes(standard({ zinsreihe: new Map([[T('2026-08-01'), 0.03]]) }))).not.toContain('H_KEIN_ZINS');
  });

  it('meldet eine ausgesetzte Selbstkontrolle', () => {
    const ausgesetzt = drift(depotTag('2026-08-26', '1000'), [], 0n);
    expect(codes(standard({ drift: ausgesetzt }))).toContain('H_DRIFT_AUSGESETZT');
  });

  it('meldet einen Abgang ohne Betrag, der als Totalverlust gilt', () => {
    const transaktionen = [
      ...standard().transaktionen,
      kauf('2026-01-05', EUROPA, '1', '100'),
      tx({ tag: '2026-02-02', typ: 'CORPORATE_ACTION', art: 'WERTPAPIER', isin: EUROPA, mengeE8: -100_000_000n, betragCent: 0n }),
    ];
    expect(codes(standard({ transaktionen }))).toContain('H_AUSBUCHUNG');
  });

  it('schweigt, wenn nichts zu melden ist', () => {
    const vpi: Vpi = new Map([['2026-08', 100]]);
    const zinsreihe: Zinsreihe = new Map([[T('2026-08-01'), 0.03]]);
    expect(codes(standard({ vpi, zinsreihe }))).toEqual([]);
  });
});
