/**
 * Strg+C und SIGTERM: der Beenden-Pfad wartet auf einen laufenden Ingest, statt ihm die
 * Datenbank zu schliessen. [INV-09]
 *
 * Geprueft wird `erzeugeBeenden` mit Doubles, kein Prozessstart und kein echtes Signal.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { erzeugeBeenden } from '../../start/start.ts';
import type { BeendenZustand } from '../../start/start.ts';

type Halter = { quelle: string; seit: string; pid: number; laufId: number | null };
const HALTER: Halter = { quelle: 'api', seit: '2026-09-19T10:00:00.000Z', pid: 1, laufId: 1 };

/** Eine Sperre, die von aussen freigegeben wird; `gibFrei` zaehlt mit. */
function sperre(haeltAnfangs: boolean) {
  let halter: Halter | null = haeltAnfangs ? HALTER : null;
  return {
    belegt: () => halter,
    gibFrei: vi.fn(() => {
      halter = null;
    }),
    beende: () => {
      halter = null;
    },
  };
}

function aufbau(s: ReturnType<typeof sperre> | null) {
  const geschlossen: string[] = [];
  const zustand: BeendenZustand = {
    db: { close: () => geschlossen.push('db') } as unknown as BeendenZustand['db'],
    sperre: s,
    server: { schliesse: () => Promise.resolve(void geschlossen.push('server')) },
    beendet: false,
  };
  const enden: number[] = [];
  const zeilen: string[] = [];
  const beenden = erzeugeBeenden(zustand, {
    fristMs: 1000,
    abfrageMs: 5,
    ende: (code) => enden.push(code),
    ausgabe: (z) => zeilen.push(z),
  });
  return { zustand, geschlossen, enden, zeilen, beenden };
}

// Fake-Timer statt echter Wartezeiten: langsame CI-Runner machen Fristtests sonst flackernd.
const warte = async (ms: number): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms);
};

describe('Beenden per Signal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('wartet auf den laufenden Ingest und schliesst die Datenbank erst danach', async () => {
    const s = sperre(true);
    const { zustand, geschlossen, enden, beenden } = aufbau(s);

    beenden();
    await warte(50);
    // Der Lauf haelt die Sperre noch: die Datenbank bleibt offen, der Prozess besteht.
    expect(geschlossen).toEqual(['server']);
    expect(enden).toEqual([]);
    expect(zustand.beendet).toBe(true);

    s.beende();
    await warte(50);
    expect(geschlossen).toEqual(['server', 'db']);
    expect(enden).toEqual([0]);
  });

  it('beendet nach der Frist hart mit Exit-Code 1, wenn der Lauf nicht endet', async () => {
    const s = sperre(true);
    const { geschlossen, enden, zeilen, beenden } = aufbau(s);

    beenden();
    await warte(1100);

    expect(enden).toEqual([1]);
    expect(geschlossen).toContain('db');
    expect(zeilen.some((z) => z.includes('abgebrochen'))).toBe(true);
    expect(s.gibFrei).toHaveBeenCalled();
  });

  it('endet sofort mit 0, wenn kein Lauf unterwegs ist, und ein zweites Signal mit 1', async () => {
    const s = sperre(false);
    const { enden, geschlossen, beenden } = aufbau(s);

    beenden();
    await warte(20);
    expect(enden).toEqual([0]);
    expect(geschlossen).toEqual(['server', 'db']);

    beenden();
    expect(enden).toEqual([0, 1]);
  });

  it('gibt schon vor dem Serverstart Sperre und Datenbank frei, mit leerem Rest', async () => {
    const s = sperre(false);
    const { zustand, enden, beenden } = aufbau(s);
    zustand.server = null;

    beenden();
    await warte(20);

    expect(s.gibFrei).toHaveBeenCalled();
    expect(enden).toEqual([0]);
  });
});
