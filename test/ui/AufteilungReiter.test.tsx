// @vitest-environment jsdom
/*
 * Die Kachel Aufteilung mit den Reitern Aufteilung | Analyse (ADR-060) — Reiter nur, wenn der
 * Look-Through Unternehmen kennt. Die Aufteilung allein: AufteilungKachel.test.tsx.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { de } from '@/i18n/de';
import { schluessel, type Aufteilung, type FehlenderFonds, type Gruppe, type Top25, type UnternehmenZeile } from '@/lib/api';
import { zahl } from '@/lib/format';
import { AufteilungKachel } from '@/features/aufteilung/AufteilungKachel';
import { erwarteBarrierefrei, euro, fetchErsatz, prozentText, rendern, type Antwort } from './hilfen';
import { drift, health, kennzahlenAntwort, unternehmenZeile, xirrOk } from './fixtures';

const AUFTEILUNG: Aufteilung = {
  stand: '2026-08-26T12:08:00+02:00',
  drift: drift(),
  cashCent: 1_250_000,
  cashAnteil: 0.25,
  positionen: [
    {
      isin: 'IE00B4L5Y983',
      name: 'iShares Core MSCI World',
      art: 'ETF',
      wertCent: 3_750_000,
      anteil: 0.75,
      investiertCent: 3_000_000,
      gewinnCent: 750_000,
      gewinnProzent: 0.25,
      realisiertCent: 0,
      xirr: xirrOk(0.091),
    },
  ],
};

const APPLE: UnternehmenZeile = unternehmenZeile(1, {
  name: 'Apple Inc.',
  isin: 'US0378331005',
  exposureCent: 37_805_537,
  anteilDepot: 0.15,
  ausFonds: [
    { isin: 'IE00B4L5Y983', name: 'iShares Core MSCI World', anteilCent: 30_000_000 },
    { isin: 'IE00BKM4GZ66', anteilCent: 7_805_537 },
  ],
});

const ZEILEN = [APPLE, ...Array.from({ length: 14 }, (_, i) => unternehmenZeile(i + 2))];

const LAENDER: Gruppe[] = [
  { name: 'United States', exposureCent: 25_000_000, anteil: 0.6 },
  ...['Japan', 'Germany', 'France', 'Canada', 'Switzerland'].map((name) => ({
    name,
    exposureCent: 1_000_000,
    anteil: 0.05,
  })),
  { name: null, exposureCent: 5_000_000, anteil: 0.15 },
];

const TOP25: Top25 = {
  stand: '2026-08-26T12:08:00+02:00',
  drift: drift(),
  topAnteil: ZEILEN.reduce((summe, z) => summe + z.anteilDepot, 0),
  andereCent: 20_000_000,
  andereAnteil: 0.4,
  andereAnzahl: 1832,
  abdeckung: 0.83,
  durchschautCent: 37_805_537,
  anzahlUnternehmen: 1842,
  laender: LAENDER,
  sektoren: [
    { name: 'Information Technology', exposureCent: 20_000_000, anteil: 0.56 },
    { name: 'Raumfahrt', exposureCent: 15_700_000, anteil: 0.44 },
  ],
  fehlendeFonds: [],
  zeilen: ZEILEN,
};

const OHNE_FONDS: Top25 = {
  ...TOP25,
  zeilen: [],
  topAnteil: 0,
  anzahlUnternehmen: 0,
  laender: [],
  sektoren: [],
};

const GESPERRTER_FONDS: FehlenderFonds = {
  isin: 'US33734X1080',
  name: 'First Trust Platzhalter-ETF',
  anbieter: 'firsttrust',
  fall: 'gesperrt',
};

const GESCHEITERTER_FONDS: FehlenderFonds = {
  isin: 'LU0000000001',
  name: 'Xtrackers Platzhalter-ETF',
  anbieter: 'xtrackers',
  fall: 'abrufGescheitert',
};

function plan(top25: () => Antwort) {
  return (pfad: string) => {
    if (pfad === '/api/health') return { body: health(true) };
    if (pfad === '/api/aufteilung') return { body: AUFTEILUNG };
    if (pfad === '/api/kennzahlen') return { body: kennzahlenAntwort() };
    if (pfad === '/api/top25') return top25();
    throw new Error(`unerwarteter Pfad im Test: ${pfad}`);
  };
}

async function reiter(name: string): Promise<HTMLElement> {
  return screen.findByRole('tab', { name });
}

let wiederherstellen: (() => void) | null = null;

afterEach(() => {
  localStorage.clear();
  wiederherstellen?.();
  wiederherstellen = null;
});

describe('AufteilungKachel mit Reitern', () => {
  it('beginnt bei Aufteilung mit Rebalancing; Analyse wechselt Titel und Inhalt', async () => {
    wiederherstellen = fetchErsatz(plan(() => ({ body: TOP25 })));
    rendern(<AufteilungKachel />);

    const aufteilung = await reiter(de.aufteilung.reiterAufteilung);
    expect(aufteilung).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tablist', { name: de.aufteilung.ansicht })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: de.aufteilung.titel })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: de.rebalancing.knopf })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: de.top25.ringLaender })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: de.aufteilung.reiterAnalyse }));
    expect(await screen.findByRole('heading', { name: de.aufteilung.analyseTitel })).toBeInTheDocument();
    expect(screen.queryByText(/des Depots ·/)).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: de.top25.ringLaender })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: de.top25.ringSektoren })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: de.top25.treemap })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: de.rebalancing.knopf })).not.toBeInTheDocument();
  });

  it('zeigt keine Reiter, solange `top25` aus ist', async () => {
    wiederherstellen = fetchErsatz((pfad) =>
      pfad === '/api/health' ? { body: health(false) } : plan(() => ({ body: TOP25 }))(pfad),
    );
    rendern(<AufteilungKachel />);

    expect(await screen.findByRole('button', { name: de.rebalancing.knopf })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('die Reiterwahl überlebt kein neues Einhängen: wieder Aufteilung', async () => {
    wiederherstellen = fetchErsatz(plan(() => ({ body: TOP25 })));
    const { unmount } = rendern(<AufteilungKachel />);
    await userEvent.click(await reiter(de.aufteilung.reiterAnalyse));
    expect(await screen.findByRole('heading', { name: de.aufteilung.analyseTitel })).toBeInTheDocument();
    unmount();

    rendern(<AufteilungKachel />);
    expect(await reiter(de.aufteilung.reiterAufteilung)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: de.aufteilung.titel })).toBeInTheDocument();
  });

  it('Analyse: je Spalte fünf Zeilen, ein gemeinsames „Mehr zeigen“', async () => {
    wiederherstellen = fetchErsatz(plan(() => ({ body: TOP25 })));
    rendern(<AufteilungKachel />);
    await userEvent.click(await reiter(de.aufteilung.reiterAnalyse));

    const tabelle = await screen.findByRole('table', { name: de.top25.tabelle(zahl(1), zahl(5)) });
    expect(within(tabelle).getByText(euro(APPLE.exposureCent))).toBeInTheDocument();
    expect(within(tabelle).queryByText('Firma 15')).not.toBeInTheDocument();
    expect(within(tabelle).getByText(de.top25.fondsHinweis('iShares Core MSCI World, IE00BKM4GZ66'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^1 USA/ })).toBeInTheDocument();
    // Unbekanntes bleibt Rohtext.
    expect(screen.getByRole('button', { name: /^\d+ Raumfahrt/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Übrige/ })).not.toBeInTheDocument();

    const mehr = screen.getAllByRole('button', { name: de.top25.mehrZeigen });
    expect(mehr).toHaveLength(1);
    expect(mehr[0]).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(mehr[0] as HTMLElement);
    expect(await screen.findByRole('table', { name: de.top25.tabelle(zahl(1), zahl(15)) })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Übrige/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: de.top25.wenigerZeigen }));
    expect(await screen.findByRole('table', { name: de.top25.tabelle(zahl(1), zahl(5)) })).toBeInTheDocument();
  });

  it('Analyse: Tabelle per Tastatur erreichbar, die Treemap hat eine Tabelle mit Sektor', async () => {
    wiederherstellen = fetchErsatz(plan(() => ({ body: TOP25 })));
    rendern(<AufteilungKachel />);
    await userEvent.click(await reiter(de.aufteilung.reiterAnalyse));
    const name = de.top25.tabelle(zahl(1), zahl(5));
    await screen.findByRole('table', { name });
    expect(screen.getByRole('region', { name })).toHaveAttribute('tabindex', '0');

    const treemap = screen.getByRole('table', { name: de.top25.tabelleTreemap });
    // Kopf, die Unternehmen und „Andere“ für den Rest des Depots.
    expect(within(treemap).getAllByRole('row')).toHaveLength(ZEILEN.length + 2);
    expect(within(treemap).getByRole('columnheader', { name: de.top25.spalteSektor })).toBeInTheDocument();
    expect(within(treemap).getByRole('rowheader', { name: 'Apple Inc.' })).toBeInTheDocument();
    expect(within(treemap).getByRole('rowheader', { name: de.top25.andere })).toBeInTheDocument();

    for (const titel of [de.top25.laender, de.top25.sektoren, de.top25.unternehmen]) {
      expect(screen.getByRole('heading', { level: 3, name: titel })).toBeInTheDocument();
    }
  });

  it('ohne bekannte Fonds: keine Reiter, die Anleitung zu funds.json im Kopf der Aufteilung', async () => {
    wiederherstellen = fetchErsatz(plan(() => ({ body: OHNE_FONDS })));
    rendern(<AufteilungKachel />);

    const knopf = await screen.findByRole('button', { name: de.top25.leerAnleitungTitel });
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: de.rebalancing.knopf })).toBeInTheDocument();

    await userEvent.click(knopf);
    const dialog = screen.getByRole('dialog', { name: de.top25.leerAnleitungTitel });
    for (const schritt of de.top25.leerAnleitungSchritte) {
      expect(within(dialog).getByText(schritt)).toBeInTheDocument();
    }
  });

  it('alle Fonds fehlen: keine Reiter, der Hinweis auf die fehlenden Fonds statt der Anleitung', async () => {
    wiederherstellen = fetchErsatz(
      plan(() => ({ body: { ...OHNE_FONDS, fehlendeFonds: [GESPERRTER_FONDS, GESCHEITERTER_FONDS] } })),
    );
    rendern(<AufteilungKachel />);

    const knopf = await screen.findByRole('button', { name: de.hinweisKnopf.anzahl(2, zahl(2)) });
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: de.top25.leerAnleitungTitel })).not.toBeInTheDocument();

    await userEvent.click(knopf);
    const dialog = screen.getByRole('dialog', { name: de.top25.fehlendeFondsTitel });
    expect(within(dialog).getByText(GESPERRTER_FONDS.name)).toBeInTheDocument();
    expect(within(dialog).getByText(GESCHEITERTER_FONDS.name)).toBeInTheDocument();
  });

  it('einige Fonds fehlen: Hinweis-Knopf nur in Analyse, mit Abdeckung, Gründen und funds.json-Baustein', async () => {
    const schreiben = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: schreiben } });
    wiederherstellen = fetchErsatz(
      plan(() => ({ body: { ...TOP25, fehlendeFonds: [GESPERRTER_FONDS, GESCHEITERTER_FONDS] } })),
    );
    rendern(<AufteilungKachel />);

    const hinweis = { name: de.hinweisKnopf.anzahl(2, zahl(2)) };
    await reiter(de.aufteilung.reiterAufteilung);
    expect(screen.queryByRole('button', hinweis)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: de.aufteilung.reiterAnalyse }));
    await userEvent.click(await screen.findByRole('button', hinweis));

    expect(screen.getByRole('dialog', { name: de.top25.fehlendeFondsTitel })).toBeInTheDocument();
    expect(screen.getByText(de.top25.fehlendeFondsEinleitung(prozentText(TOP25.abdeckung)))).toBeInTheDocument();
    expect(screen.getByText(`(${GESPERRTER_FONDS.isin})`)).toBeInTheDocument();
    expect(
      screen.getByText(
        de.top25.fehlendeFondsGesperrt(de.top25.anbieterName[GESPERRTER_FONDS.anbieter] ?? GESPERRTER_FONDS.anbieter),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(de.top25.fehlendeFondsAbrufGescheitert)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: de.top25.fundsJsonKopierenKnopf }));
    expect(schreiben).toHaveBeenCalledWith(
      JSON.stringify(
        { anbieter: GESCHEITERTER_FONDS.anbieter, isin: GESCHEITERTER_FONDS.isin, name: GESCHEITERTER_FONDS.name },
        null,
        2,
      ),
    );
  });

  it('scheitert der Look-Through, steht die Aufteilung allein mit Rebalancing, ohne Reiter', async () => {
    wiederherstellen = fetchErsatz(
      plan(() => ({ status: 500, body: { fehler: { code: 'E_DB', text: 'Die Datenbank ist nicht erreichbar.' } } })),
    );
    rendern(<AufteilungKachel />);

    expect(await screen.findByRole('button', { name: de.rebalancing.knopf })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lädt der Look-Through noch, steht die Aufteilung allein mit Rebalancing, ohne Reiter', async () => {
    wiederherstellen = fetchErsatz(plan(() => 'haengt'));
    rendern(<AufteilungKachel />);

    expect(await screen.findByRole('button', { name: de.rebalancing.knopf })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('verschwinden die Unternehmen und kommen wieder, beginnt die Kachel bei Aufteilung', async () => {
    let antwort = TOP25;
    wiederherstellen = fetchErsatz(plan(() => ({ body: antwort })));
    const { client } = rendern(<AufteilungKachel />);
    await userEvent.click(await reiter(de.aufteilung.reiterAnalyse));
    await screen.findByRole('heading', { name: de.aufteilung.analyseTitel });

    antwort = OHNE_FONDS;
    await client.invalidateQueries({ queryKey: schluessel.top25 });
    expect(await screen.findByRole('heading', { name: de.aufteilung.titel })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();

    antwort = TOP25;
    await client.invalidateQueries({ queryKey: schluessel.top25 });
    expect(await reiter(de.aufteilung.reiterAufteilung)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: de.aufteilung.titel })).toBeInTheDocument();
  });

  it('die Sektorauswahl hängt am Namen: ein Lauf mit neuer Reihenfolge behält sie', async () => {
    let antwort = TOP25;
    wiederherstellen = fetchErsatz(plan(() => ({ body: antwort })));
    const { client } = rendern(<AufteilungKachel />);
    await userEvent.click(await reiter(de.aufteilung.reiterAnalyse));

    await userEvent.click(await screen.findByRole('button', { name: /^\d+ Raumfahrt/ }));
    expect(screen.getByRole('button', { name: /^\d+ Raumfahrt/ })).toHaveAttribute('aria-pressed', 'true');

    antwort = { ...TOP25, sektoren: [...TOP25.sektoren].reverse() };
    await client.invalidateQueries({ queryKey: schluessel.top25 });
    const liste = within(await screen.findByRole('list', { name: de.top25.sektoren }));
    expect(await liste.findByRole('button', { name: /^1 Raumfahrt/ })).toHaveAttribute('aria-pressed', 'true');
    expect(liste.getByRole('button', { name: /^2 / })).toHaveAttribute('aria-pressed', 'false');
  });

  it('„Mehr zeigen“ nennt die Listen und die Tabelle, die es aufklappt', async () => {
    wiederherstellen = fetchErsatz(plan(() => ({ body: TOP25 })));
    rendern(<AufteilungKachel />);
    await userEvent.click(await reiter(de.aufteilung.reiterAnalyse));

    const mehr = await screen.findByRole('button', { name: de.top25.mehrZeigen });
    const ziele = (mehr.getAttribute('aria-controls') ?? '').split(' ');
    expect(ziele).toHaveLength(3);
    for (const id of ziele) expect(document.getElementById(id)).not.toBeNull();
  });

  it('besteht axe ohne Verstoss auf beiden Reitern', async () => {
    wiederherstellen = fetchErsatz(plan(() => ({ body: TOP25 })));
    const { container } = rendern(<AufteilungKachel />);

    await screen.findByRole('img', { name: de.aufteilung.ring });
    await erwarteBarrierefrei(container);
    await userEvent.click(screen.getByRole('tab', { name: de.aufteilung.reiterAnalyse }));
    await screen.findByRole('img', { name: de.top25.treemap });
    await erwarteBarrierefrei(container);
  });
});
