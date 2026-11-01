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
import type { Jahre, Zeitreihe } from '@/lib/api';
import { VerlaufKachel } from '@/features/verlauf/VerlaufKachel';
import { JahresTabelle } from '@/features/verlauf/JahresTabelle';
import { erwarteBarrierefrei, euro, fetchErsatz, fokussieren, prozentText, rendern } from './hilfen';
import { drift, kennzahlenAntwort, sharpeOhne, volatilitaetOhne } from './fixtures';

const FIXTURE: Zeitreihe = {
  stand: '2026-08-26T12:08:00+02:00',
  drift: drift(),
  grob: false,
  reiheLeer: false,
  zeitraum: 'max',
  ausschnitt: { von: '2024-01-01', bis: '2026-08-26' },
  tage: ['2024-01-01', '2024-01-15', '2025-06-01', '2026-08-26'],
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

const JAHRE_FIXTURE: Jahre = {
  stand: FIXTURE.stand,
  drift: drift(),
  benchmark: null,
  jahre: [
    {
      jahr: '2025',
      ab: '2025-03-03',
      bis: null,
      twr: -0.04,
      vergleich: null,
      teuerung: 0.021,
      teuerungBisMonat: '2025-12',
      real: 0.96 / 1.021 - 1,
      gewinnCent: -1_200_000,
      einzahlungCent: 30_000_000,
      endwertCent: 28_800_000,
    },
    {
      jahr: '2026',
      ab: null,
      bis: '2026-08-26',
      twr: 0.08,
      vergleich: null,
      teuerung: 0.012,
      teuerungBisMonat: '2026-06',
      real: 1.08 / 1.012 - 1,
      gewinnCent: 2_500_000,
      einzahlungCent: 600_000,
      endwertCent: 37_805_537,
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
      : pfad.includes('/api/jahre')
        ? { body: JAHRE_FIXTURE }
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

  it('fragt nach dem Verschieben des Reglers den freien Zeitraum ab, ohne Segment', async () => {
    const pfade: string[] = [];
    const antworten = mitKennzahlen(FIXTURE);
    wiederherstellen = fetchErsatz((pfad: string) => {
      pfade.push(pfad);
      return antworten(pfad);
    });
    rendern(<VerlaufKachel />);
    await screen.findByText(de.verlauf.tabelleVermoegen);

    const beginn = screen.getByRole('slider', { name: de.verlauf.reglerBeginn });
    expect(beginn).toHaveAttribute('aria-valuetext', '01.01.2024');
    fokussieren(beginn);
    await userEvent.keyboard('{ArrowRight}');

    await waitFor(() => {
      expect(pfade).toContain('/api/zeitreihe?von=2024-01-15&bis=2026-08-26&benchmark=IE00B4L5Y983');
    });
    const zeitraumwahl = screen.getByRole('radiogroup', { name: de.verlauf.zeitraum });
    for (const radio of within(zeitraumwahl).getAllByRole('radio')) expect(radio).toHaveAttribute('aria-checked', 'false');
    // Der freie Zeitraum ueberlebt kein Neuladen, der gemerkte feste bleibt unberuehrt.
    expect(localStorage.getItem('portfolio.zeitraum')).toBeNull();
  });

  it('springt nach einem Klick auf die Drawdown-Karte auf Max und zeichnet den Drawdown ein', async () => {
    const pfade: string[] = [];
    const antworten = mitKennzahlen(FIXTURE);
    wiederherstellen = fetchErsatz((pfad: string) => {
      pfade.push(pfad);
      return antworten(pfad);
    });
    rendern(<VerlaufKachel />);
    await screen.findByText(de.verlauf.tabelleVermoegen);
    await userEvent.click(screen.getByRole('radio', { name: de.verlauf.zeitraeume['1j'] }));
    await waitFor(() => {
      expect(pfade.some((p) => p.includes('zeitraum=1j'))).toBe(true);
    });

    const knopf = screen.getByRole('button', { name: de.verlauf.drawdownZeigen });
    await userEvent.click(knopf);

    expect(knopf).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('radio', { name: de.verlauf.zeitraeume.max })).toBeChecked();
    // Der Wert der Karte, ueber die ganze Historie.
    expect(await screen.findByRole('img', { name: /Markiert: .*-15,20\s%/ })).toBeInTheDocument();

    // Ein anderer Zeitraum nimmt die Markierung weg.
    await userEvent.click(screen.getByRole('radio', { name: de.verlauf.zeitraeume['1j'] }));
    expect(knopf).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('img', { name: /Markiert/ })).toBeNull();
  });

  it('faellt auf den festen Zeitraum zurueck, wenn der freie scheitert', async () => {
    const antworten = mitKennzahlen(FIXTURE);
    let frei = 0;
    wiederherstellen = fetchErsatz((pfad: string) => {
      if (!pfad.includes('von=')) return antworten(pfad);
      frei += 1;
      return { status: 400, body: { code: 'E_PARAMETER' } };
    });
    rendern(<VerlaufKachel />);
    await screen.findByText(de.verlauf.tabelleVermoegen);

    const beginn = screen.getByRole('slider', { name: de.verlauf.reglerBeginn });
    fokussieren(beginn);
    await userEvent.keyboard('{ArrowRight}');

    await waitFor(() => {
      expect(frei).toBe(1);
    });
    await waitFor(() => {
      expect(screen.getByRole('slider', { name: de.verlauf.reglerBeginn })).toHaveAttribute('aria-valuetext', '01.01.2024');
    });
    expect(screen.getByRole('radio', { name: de.verlauf.zeitraeume.max })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('zeigt den Regler in der Demo gesperrt, den Grund im Popover', async () => {
    const meta = document.createElement('meta');
    meta.name = 'demo-modus';
    meta.content = 'true';
    document.head.append(meta);
    // jsdom kennt kein Pointer-Capture; Radix ruft es auch am gesperrten Regler.
    Element.prototype.setPointerCapture = () => undefined;
    Element.prototype.releasePointerCapture = () => undefined;
    Element.prototype.hasPointerCapture = () => false;
    try {
      wiederherstellen = fetchErsatz(mitKennzahlen(FIXTURE));
      rendern(<VerlaufKachel />);
      await screen.findByText(de.verlauf.tabelleVermoegen);

      const griffe = screen.getAllByRole('slider');
      for (const griff of griffe) {
        expect(griff).toHaveAttribute('data-disabled');
        expect(griff).toHaveAccessibleDescription(de.verlauf.reglerDemo);
      }
      expect(screen.queryByRole('dialog')).toBeNull();
      await userEvent.click(griffe[0]!);
      expect(await screen.findByRole('dialog')).toHaveTextContent(de.verlauf.reglerDemo);
    } finally {
      meta.remove();
    }
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
    // Realrendite-Subline nennt IZF und Inflation. Dazu die Einordnung der Sharpe-Ratio.
    expect(screen.getByText(prozentText(KENNZAHLEN_FIXTURE.kursgewinnProzent))).toBeInTheDocument();
    expect(screen.getByText(de.kennzahlen.sublineTwrGesamt(prozentText(KENNZAHLEN_FIXTURE.twr!)))).toBeInTheDocument();
    expect(
      screen.getByText(de.kennzahlen.sublineReal('5,80 %', prozentText(KENNZAHLEN_FIXTURE.inflation!))),
    ).toBeInTheDocument();
    expect(screen.queryByText('15.02.26 – 20.03.26')).not.toBeInTheDocument();
    expect(screen.getByText(de.kennzahlen.sharpeBewertung.gut)).toBeInTheDocument();

    // Die Richtung tragen Lucide-Icons, nur an den Kopfwerten: Kursgewinn, TWR, Real; die
    // Sublines von TWR und Real stehen ohne Pfeil, Sharpe hat keins. Max. Drawdown ist als
    // einziger negativ.
    expect(screen.getAllByRole('img', { name: de.kennzahlen.richtungPositiv }).length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByRole('img', { name: de.kennzahlen.richtungNegativ }).length).toBeGreaterThanOrEqual(1);
  });

  it('nennt investiertes Kapital, Inflation und Volatilitaet auf den Karten (ADR-059)', async () => {
    wiederherstellen = fetchErsatz(mitKennzahlen(FIXTURE));
    rendern(<VerlaufKachel />);
    await screen.findByText(de.verlauf.tabelleVermoegen);

    expect(screen.getByText(de.kennzahlen.sublineInvestiert(euro(KENNZAHLEN_FIXTURE.investiertCent)))).toBeInTheDocument();
    expect(screen.getByText(de.kennzahlen.sublineVolatilitaet('14,20 %'))).toBeInTheDocument();
  });

  it('laesst die Volatilitaetszeile weg, wenn sie nicht berechenbar ist', async () => {
    wiederherstellen = fetchErsatz(mitKennzahlen(FIXTURE, { volatilitaetProJahr: volatilitaetOhne('zu_wenig_daten') }));
    rendern(<VerlaufKachel />);
    await screen.findByText(de.verlauf.tabelleVermoegen);

    expect(screen.getByText(de.kennzahlen.maxDrawdownKurz)).toBeInTheDocument();
    expect(screen.queryByText(/^Volatilität:/)).not.toBeInTheDocument();
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

  it('schaltet auf die Jahrestabelle um, ohne Chart, Zeitraum und Moduswahl, und merkt es sich', async () => {
    wiederherstellen = fetchErsatz(mitKennzahlen(FIXTURE));
    rendern(<VerlaufKachel />);
    await screen.findByText(de.verlauf.tabelleVermoegen);

    await userEvent.click(screen.getByRole('radio', { name: de.verlauf.darstellungTabelle }));
    const bereich = await screen.findByRole('region', { name: de.verlauf.jahre.tabelle });
    const tabelle = within(bereich).getByRole('table');
    expect(localStorage.getItem('portfolio.verlaufDarstellung')).toBe('tabelle');

    const zeilen = within(tabelle).getAllByRole('row');
    expect(within(zeilen[2]!).getByRole('rowheader')).toHaveTextContent(`2026 ${de.verlauf.jahre.bis('26.08.')}`);
    expect(within(zeilen[1]!).getByRole('rowheader')).toHaveTextContent(`2025 ${de.verlauf.jahre.ab('03.03.')}`);
    // Ohne Vergleich keine Vergleichsspalte; der Verlust traegt Pfeil, nicht nur Farbe.
    expect(within(tabelle).queryByText(/^Vergleich/)).toBeNull();
    expect(within(zeilen[1]!).getAllByRole('img', { name: de.kennzahlen.richtungNegativ }).length).toBeGreaterThan(0);
    expect(within(zeilen[2]!).getByTitle(/Inflation bis Juni 2026/)).toBeInTheDocument();

    expect(screen.queryByRole('tab', { name: de.verlauf.rendite })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: de.verlauf.zeitraum })).toBeNull();
    expect(screen.queryByRole('table', { name: de.verlauf.tabelleVermoegen })).toBeNull();
    expect(screen.queryByRole('slider')).toBeNull();
    await erwarteBarrierefrei(document.body);

    await userEvent.click(screen.getByRole('radio', { name: de.verlauf.darstellungVerlauf }));
    expect(await screen.findByRole('table', { name: de.verlauf.tabelleVermoegen })).toBeInTheDocument();
  });

  it('nennt den Inflationsstand auch bei einem abgeschlossenen Jahr ohne Dezemberzahl', () => {
    const [aelter, neuer] = JAHRE_FIXTURE.jahre;
    rendern(<JahresTabelle daten={{ ...JAHRE_FIXTURE, jahre: [{ ...aelter!, teuerungBisMonat: '2025-11' }, neuer!] }} />);
    const zeilen = screen.getAllByRole('row');
    expect(within(zeilen[1]!).getByTitle(/Inflation bis November 2025/)).toBeInTheDocument();
  });

  it('schreibt die Spanne eines Jahres, das in sich beginnt und endet, in eine Klammer', () => {
    const [aelter] = JAHRE_FIXTURE.jahre;
    rendern(<JahresTabelle daten={{ ...JAHRE_FIXTURE, jahre: [{ ...aelter!, bis: '2025-10-20' }] }} />);
    expect(screen.getByRole('rowheader')).toHaveTextContent(`2025 ${de.verlauf.jahre.abBis('03.03.', '20.10.')}`);
  });

  it('erklaert im Tooltip, warum ein Wert nicht berechenbar ist', () => {
    const [aelter, neuer] = JAHRE_FIXTURE.jahre;
    const daten: Jahre = {
      ...JAHRE_FIXTURE,
      benchmark: { isin: 'IE00B4L5Y983', name: 'MSCI World' },
      jahre: [{ ...aelter!, twr: null, vergleich: null, real: null }, { ...neuer!, teuerung: null, real: null }],
    };
    rendern(<JahresTabelle daten={daten} />);
    const [, erste, zweite] = screen.getAllByRole('row');
    const j = de.verlauf.jahre;
    expect(within(erste!).getByTitle(j.ohneRendite)).toHaveTextContent(de.xirr.nichtBerechenbar);
    expect(within(erste!).getByTitle(j.ohneVergleich('MSCI World'))).toBeInTheDocument();
    expect(within(erste!).getByTitle(j.realOhneRendite)).toBeInTheDocument();
    expect(within(zweite!).getByTitle(j.ohneInflation)).toBeInTheDocument();
    expect(within(zweite!).getByTitle(j.realOhneInflation)).toBeInTheDocument();
  });
});
