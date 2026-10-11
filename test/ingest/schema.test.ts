/**
 * Die Schemata gegen die Fixtures. [INV-12]
 *
 * Jede Quelle zweimal: einmal die gute Antwort, die durchgehen MUSS, und einmal die
 * kaputte, die haengenbleiben MUSS. Nur beides zusammen sagt etwas — ein Schema, das
 * alles ablehnt, besteht die eine Haelfte genauso wie eines, das alles durchlaesst.
 */

import { describe, expect, it } from 'vitest';
import {
  ChartAntwort,
  EurostatAntwort,
  EzbZinsAntwort,
  HoldingsAntwort,
  SchemaFehler,
  SparplaeneAntwort,
  TransaktionenAntwort,
  pruefe,
} from '../../ingest/schema.ts';
import { FIXTURE, json } from '../fixtures/index.ts';

describe('Schema · holdings', () => {
  it('nimmt die synthetische Antwort an und rechnet Geld in Cent um', () => {
    const a = pruefe('holdings', HoldingsAntwort, json(FIXTURE.holdings));
    expect(a.holdings).toHaveLength(3);
    expect(a.holdings[0]?.position.filled).toBe(1725000000n); // 17,25 in 1e-8
    expect(a.holdings[0]?.currentQuote.midPrice).toBe(123456700n); // 123,4567 in 1e-6
  });

  it('lehnt eine ISIN mit elf Zeichen ab', () => {
    expect(() => pruefe('holdings', HoldingsAntwort, json(FIXTURE.holdingsIsin))).toThrow(SchemaFehler);
  });

  it('lehnt ein unbekanntes Feld ab, statt es stillschweigend zu ignorieren', () => {
    // `.strict()` ist hier der ganze Zweck: ein umbenanntes Feld der Bank soll
    // AUFFALLEN und nicht als fehlender Wert durch die Rechnung wandern.
    expect(() => pruefe('holdings', HoldingsAntwort, json(FIXTURE.holdingsFeld))).toThrow(/marketValue/);
  });
});

describe('Schema · transaktionen', () => {
  it('nimmt die synthetische Antwort an', () => {
    const a = pruefe('transaktionen', TransaktionenAntwort, json(FIXTURE.transaktionen));
    expect(a.transactions).toHaveLength(7);
    expect(a.transactions[0]?.cash?.amount).toBe(300000n);
    expect(a.transactions[1]?.security?.quantity).toBe(1000000000n);
  });

  it('verlangt lastEventAt', () => {
    expect(() => pruefe('transaktionen', TransaktionenAntwort, json(FIXTURE.transaktionenOhneZeit))).toThrow(
      /lastEventAt/,
    );
  });

  it('lehnt einen unlesbaren Betrag ab, statt ihn zu null zu machen', () => {
    expect(() => pruefe('transaktionen', TransaktionenAntwort, json(FIXTURE.transaktionenBetrag))).toThrow(
      /Betrag nicht lesbar/,
    );
  });
});

describe('Schema · chart', () => {
  it('nimmt die echte Antwort an, in beiden Zeitfenstern', () => {
    const max = pruefe('kurse', ChartAntwort, json(FIXTURE.chartMax));
    const monat = pruefe('kurse', ChartAntwort, json(FIXTURE.chart1m));
    expect(max.dataPoints).toHaveLength(8);
    expect(max.dataPoints[0]?.midPrice).toBe(81200000n);
    expect(monat.dataPoints[4]?.midPrice).toBe(123456700n);
  });

  it('lehnt einen Punkt ohne Kursangabe ab', () => {
    expect(() => pruefe('kurse', ChartAntwort, json(FIXTURE.chartPunkt))).toThrow(/midPrice/);
  });
});

describe('Schema · sparplaene', () => {
  it('nimmt Gross- und Kleinschreibung der Frequenz gleichermassen an', () => {
    const a = pruefe('sparplaene', SparplaeneAntwort, json(FIXTURE.sparplaene));
    expect(a.items[0]?.configuration.frequency).toBe('MONTHLY');
    expect(a.items[1]?.configuration.frequency).toBe('monthly');
    expect(a.items[0]?.amount).toBe(7500n);
  });

  it('lehnt einen Sparplan ohne jede Frequenz ab', () => {
    expect(() => pruefe('sparplaene', SparplaeneAntwort, json(FIXTURE.sparplaeneFrequenz))).toThrow(/frequency/);
  });

});

describe('Schema · eurostat', () => {
  it('nimmt JSON-stat 2.0 an', () => {
    const a = pruefe('vpi', EurostatAntwort, json(FIXTURE.eurostat));
    expect(a.id).toContain('time');
    expect(Object.keys(a.dimension)).toContain('geo');
  });

  it('nimmt auch die Fassung mit zwei Laendern an — das faellt erst in vpi.ts auf', () => {
    // Bewusst: das Schema beschreibt die GESTALT, nicht die Annahme ueber die Anfrage.
    // Die Eindeutigkeit prueft `holeVpi`, weil nur dort steht, was gepinnt sein muss.
    expect(() => pruefe('vpi', EurostatAntwort, json(FIXTURE.eurostatZweiLaender))).not.toThrow();
  });
});

describe('Schema · ezb', () => {
  it('nimmt die SDMX-JSON-Antwort der EZB an', () => {
    const a = pruefe('zins', EzbZinsAntwort, json(FIXTURE.ezb));
    expect(a.header.id).toBe('9AAF2450-EST-B');
    expect(a.structure.dimensions.series).toHaveLength(3);
    expect(Object.keys(a.dataSets[0]!.series)).toEqual(['0:0:0']);
  });

  it('lehnt ein unbekanntes Feld ab, statt es stillschweigend zu ignorieren', () => {
    expect(() => pruefe('zins', EzbZinsAntwort, json(FIXTURE.ezbFeld))).toThrow(/links/);
  });
});

describe('SchemaFehler', () => {
  it('nennt die Quelle und keinen einzigen fremden Wert', () => {
    try {
      pruefe('holdings', HoldingsAntwort, json(FIXTURE.holdingsIsin));
      expect.unreachable('haette werfen muessen');
    } catch (fehler) {
      const f = fehler as SchemaFehler;
      expect(f.quelle).toBe('holdings');
      expect(f.code).toBe('E_SCHEMA');
      expect(f.message).not.toContain('ZZ000000000');
      expect(f.message).not.toContain('Beispiel Globalfonds');
    }
  });
});
