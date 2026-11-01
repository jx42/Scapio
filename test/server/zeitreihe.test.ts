import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { plusTage, tageZwischen, vergleiche } from '../../core/kalender.ts';
import * as repository from '../../db/repository/index.ts';
import { testDatenbank } from '../../db/verbindung.ts';
import { baueServer } from '../../server/server.ts';
import type { Zeitreihe } from '../../server/vertrag.ts';
import { aufraeumen, eigeneHerkunft, konfiguration } from '../api/hilfen.ts';
import { depotTag, einzahlung, kauf, T, WELT } from '../hilfen.ts';

afterEach(() => {
  aufraeumen();
});

const ERSTER = T('2021-01-01');
const LETZTER = T('2026-01-01');
const MARKE = T('2023-06-14');

async function anfrage(query: string, mitVergleich = false) {
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

  if (mitVergleich) {
    repository.transaktion.schreibe(db, { ...einzahlung(ERSTER, '1000'), gesehenAm: `${ERSTER}T18:00:00+01:00` });
    const kurse = [];
    for (let t = ERSTER; vergleiche(t, LETZTER) <= 0; t = plusTage(t, 1)) {
      kurse.push({ isin: WELT, tag: t, kurs: 100_000_000n + BigInt(tageZwischen(ERSTER, t)) * 10_000n, herkunft: 'chart_max' as const });
    }
    repository.kurs.schreibeViele(db, kurse);
  }

  const { app } = baueServer({
    db,
    konfiguration: konfiguration(),
    distPfad: join(tmpdir(), 'portfolio-kein-dist'),
    heute: LETZTER,
  });
  return app.inject({ method: 'GET', url: `/api/zeitreihe?${query}`, headers: eigeneHerkunft() });
}

async function zeitreihe(zeitraum: string): Promise<Zeitreihe> {
  const antwort = await anfrage(`zeitraum=${zeitraum}`);
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

describe('/api/zeitreihe, frei gewaehlter Zeitraum', () => {
  it('zeigt genau das Fenster von..bis und nennt es im Ausschnitt', async () => {
    const antwort = await anfrage('von=2023-06-01&bis=2023-06-30');
    expect(antwort.statusCode).toBe(200);
    const r = JSON.parse(antwort.body) as Zeitreihe;
    expect(r.zeitraum).toBeNull();
    expect(r.ausschnitt).toEqual({ von: '2023-06-01', bis: '2023-06-30' });
    expect(r.punkte[0]!.tag).toBe('2023-06-01');
    expect(r.punkte.at(-1)!.tag).toBe('2023-06-30');
    expect(r.punkte.length).toBe(30);
    expect(r.marken.map((m) => m.tag)).toEqual([MARKE]);
    expect(r.tage[0]).toBe(ERSTER);
    expect(r.tage.at(-1)).toBe(LETZTER);
  });

  it('begrenzt das Fenster auf die Reihe', async () => {
    const r = JSON.parse((await anfrage('von=2000-01-01&bis=2030-01-01')).body) as Zeitreihe;
    expect(r.ausschnitt).toEqual({ von: ERSTER, bis: LETZTER });
  });

  it('nennt beim festen Zeitraum den Ausschnitt ebenfalls', async () => {
    const r = await zeitreihe('1j');
    expect(r.zeitraum).toBe('1j');
    expect(r.ausschnitt).toEqual({ von: '2025-01-01', bis: LETZTER });
  });

  it.each([
    'von=2023-06-01',
    'bis=2023-06-01',
    'von=2023-06-30&bis=2023-06-01',
    'von=2023-02-30&bis=2023-06-01',
    'von=gestern&bis=2023-06-01',
    'von=2023-06-01&von=2023-06-02&bis=2023-06-30',
    'zeitraum=1j&von=2023-06-01&bis=2023-06-30',
  ])('lehnt %s ab', async (query) => {
    const antwort = await anfrage(query);
    expect(antwort.statusCode).toBe(400);
    expect((JSON.parse(antwort.body) as { fehler: { code: string } }).fehler.code).toBe('E_PARAMETER');
  });
});

describe('/api/zeitreihe, Abstaende fuer die Benchmarkwahl', () => {
  it('nennt jeden Vergleich mit Kursen, den gewaehlten wie seinen letzten Punkt', async () => {
    const antwort = await anfrage(`zeitraum=1j&benchmark=${WELT}`, true);
    expect(antwort.statusCode).toBe(200);
    const r = JSON.parse(antwort.body) as Zeitreihe;
    const letzter = r.punkte.at(-1)!;
    expect(letzter.differenzCent).toEqual(expect.any(Number));
    expect(r.abstaende).toEqual([
      { isin: WELT, differenzCent: letzter.differenzCent, differenzProzent: letzter.differenzProzent },
    ]);
  });

  it('haengt nicht an der Auswahl', async () => {
    const mit = JSON.parse((await anfrage(`zeitraum=1j&benchmark=${WELT}`, true)).body) as Zeitreihe;
    const ohne = JSON.parse((await anfrage('zeitraum=1j', true)).body) as Zeitreihe;
    expect(ohne.benchmark).toBeNull();
    expect(ohne.abstaende).toEqual(mit.abstaende);
  });
});
