import { describe, expect, it } from 'vitest';
import { zuCent } from '../../core/dezimal.ts';
import { tagAus } from '../../core/kalender.ts';
import { testDatenbank } from '../../db/verbindung.ts';
import { baueLesemodell } from '../../server/lesemodell.ts';
import { markenAus } from '../../server/marken.ts';
import { konfiguration } from '../api/hilfen.ts';
import { T, WELT, EUROPA, einzahlung, kauf, uebertragRaus, uebertragRein, verkauf } from '../hilfen.ts';

describe('baueLesemodell, Kalendertag', () => {
  it('liest ohne Vorgabe die Uhr', async () => {
    const db = await testDatenbank();
    expect(baueLesemodell(db, konfiguration()).heute).toBe(tagAus(new Date().toISOString()));
    db.close();
  });

  it('friert den Tag auf die Vorgabe ein — Grundlage der Fenster im Demo-Betrieb', async () => {
    // `start/demoServer.ts` bedient ein Szenario, dessen Kurshistorie an einem festen Tag
    // endet. Rechnete der Server die Fenster gegen die Systemuhr, laegen "1W" und "1M"
    // hinter dem letzten Datenpunkt und die Verlaufskachel bliebe leer.
    const db = await testDatenbank();
    expect(baueLesemodell(db, konfiguration(), T('2026-01-30')).heute).toBe('2026-01-30');
    db.close();
  });
});

describe('markenAus', () => {
  it('markiert Kauf und Verkauf, aber keine Einzahlung', () => {
    // Nur Investitionen in Wertpapiere werden markiert, keine Kontobewegung aufs
    // Verrechnungskonto — dieselbe Unterscheidung wie in Kachel 5 (ADR-008).
    const marken = markenAus(
      [
        einzahlung('2026-01-01', '1000'),
        kauf('2026-01-05', WELT, '1', '100'),
        verkauf('2026-02-05', WELT, '1', '110'),
      ],
      T('2026-01-01'),
      T('2026-02-05'),
    );
    expect(marken.map((m) => m.typ)).toEqual(['kauf', 'verkauf']);
  });

  it('erzeugt fuer ein ausgeglichenes Uebertragspaar keine Marke', () => {
    // Regressionstest fuer die dichte Haeufung goldener Linien im Chart: ein
    // depotinterner Wechsel ist kein Vorgang, den ein Anleger wiedererkennen soll.
    const marken = markenAus(
      [
        einzahlung('2026-01-01', '1000'),
        uebertragRaus('2026-03-05', WELT, '1', '150'),
        uebertragRein('2026-03-06', WELT, '1', '151'),
      ],
      T('2026-01-01'),
      T('2026-03-06'),
    );
    expect(marken).toEqual([]);
  });

  it('markiert auch einen unpaarigen Uebertrag nicht, da er kein Wertpapiergeschaeft ist', () => {
    const marken = markenAus([uebertragRaus('2026-03-05', WELT, '1', '150')], T('2026-01-01'), T('2026-03-06'));
    expect(marken).toEqual([]);
  });

  it('traegt eine einzelne Transaktion als einen Vorgang in ihrer Marke', () => {
    const marken = markenAus([kauf('2026-01-05', WELT, '1', '100')], T('2026-01-01'), T('2026-01-05'));
    expect(marken).toHaveLength(1);
    expect(marken[0]!.vorgaenge).toEqual([{ betragCent: -zuCent('100'), isin: WELT }]);
  });

  it('gruppiert mehrere Transaktionen desselben Tages und Typs in einer Marke', () => {
    // Zwei Sparplaene, die am selben Tag ausfuehren, duerfen einander nicht verschlucken —
    // sie teilen sich eine Marke mit zwei Vorgaengen statt eine davon zu verlieren.
    const marken = markenAus(
      [
        kauf('2026-01-05', WELT, '1', '100', { typ: 'SAVINGS_PLAN' }),
        kauf('2026-01-05', EUROPA, '1', '50', { typ: 'SAVINGS_PLAN' }),
      ],
      T('2026-01-01'),
      T('2026-01-05'),
    );
    expect(marken).toHaveLength(1);
    expect(marken[0]!.typ).toBe('sparplan');
    expect(marken[0]!.vorgaenge).toEqual([
      { betragCent: -zuCent('100'), isin: WELT },
      { betragCent: -zuCent('50'), isin: EUROPA },
    ]);
  });
});
