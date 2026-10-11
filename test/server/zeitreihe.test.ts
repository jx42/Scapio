import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { plusTage, tageZwischen, vergleiche } from '../../core/kalender.ts';
import * as repository from '../../db/repository/index.ts';
import { testDatenbank } from '../../db/verbindung.ts';
import { baueServer } from '../../server/server.ts';
import type { Zeitreihe } from '../../server/vertrag.ts';
import { aufraeumen, eigeneHerkunft, konfiguration } from '../api/hilfen.ts';
import { depotTag, kauf, T, WELT } from '../hilfen.ts';

afterEach(() => {
  aufraeumen();
});

const ERSTER = T('2021-01-01');
const LETZTER = T('2026-01-01');
const MARKE = T('2023-06-14');

async function zeitreihe(zeitraum: string): Promise<Zeitreihe> {
  const db = await testDatenbank();
  const tage = [];
  for (let t = ERSTER; vergleiche(t, LETZTER) <= 0; t = plusTage(t, 1)) {
    tage.push({
      ...depotTag(t, '1000'),
      kernVersion: 1,
      eingabeHash: 'test',
      berechnetAm: `${t}T18:00:00+01:00`,
      positionen: new Map(),
    });
  }
  repository.depotTag.schreibeViele(db, tage);
  repository.transaktion.schreibe(db, {
    ...kauf(MARKE, WELT, '1', '100'),
    gesehenAm: `${MARKE}T18:00:00+01:00`,
  });

  const { app } = baueServer({
    db,
    konfiguration: konfiguration(),
    distPfad: join(tmpdir(), 'portfolio-kein-dist'),
    heute: LETZTER,
  });
  const antwort = await app.inject({ method: 'GET', url: `/api/zeitreihe?zeitraum=${zeitraum}`, headers: eigeneHerkunft() });
  expect(antwort.statusCode).toBe(200);
  return JSON.parse(antwort.body) as Zeitreihe;
}

describe('/api/zeitreihe, Ausduennen', () => {
  it('bis drei Jahre ein Punkt je Kalendertag', async () => {
    const r = await zeitreihe('3j');
    expect(r.punkte.length).toBe(tageZwischen(T('2023-01-01'), LETZTER) + 1);
  });

  it('ueber drei Jahre ein Punkt je Woche, Rand und Markentag bleiben', async () => {
    const r = await zeitreihe('max');
    const tage = r.punkte.map((p) => p.tag);
    expect(tage[0]).toBe(ERSTER);
    expect(tage.at(-1)).toBe(LETZTER);
    expect(tage).toContain(MARKE);
    expect(r.marken.map((m) => m.tag)).toEqual([MARKE]);
    expect(tage.length).toBeLessThan(tageZwischen(ERSTER, LETZTER) / 6);
    for (const t of tage) {
      if (t === ERSTER || t === MARKE) continue;
      expect(tageZwischen(T(t), LETZTER) % 7).toBe(0);
    }
  });
});
