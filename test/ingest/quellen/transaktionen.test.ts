/** `ingest/quellen/transaktionen.ts`: was die Quelle aus einer Antwort macht. Rahmen in `hilfen.ts`. */

import type * as FsModul from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { betragVon, rundeAufCent, zuCent } from '../../../core/dezimal.ts';
import { SchemaFehler } from '../../../ingest/schema.ts';
import { FIXTURE, json } from '../../fixtures/index.ts';
import { antwort, kontext, mcp, netz } from './hilfen.ts';

vi.mock('../../../ingest/mcp.ts', () => ({ mcpAufrufRoh: vi.fn() }));
vi.mock('../../../ingest/netz.ts', () => ({ holeText: vi.fn() }));
// Durchreichend: nur der `seed.json`-Test tauscht die Implementierung kurz aus.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof FsModul>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

const { readFileSync } = await import('node:fs');
const { holeTransaktionen } = await import('../../../ingest/quellen/transaktionen.ts');

const dateiLesen = vi.mocked(readFileSync);

beforeEach(() => {
  mcp.mockReset();
  netz.mockReset();
});

describe('holeTransaktionen', () => {
  it('normalisiert Vorzeichen nach Typ und leitet ausgefuehrte Kurse ab', async () => {
    mcp.mockResolvedValue(antwort(json(FIXTURE.transaktionen)));

    const ctx = kontext();
    const ernte = await holeTransaktionen(ctx);

    expect(ernte.daten.transaktionen).toHaveLength(7);

    const kauf = ernte.daten.transaktionen.find((t) => t.id === 'tx-synth-0002')!;
    expect(kauf.betragCent).toBe(-zuCent('1234.56'));
    expect(kauf.mengeE8).toBe(1000000000n);
    expect(kauf.istExtern).toBe(false);

    const verkauf = ernte.daten.transaktionen.find((t) => t.id === 'tx-synth-0004')!;
    expect(verkauf.betragCent).toBe(zuCent('55.50'));
    expect(verkauf.mengeE8).toBe(-75000000n);

    const einzahlung = ernte.daten.transaktionen.find((t) => t.id === 'tx-synth-0001')!;
    expect(einzahlung.art).toBe('CASH');
    expect(einzahlung.betragCent).toBe(zuCent('3000.00'));

    // Reihenfolge: aufsteigend nach Zeitstempel, unabhaengig von der Eingabereihenfolge.
    const ts = ernte.daten.transaktionen.map((t) => t.ts);
    expect([...ts].sort()).toEqual(ts);

    expect(ernte.daten.ersterTag).toBe(ernte.daten.transaktionen[0]?.tag);
    expect(ctx.befunde.leer).toBe(true);
  });

  it('leitet fuer jede Wertpapier-Transaktion mit Menge den ausgefuehrten Kurs ab', async () => {
    mcp.mockResolvedValue(antwort(json(FIXTURE.transaktionen)));

    const ernte = await holeTransaktionen(kontext());
    const kauf = ernte.daten.transaktionen.find((t) => t.id === 'tx-synth-0002')!;
    const erwarteterKurs = rundeAufCent(betragVon(kauf.betragCent) * 10n ** 12n, betragVon(kauf.mengeE8!));
    const punkt = ernte.daten.kurspunkte.find((p) => p.isin === kauf.isin && p.tag === kauf.tag);

    expect(punkt?.kurs).toBe(erwarteterKurs);
    expect(punkt?.herkunft).toBe('transaktion');
    // Cash-only-Zeilen (DEPOSIT, INTEREST) haben keine ISIN und erzeugen keinen Kurspunkt.
    expect(ernte.daten.kurspunkte).toHaveLength(5);
  });

  it('behandelt TRANSFER_OUT wie einen Verkauf: Stuecke raus, Geld raus', async () => {
    // Depotuebertrag in Wertpapierform: die Bank meldet `quantity` ohne verlaessliches
    // Vorzeichen (siehe Kopfkommentar). TRANSFER_OUT teilt die `_OUT$`-Endung mit den
    // reinen Geldabfluessen (ABFLUSS), muss die Menge aber wie VERKAUF negieren — sonst
    // zaehlt die Mengenreihe die uebertragenen Stuecke doppelt (Gegenbuchung TRANSFER_IN).
    mcp.mockResolvedValue(
      antwort({
        page: { nextCursor: null, totalCount: 1, returnedCount: 1 },
        transactions: [
          {
            id: 'x-transfer-out',
            kind: 'security',
            category: 'TRANSFER',
            status: 'EXECUTED',
            currency: 'EUR',
            isCancellation: false,
            lastEventAt: '2026-01-05T10:00:00+01:00',
            description: null,
            custodian: 'BNP',
            security: {
              isin: 'IE00B4L5Y983',
              transactionType: 'TRANSFER_OUT',
              quantity: 50.5,
              amount: 2000.0,
              side: null,
              limitPrice: null,
              stopPrice: null,
            },
            cash: null,
            nonTradeSecurity: null,
            eltif: null,
          },
        ],
      }),
    );

    const ernte = await holeTransaktionen(kontext());
    const transfer = ernte.daten.transaktionen[0]!;

    expect(transfer.mengeE8).toBe(-5050000000n);
    expect(transfer.betragCent).toBe(-zuCent('2000.00'));
    expect(transfer.istExtern).toBe(true);
  });

  it('scheitert bei kaputtem seed.json mit E_SEED_KAPUTT statt mit einem rohen SyntaxError', async () => {
    mcp.mockResolvedValue(antwort(json(FIXTURE.transaktionen)));
    const echt = dateiLesen.getMockImplementation()!;
    dateiLesen.mockImplementation(((pfad: string, ...rest: unknown[]) =>
      String(pfad).endsWith('seed.json')
        ? '{ "anfangsbestand": [ , ] }'
        : (echt as (...a: unknown[]) => unknown)(pfad, ...rest)) as typeof readFileSync);

    try {
      const fehler = await holeTransaktionen(kontext()).catch((f: unknown) => f);
      expect(fehler).toBeInstanceOf(Error);
      expect((fehler as { code?: string }).code).toBe('E_SEED_KAPUTT');
      expect((fehler as Error).message).not.toContain('anfangsbestand');
    } finally {
      dateiLesen.mockImplementation(echt);
    }
  });

  it('bricht bei einer Zeile ohne timestamp und ohne executedAt mit SchemaFehler ab', async () => {
    mcp.mockResolvedValue(antwort(json(FIXTURE.transaktionenOhneZeit)));
    await expect(holeTransaktionen(kontext())).rejects.toThrow(SchemaFehler);
  });

  it('bricht bei einem unlesbaren Betrag mit SchemaFehler ab', async () => {
    mcp.mockResolvedValue(antwort(json(FIXTURE.transaktionenBetrag)));
    await expect(holeTransaktionen(kontext())).rejects.toThrow(SchemaFehler);
  });

  it('verwirft eine Zeile mit unlesbarem Zeitstempel statt den Lauf abzubrechen', async () => {
    mcp.mockResolvedValue(
      antwort({
        page: { nextCursor: null, totalCount: 1, returnedCount: 1 },
        transactions: [
          {
            id: 'x-1',
            kind: 'cash',
            category: 'TRANSFER',
            status: 'EXECUTED',
            currency: 'EUR',
            isCancellation: false,
            lastEventAt: 'nicht-lesbar',
            description: null,
            custodian: 'BNP',
            security: null,
            cash: { relatedIsin: null, transactionType: 'DEPOSIT', amount: 10 },
            nonTradeSecurity: null,
            eltif: null,
          },
        ],
      }),
    );

    const ctx = kontext();
    const ernte = await holeTransaktionen(ctx);

    expect(ernte.daten.transaktionen).toHaveLength(0);
    expect(ctx.befunde.hinweise).toContainEqual({ art: 'zeileOhneZeitstempel', werte: { quelle: 'transaktionen' } });
  });

  // Die Bank liefert Vorzeichen nicht verlaesslich — die gelieferte Menge ist deshalb gemischt.
  it.each([
    ['security', 'REINVESTMENT', -50.5, 5050000000n, -zuCent('2000.00')],
    ['security', 'REINVESTMENT_DISTRIBUTION', 50.5, 5050000000n, -zuCent('2000.00')],
    ['non_trade_security', 'SWAP_IN', 50.5, 5050000000n, -zuCent('2000.00')],
    ['non_trade_security', 'SWAP_OUT', 50.5, -5050000000n, zuCent('2000.00')],
  ] as const)('normalisiert %s/%s wie Kauf oder Verkauf', async (kind, typ, menge, mengeE8, betragCent) => {
    const zweig = { isin: 'IE00B4L5Y983', transactionType: typ, quantity: menge, amount: 2000.0 };
    mcp.mockResolvedValue(
      antwort({
        page: { nextCursor: null, totalCount: 1, returnedCount: 1 },
        transactions: [
          {
            id: 'x-zweig',
            kind,
            category: 'TRADE',
            status: 'EXECUTED',
            currency: 'EUR',
            isCancellation: false,
            lastEventAt: '2026-01-05T10:00:00+01:00',
            description: null,
            custodian: 'BNP',
            security: kind === 'security' ? { ...zweig, side: 'BUY', limitPrice: null, stopPrice: null } : null,
            cash: null,
            nonTradeSecurity: kind === 'non_trade_security' ? zweig : null,
            eltif: null,
          },
        ],
      }),
    );

    const ctx = kontext();
    const ernte = await holeTransaktionen(ctx);
    const t = ernte.daten.transaktionen[0]!;

    expect(t.betragCent).toBe(betragCent);
    expect(t.mengeE8).toBe(mengeE8);
    expect(t.istExtern).toBe(false);
    expect(ctx.befunde.leer).toBe(true);
  });

  it('meldet einen unbekannten Transaktionstyp als Hinweis, ordnet ihn aber intern ein', async () => {
    mcp.mockResolvedValue(
      antwort({
        page: { nextCursor: null, totalCount: 1, returnedCount: 1 },
        transactions: [
          {
            id: 'x-2',
            kind: 'cash',
            category: 'OTHER',
            status: 'EXECUTED',
            currency: 'EUR',
            isCancellation: false,
            lastEventAt: '2026-01-05T10:00:00+01:00',
            description: null,
            custodian: 'BNP',
            security: null,
            cash: { relatedIsin: null, transactionType: 'MYSTERY_TYPE', amount: 10 },
            nonTradeSecurity: null,
            eltif: null,
          },
        ],
      }),
    );

    const ctx = kontext();
    const ernte = await holeTransaktionen(ctx);

    expect(ernte.daten.transaktionen[0]?.istExtern).toBe(false);
    expect(ctx.befunde.hinweise).toContainEqual({ art: 'unbekannteTypen', werte: { typen: ['MYSTERY_TYPE'] } });
  });

  it('verwirft eine Transaktion mit Datum in der Zukunft', async () => {
    mcp.mockResolvedValue(
      antwort({
        page: { nextCursor: null, totalCount: 1, returnedCount: 1 },
        transactions: [
          {
            id: 'x-3',
            kind: 'cash',
            category: 'TRANSFER',
            status: 'EXECUTED',
            currency: 'EUR',
            isCancellation: false,
            lastEventAt: '2026-08-27T10:00:00+02:00',
            description: null,
            custodian: 'BNP',
            security: null,
            cash: { relatedIsin: null, transactionType: 'DEPOSIT', amount: 10 },
            nonTradeSecurity: null,
            eltif: null,
          },
        ],
      }),
    );

    const ctx = kontext();
    const ernte = await holeTransaktionen(ctx);

    expect(ernte.daten.transaktionen).toHaveLength(0);
    expect(ctx.befunde.hinweise).toContainEqual({ art: 'punkteInZukunft', werte: { quelle: 'transaktionen' } });
  });
});
