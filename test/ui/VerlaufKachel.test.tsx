// @vitest-environment jsdom
/*
 * Kachel 1: die einzige mit zwei im localStorage gespeicherten Auswahlzustaenden
 * (Zeitraum, Modus) und einem eigenen Sperrzustand bei Drift-Stufe 'abbruch'.
 * Derselbe Sechser-Satz, dazu die beiden kachelfremden Extras.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { de } from '@/i18n/de';
import type { Zeitreihe } from '@/lib/api';
import { VerlaufKachel } from '@/features/verlauf/VerlaufKachel';
import { erwarteBarrierefrei, euro, fetchErsatz, fokussieren, prozentText, rendern } from './hilfen';
import { drift, kennzahlenAntwort, sharpeOhne } from './fixtures';

const FIXTURE: Zeitreihe = {
  stand: '2026-08-26T12:08:00+02:00',
  drift: drift(),
  grob: false,
  reiheLeer: false,
  zeitraum: 'max',
  // Gesamtgewinn im Fenster: (37_805_537 - 28_759_296) - (30_000_000 - 28_000_000),
  // siehe `core/kursgewinn.ts`. Die Punkte zaehlen ab dem ersten Tag des Fensters; der
  // letzte stimmt deshalb mit dem Fenstergewinn ueberein.
  fensterGewinnCent: 7_046_241,
  // 7_046_241 / 28_759_296 — bezogen auf die Einzahlung zu Fensterende, nicht -beginn.
  fensterGewinnProzent: 0.24500742299116085,
  benchmark: null,
  marken: [
    {
      tag: '2024-01-15',
      typ: 'sparplan',
      vorgaenge: [{ betragCent: 50_000, isin: 'IE00B4L5Y983', name: 'iShares MSCI World' }],
    },
  ],
  punkte: [
    {
      tag: '2024-01-01',
      gesamtCent: 30_000_000,
      einzahlungKumCent: 28_000_000,
      gewinnCent: 0,
      gewinnProzent: 0,
    },
    {
      tag: '2025-06-01',
      gesamtCent: 34_500_000,
      einzahlungKumCent: 30_500_000,
      gewinnCent: 2_000_000,
      gewinnProzent: 0.06557377049180328,
    },
    {
      tag: '2026-08-26',
      gesamtCent: 37_805_537,
      einzahlungKumCent: 28_759_296,
      gewinnCent: 7_046_241,
      gewinnProzent: 0.24500742299116085,
    },
  ],
};

const KENNZAHLEN_FIXTURE = kennzahlenAntwort();

/** Beantwortet /api/zeitreihe mit `zeitreihe`, /api/kennzahlen mit der KENNZAHLEN_FIXTURE. */
function mitKennzahlen(
  zeitreihe: Zeitreihe | { readonly punkte: readonly [] } | Record<string, unknown>,
  kennzahlen: Partial<typeof KENNZAHLEN_FIXTURE> = {},
) {
  return (pfad: string) =>
    pfad.includes('/api/kennzahlen')
      ? { body: { ...KENNZAHLEN_FIXTURE, ...kennzahlen } }
      : { body: zeitreihe };
}

let wiederherstellen: (() => void) | null = null;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  wiederherstellen?.();
  wiederherstellen = null;
  localStorage.clear();
});

describe('VerlaufKachel', () => {
  it('rendert mit Fixture-Daten und zeigt den Kopfwert im deutschen Format', async () => {
    wiederherstellen = fetchErsatz(mitKennzahlen(FIXTURE));
    rendern(<VerlaufKachel />);

    await screen.findByText(de.verlauf.tabelleVermoegen);

    const letzter = FIXTURE.punkte.at(-1)!;
    const kopfwert = euro(letzter.gesamtCent);

    // Die grosse Kopfzahl ist sichtbar ...
    expect(screen.getAllByText(kopfwert).length).toBeGreaterThan(0);
    // ... und hat ihr Gegenstueck in der letzten Zeile der verborgenen Tabelle. [P-06]
    const tabelle = screen.getByRole('table', { name: de.verlauf.tabelleVermoegen });
    const letzteZeile = within(tabelle).getAllByRole('row').at(-1)!;
    expect(within(letzteZeile).getByText(kopfwert)).toBeInTheDocument();

    expect(
      screen.queryByText(`${de.verlauf.einzahlung}: ${euro(letzter.einzahlungKumCent)}`),
    ).not.toBeInTheDocument();
  });

  it('zeigt das Skeleton, solange die Abfrage haengt', () => {
    wiederherstellen = fetchErsatz(() => 'haengt');
    const { container } = rendern(<VerlaufKachel />);

    expect(screen.getByText(de.zustand.laedt)).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('zeigt den Leerzustand, wenn ueberhaupt keine Reihe vorliegt', async () => {
    wiederherstellen = fetchErsatz(mitKennzahlen({ ...FIXTURE, punkte: [], marken: [], reiheLeer: true }));
    rendern(<VerlaufKachel />);

    expect(await screen.findByText(de.zustand.leerBeschreibung)).toBeInTheDocument();
    expect(screen.queryByText('Noch keine Daten')).toBeNull();
  });

  it('laesst die Zeitraumwahl stehen, wenn nur das gewaehlte Fenster leer ist', async () => {
    // Regression: der leere Zeitraum darf keine Sackgasse sein. Wurde die ganze Ansicht
    // durch den Leerzustand ersetzt, verschwand mit ihr die Zeitraumwahl — und der im
    // localStorage gemerkte Zeitraum hielt die Kachel ueber jedes Neuladen hinweg leer.
    // Genau die Lage aus dem Demo-Betrieb: "1W" steht gemerkt im localStorage und das
    // Fenster liegt hinter dem letzten Datenpunkt.
    localStorage.setItem('portfolio.zeitraum', '1w');
    wiederherstellen = fetchErsatz(mitKennzahlen({ ...FIXTURE, punkte: [], marken: [] }));
    rendern(<VerlaufKachel />);

    expect(await screen.findByText(de.verlauf.keinZeitraum)).toBeInTheDocument();

    const zurueck = screen.getByRole('radio', { name: de.verlauf.zeitraeume.max });
    await userEvent.click(zurueck);
    expect(localStorage.getItem('portfolio.zeitraum')).toBe('max');
  });

  it('zeigt den Fehlerzustand, ohne die Anwendung zu reissen, wenn der Server ablehnt', async () => {
    wiederherstellen = fetchErsatz(() => ({
      status: 500,
      body: { fehler: { code: 'E_DB', text: 'Die Datenbank ist nicht erreichbar.' } },
    }));
    rendern(<VerlaufKachel />);

    expect(await screen.findByText(de.zustand.fehler)).toBeInTheDocument();
    expect(screen.getByText('Die Datenbank ist nicht erreichbar.')).toBeInTheDocument();
  });

  it('zeichnet nicht, sondern erklaert, wenn die Drift-Stufe "abbruch" ist', async () => {
    const abweichung = 0.081;
    wiederherstellen = fetchErsatz(mitKennzahlen({ ...FIXTURE, drift: drift('abbruch', { abweichung }) }));
    rendern(<VerlaufKachel />);

    expect(await screen.findByText(de.drift.chartUnterdrueckt)).toBeInTheDocument();
    expect(screen.getByText(de.drift.abbruch(prozentText(abweichung)))).toBeInTheDocument();
    expect(screen.queryByText(de.verlauf.tabelleVermoegen)).not.toBeInTheDocument();
  });

  it('macht Zeitraum- und Moduswahl mit der Tastatur bedienbar und merkt sie sich', async () => {
    wiederherstellen = fetchErsatz(mitKennzahlen(FIXTURE));
    rendern(<VerlaufKachel />);
    await screen.findByText(de.verlauf.tabelleVermoegen);

    const einWocheName = de.verlauf.zeitraeume['1w'];
    fokussieren(screen.getByRole('radio', { name: einWocheName }));
    await userEvent.keyboard('{Enter}');

    // Der Zeitraumwechsel loest eine neue, ungecachte Abfrage aus — die Kachel faellt
    // kurz auf das Skeleton zurueck und baut Ansicht samt Knopf danach neu auf.
    expect(await screen.findByRole('radio', { name: einWocheName })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(localStorage.getItem('portfolio.zeitraum')).toBe('1w');

    const rendite = screen.getByRole('tab', { name: de.verlauf.rendite });
    await userEvent.click(rendite);
    expect(await screen.findByText(de.verlauf.tabelleRendite)).toBeInTheDocument();
    expect(localStorage.getItem('portfolio.verlaufModus')).toBe('rendite');
  });

  it('besteht axe ohne Verstoss, sobald der Chart steht', async () => {
    wiederherstellen = fetchErsatz(mitKennzahlen(FIXTURE));
    const { container } = rendern(<VerlaufKachel />);
    await screen.findByText(de.verlauf.tabelleVermoegen);
    await erwarteBarrierefrei(container);
  });

  it('zeigt Kursgewinn, TWR, IZF, Max. Drawdown und Sharpe-Ratio als eigene Karten', async () => {
    wiederherstellen = fetchErsatz(mitKennzahlen(FIXTURE));
    rendern(<VerlaufKachel />);
    await screen.findByText(de.verlauf.tabelleVermoegen);

    for (const bezeichnung of [
      de.kennzahlen.kursgewinn,
      de.kennzahlen.twrProJahrKurz,
      de.kennzahlen.real,
      de.kennzahlen.maxDrawdownKurz,
      de.kennzahlen.sharpe,
    ]) {
      expect(screen.getByText(bezeichnung)).toBeInTheDocument();
    }

    // Der Kursgewinn steht sowohl im Kopfwert der neuen Karte als auch — zufaellig
    // derselbe Wert in der Fixture — im Kopfwert des Charts; deshalb Anzahl statt
    // Eindeutigkeit.
    // Die Karten zeigen statt "+"/"-" einen Pfeil, der Wert daneben steht ohne Vorzeichen.
    expect(screen.getAllByText(euro(Math.abs(KENNZAHLEN_FIXTURE.kursgewinnCent))).length).toBeGreaterThan(0);
    expect(screen.getByText(prozentText(Math.abs(KENNZAHLEN_FIXTURE.twrProJahr!)))).toBeInTheDocument();
    // Realrendite: der exakte Wert (0,036), nicht die Fisher-Gleichung (0,037).
    expect(screen.getByText(prozentText(0.036))).toBeInTheDocument();
    expect(screen.getByText('15,20 %')).toBeInTheDocument();
    expect(screen.getByText('0,85')).toBeInTheDocument();

    // Kopfwert beim Kursgewinn ist der Euro-Betrag, die Subline zeigt den %-Wert.
    // TWR- und Realrendite-Karte zeigen die annualisierte Zahl als Kopfwert; die
    // Realrendite-Subline nennt den IZF.
    // Dazu Zeitpunkt des Max Drawdowns und Einordnung der Sharpe-Ratio.
    expect(screen.getByText(prozentText(KENNZAHLEN_FIXTURE.kursgewinnProzent))).toBeInTheDocument();
    expect(screen.getByText(de.kennzahlen.sublineTwrGesamt(prozentText(KENNZAHLEN_FIXTURE.twr!)))).toBeInTheDocument();
    expect(screen.getByText(de.kennzahlen.sublineXirr('5,80 %'))).toBeInTheDocument();
    expect(screen.getByText('15.02.2026 – 20.03.2026')).toBeInTheDocument();
    expect(screen.getByText(de.kennzahlen.sharpeBewertung.gut)).toBeInTheDocument();

    // Die Richtung tragen Lucide-Icons, nur an den Kopfwerten: Kursgewinn, TWR, Real; die
    // Sublines von TWR und Real stehen ohne Pfeil, Sharpe hat keins. Max. Drawdown ist als
    // einziger negativ.
    expect(screen.getAllByRole('img', { name: de.kennzahlen.richtungPositiv }).length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByRole('img', { name: de.kennzahlen.richtungNegativ }).length).toBeGreaterThanOrEqual(1);
  });

  it('blendet die Sharpe-Karte aus, wenn die Sharpe-Ratio nicht berechenbar ist', async () => {
    wiederherstellen = fetchErsatz(mitKennzahlen(FIXTURE, { sharpe: sharpeOhne('zu_wenig_daten') }));
    rendern(<VerlaufKachel />);
    await screen.findByText(de.verlauf.tabelleVermoegen);

    expect(screen.getByText(de.kennzahlen.maxDrawdownKurz)).toBeInTheDocument();
    expect(screen.queryByText(de.kennzahlen.sharpe)).not.toBeInTheDocument();
  });

  it('beschriftet die Gewinnzahl der Kopfzeile als Gesamtgewinn im Zeitraum und erklaert sie', async () => {
    // Regression: die Kopfzahl stand unbeschriftet neben dem Depotwert und der
    // Chart-Tooltip nannte sie "Kursgewinn" — denselben Namen wie die Karte darueber,
    // die eine andere Zahl zeigt (Wertpapiere gegen Einstand statt Depotwert gegen
    // Einzahlung). Beide Namen muessen nebeneinander stehen und unterscheidbar sein. [ADR-016]
    wiederherstellen = fetchErsatz(mitKennzahlen(FIXTURE));
    rendern(<VerlaufKachel />);
    await screen.findByText(de.verlauf.tabelleVermoegen);

    const bezeichnung = de.verlauf.gesamtgewinnDepot;
    expect(screen.getAllByText(de.verlauf.depotwert).length).toBeGreaterThan(0);
    expect(screen.getByText(`${bezeichnung}:`)).toBeInTheDocument();
    expect(
      screen.getByText(`${euro(FIXTURE.fensterGewinnCent)} (${prozentText(FIXTURE.fensterGewinnProzent)})`),
    ).toBeInTheDocument();
    // Die Karte darueber behaelt ihren eigenen Namen.
    expect(screen.getByText(de.kennzahlen.kursgewinn)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: `${de.erklaerungOeffnen}: ${bezeichnung}` }));
    await waitFor(() => {
      expect(screen.getByText(de.verlauf.erklaerungGesamtgewinnZeitraum)).toBeInTheDocument();
    });
  });

  it('stellt den Gewinn des Vergleichs neben den des Depots', async () => {
    const letzter = FIXTURE.punkte[2]!;
    wiederherstellen = fetchErsatz(
      mitKennzahlen({
        ...FIXTURE,
        benchmark: { isin: 'IE00B4K48X80', name: 'MSCI Europe' },
        punkte: [
          ...FIXTURE.punkte.slice(0, 2),
          {
            ...letzter,
            benchmarkCent: 27_000_000,
            benchmarkGewinnCent: -1_234_500,
            benchmarkProzent: -0.0429,
            differenzCent: 8_280_741,
            differenzProzent: FIXTURE.fensterGewinnProzent + 0.0429,
          },
        ],
      }),
    );
    rendern(<VerlaufKachel />);
    await screen.findByText(de.verlauf.tabelleVermoegen);

    expect(screen.getByText(`${de.verlauf.gesamtgewinnDepot}:`)).toBeInTheDocument();
    expect(screen.getByText('MSCI Europe:')).toBeInTheDocument();
    expect(screen.getByText(`${euro(1_234_500)} (${prozentText(0.0429)})`)).toBeInTheDocument();
    // Depot minus Vergleich: 7.046.241 - (-1.234.500) Cent, 0,2450... - (-0,0429).
    expect(screen.getByText(`${de.verlauf.differenz}:`)).toBeInTheDocument();
    expect(
      screen.getByText(`${euro(8_280_741)} (${prozentText(FIXTURE.fensterGewinnProzent + 0.0429)})`),
    ).toBeInTheDocument();
  });

  it('nennt die Kopfzahl im Modus "Rendite" fensterbezogen', async () => {
    wiederherstellen = fetchErsatz(mitKennzahlen(FIXTURE));
    rendern(<VerlaufKachel />);
    await screen.findByText(de.verlauf.tabelleVermoegen);

    await userEvent.click(screen.getByRole('tab', { name: de.verlauf.rendite }));
    await screen.findByText(de.verlauf.tabelleRendite);

    // Der Kopfwert ist dort die Differenz ueber das Fenster, nicht der Stand von heute.
    // Wie im Tooltip: Prozent vor dem Betrag, Kurzname statt "Gesamtgewinn Depot".
    expect(screen.getByText(`${de.verlauf.depot}:`)).toBeInTheDocument();
    expect(
      screen.getByText(`${prozentText(FIXTURE.fensterGewinnProzent)} (${euro(FIXTURE.fensterGewinnCent)})`),
    ).toBeInTheDocument();
    // "Gesamtgewinn" allein steht dort nur noch als Spaltenkopf der verborgenen
    // Tabelle, nicht mehr an einer Kopfzahl.
    expect(
      screen.queryByRole('button', { name: `${de.erklaerungOeffnen}: ${de.verlauf.gesamtgewinn}` }),
    ).not.toBeInTheDocument();
  });
});
