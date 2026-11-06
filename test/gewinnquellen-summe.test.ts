/**
 * Der Gesamtgewinn der Sankey-Kachel ist derselbe wie ueber dem Verlauf:
 * `gewinnquellen.nettoCent === gesamtCent − nettoEinzahlungCent`. [ADR-062]
 *
 * Geprueft ueber den echten Rechenweg (`baueDepotreihe` → `berechneKennzahlen`) an
 * synthetischen Depots, die je eine Luecke der Zuordnung ausloesen, und am e2e-Szenario
 * ueber das Lesemodell. Was keinem Topf zugeordnet werden kann, steht in „Nicht
 * zugeordnet“ — dort darf es nur landen, wo es wirklich keinen Topf gibt.
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Cent } from '../core/dezimal.ts';
import { zuCent, zuKursE6, zuMengeE8 } from '../core/dezimal.ts';
import { baueDepotreihe } from '../core/depotreihe.ts';
import type { Kennzahlen } from '../core/kennzahlen.ts';
import { berechneKennzahlen } from '../core/kennzahlen.ts';
import type { Kurspunkt } from '../core/kursraster.ts';
import { letzterKursBis, rasterFuer } from '../core/kursraster.ts';
import type { Tx } from '../core/typen.ts';
import { ausgeglicheneUebertraege, bewerteAusgaenge } from '../core/uebertraege.ts';
import { testDatenbank } from '../db/verbindung.ts';
import { baueLesemodell } from '../server/lesemodell.ts';
import { konfigurationFuer } from '../shared/konfiguration.ts';
import { seedeDatenbank } from './e2e/seed.ts';
import { T, WELT, einzahlung, kauf, tx, verkauf } from './hilfen.ts';

const VON = T('2025-01-01');
const BIS = T('2025-03-01');

/** Kurs 100 am Anfang, 120 am Ende. */
const KURSE: readonly Kurspunkt[] = [
  { isin: WELT, tag: VON, kurs: zuKursE6('100'), herkunft: 'chart_max' },
  { isin: WELT, tag: BIS, kurs: zuKursE6('120'), herkunft: 'chart_max' },
];

/** Wie das Lesemodell: Uebertraege ohne Wert vorbewertet, Positionswerte vom letzten Reihentag. */
function rechne(roh: readonly Tx[]): Kennzahlen {
  const transaktionen = bewerteAusgaenge(roh, ausgeglicheneUebertraege(roh), (_isin, tag) => letzterKursBis(KURSE, tag));
  const reihe = baueDepotreihe({
    transaktionen,
    raster: new Map([[WELT, rasterFuer(KURSE, VON, BIS)]]),
    punkteJeIsin: new Map([[WELT, KURSE]]),
    von: VON,
    bis: BIS,
  });
  return berechneKennzahlen({
    transaktionen,
    reihe,
    positionswerte: reihe[reihe.length - 1]!.positionen,
    bestand: [],
    vpi: new Map(),
    zinsreihe: new Map(),
    heute: BIS,
    drift: { stufe: 'ok', abweichung: 0, berechnetGesamtCent: 0n, gemeldetGesamtCent: 0n, cashAbweichung: 0, positionen: [], grund: null },
  });
}

function nichtZugeordnet(k: Kennzahlen): Cent {
  let summe = 0n;
  for (const q of [...k.gewinnquellen.zufluesse, ...k.gewinnquellen.abfluesse]) {
    if (q.art === 'nichtZugeordnet') summe += q.betragCent;
  }
  return summe;
}

const start = (): Tx[] => [einzahlung('2025-01-02', '2000'), kauf('2025-01-03', WELT, '10', '1000')];

type Fall = {
  readonly name: string;
  readonly transaktionen: () => Tx[];
  readonly gesamtgewinn: string;
  /** Was keinem Topf zugeordnet werden kann; 0, wo alles eine Herkunft hat. */
  readonly nichtZugeordnet: string;
};

const FAELLE: readonly Fall[] = [
  { name: 'Kauf, Kursgewinn', transaktionen: start, gesamtgewinn: '200', nichtZugeordnet: '0' },
  {
    name: 'Teilverkauf mit Zins',
    transaktionen: () => [...start(), verkauf('2025-02-01', WELT, '4', '440'), tx({ tag: '2025-02-02', typ: 'INTEREST', art: 'CASH', betragCent: zuCent('3') })],
    gesamtgewinn: '163',
    nichtZugeordnet: '0',
  },
  {
    // Unvollstaendige Historie: verkauft wird mehr, als bekannt ist.
    name: 'Verkauf ueber den bekannten Bestand',
    transaktionen: () => [...start(), verkauf('2025-01-10', WELT, '15', '1500')],
    gesamtgewinn: '500',
    nichtZugeordnet: '0',
  },
  {
    name: 'Verkauf vor dem Kauf desselben Tages',
    transaktionen: () => [
      einzahlung('2025-01-02', '2000'),
      kauf('2025-01-03', WELT, '10', '1000', { ts: '2025-01-03T15:00:00+01:00' }),
      verkauf('2025-01-03', WELT, '10', '1010', { ts: '2025-01-03T09:00:00+01:00' }),
    ],
    gesamtgewinn: '10',
    nichtZugeordnet: '0',
  },
  {
    name: 'Teil-Nachkauf nach einem frueheren Verkauf desselben Tages',
    transaktionen: () => [
      einzahlung('2025-01-02', '3000'),
      kauf('2025-01-02', WELT, '10', '1000'),
      kauf('2025-01-05', WELT, '5', '500', { ts: '2025-01-05T15:00:00+01:00' }),
      verkauf('2025-01-05', WELT, '12', '1200', { ts: '2025-01-05T09:00:00+01:00' }),
    ],
    gesamtgewinn: '60',
    nichtZugeordnet: '0',
  },
  {
    name: 'Cash-Buchung unbekannten Typs',
    transaktionen: () => [...start(), tx({ tag: '2025-01-10', typ: 'CORRECTION', art: 'CASH', betragCent: zuCent('50') })],
    gesamtgewinn: '250',
    nichtZugeordnet: '50',
  },
  {
    name: 'Wertpapierbuchung mit Menge 0 und Betrag',
    transaktionen: () => [...start(), tx({ tag: '2025-01-10', typ: 'SELL', isin: WELT, mengeE8: 0n, betragCent: zuCent('7') })],
    gesamtgewinn: '207',
    nichtZugeordnet: '7',
  },
  {
    name: 'Wertpapierbuchung ohne Menge',
    transaktionen: () => [...start(), tx({ tag: '2025-01-10', typ: 'SPIN_OFF_CASH', isin: WELT, mengeE8: null, betragCent: zuCent('7') })],
    gesamtgewinn: '207',
    nichtZugeordnet: '7',
  },
  {
    name: 'Bekannter interner Typ auf der Cash-Seite',
    transaktionen: () => [...start(), tx({ tag: '2025-01-10', typ: 'SELL', art: 'CASH', betragCent: zuCent('7') })],
    gesamtgewinn: '207',
    nichtZugeordnet: '7',
  },
  {
    name: 'Split 1:2 mit Teilverkauf',
    transaktionen: () => [
      ...start(),
      tx({ tag: '2025-01-20', typ: 'SPLIT', isin: WELT, mengeE8: zuMengeE8('10'), betragCent: 0n }),
      verkauf('2025-02-01', WELT, '4', '240'),
    ],
    // Kurs nach dem Split weiter 100 → 120: 16 Stueck sind am Ende 1920 wert.
    gesamtgewinn: '1160',
    nichtZugeordnet: '0',
  },
];

describe('Gesamtgewinn der Sankey = Gesamtgewinn ueber dem Verlauf', () => {
  for (const f of FAELLE) {
    it(f.name, () => {
      const k = rechne(f.transaktionen());
      expect(k.gesamtCent - k.nettoEinzahlungCent).toBe(zuCent(f.gesamtgewinn));
      expect(k.gewinnquellen.nettoCent).toBe(k.gesamtCent - k.nettoEinzahlungCent);
      expect(nichtZugeordnet(k)).toBe(zuCent(f.nichtZugeordnet));
    });
  }

  it('am e2e-Szenario ueber das Lesemodell, ohne Rest', async () => {
    const db = await testDatenbank();
    const konf = konfigurationFuer(mkdtempSync(join(tmpdir(), 'scapio-sankey-')), { port: 4790 });
    const { heute } = seedeDatenbank(db, T('2026-11-06'), '2026-11-06T12:00:00.000Z');
    const k = baueLesemodell(db, konf, heute).kennzahlen();
    expect(k.gewinnquellen.nettoCent).toBe(k.gesamtCent - k.nettoEinzahlungCent);
    expect(nichtZugeordnet(k)).toBe(0n);
    db.close();
  });
});
