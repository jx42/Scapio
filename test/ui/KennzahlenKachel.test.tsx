// @vitest-environment jsdom
/*
 * Kachel 3: eine Abfrage, keine Auswahl. Der Reihe nach:
 * Fixture, Skeleton, Leerzustand, Fehlerisolation, Tastatur, axe, deutsches Format.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { de } from '@/i18n/de';
import { KennzahlenKachel } from '@/features/kennzahlen/KennzahlenKachel';
import { erwarteBarrierefrei, euro, fetchErsatz, fokussieren, rendern } from './hilfen';
import { kennzahlenAntwort, realFixture, xirrOk } from './fixtures';

const FIXTURE = kennzahlenAntwort({
  gebuehrenCent: -299,
  real: realFixture(xirrOk(0.036), {
    fisher: 0.037,
    teuerungBisMonat: '2026-07',
    teuerungLaufendesJahr: 0.0258,
  }),
  zinsenTransaktionen: [
    {
      txId: 'tx-zins-2',
      tag: '2026-08-15',
      typ: 'INTEREST',
      isin: null,
      name: null,
      bezug: 'verrechnungskonto',
      betragCent: 1_234,
    },
    {
      txId: 'tx-zins-1',
      tag: '2026-07-15',
      typ: 'DIVIDEND',
      isin: 'IE00B4L5Y983',
      name: 'iShares Core MSCI World',
      bezug: 'wertpapier',
      betragCent: 11_111,
    },
  ],
  steuernTransaktionen: [
    {
      txId: 'tx-steuer-1',
      tag: '2026-08-15',
      typ: 'TAX',
      isin: 'IE00B4L5Y983',
      name: 'iShares Core MSCI World',
      bezug: 'wertpapier',
      betragCent: -234_567,
    },
    // Ohne Bezugswertpapier von der Bank: die Zeile sagt das, statt es zu raten. [P-08]
    {
      txId: 'tx-steuer-2',
      tag: '2026-03-02',
      typ: 'TAX_RETURN',
      isin: null,
      name: null,
      bezug: 'unbekannt',
      betragCent: 1_000,
    },
  ],
  gebuehrenTransaktionen: [
    {
      txId: 'tx-gebuehr-1',
      tag: '2026-07-01',
      typ: 'FEE',
      isin: null,
      name: null,
      bezug: 'unbekannt',
      betragCent: -299,
    },
  ],
  realisierteVerkaeufe: [
    {
      txId: 'tx-verkauf-1',
      tag: '2026-05-10',
      isin: 'IE00B4L5Y983',
      name: 'iShares Core MSCI World',
      gewinnCent: 45_000,
    },
  ],
});

let wiederherstellen: (() => void) | null = null;

afterEach(() => {
  wiederherstellen?.();
  wiederherstellen = null;
});

/*
 * Kein eigener Leerzustand-Test: KennzahlenKachel meldet `leer` nur, wenn
 * `daten === undefined` bei abgeschlossener, fehlerfreier Abfrage — das kann
 * `useQuery` laut eigener Garantie (`isSuccess` ⇒ `data` gesetzt) nicht liefern.
 * Der Zweig ist toter Code, kein erreichbarer Nutzerpfad; ihn zu erzwingen hiesse,
 * eine unmoegliche Serverantwort zu simulieren und einen Test zu schreiben, der nichts
 * Echtes belegt. Das Rendering des Leerzustands selbst ist generisch in Kachel.test.tsx
 * geprueft. Siehe FluesseKachel fuer denselben Fall bzw. AufteilungKachel/Top25/Verlauf
 * fuer eine Kachel, deren Leerzustand ueber echte, leere Nutzdaten erreichbar ist.
 */
describe('KennzahlenKachel', () => {
  it('rendert mit Fixture-Daten und zeigt Kennwerte im deutschen Format', async () => {
    wiederherstellen = fetchErsatz(() => ({ body: FIXTURE }));
    rendern(<KennzahlenKachel />);

    expect(await screen.findByText(euro(FIXTURE.kursgewinnCent))).toBeInTheDocument();
    expect(screen.queryByText(euro(FIXTURE.gesamtCent))).not.toBeInTheDocument();
  });

  it('zeigt Renditen- und Risikozeilen ohne separates Aufklappen', async () => {
    wiederherstellen = fetchErsatz(() => ({ body: FIXTURE }));
    rendern(<KennzahlenKachel />);
    await screen.findByText(euro(FIXTURE.kursgewinnCent));

    expect(screen.getByText(de.kennzahlen.twr)).toBeInTheDocument();
    expect(screen.getByText(de.kennzahlen.sharpe)).toBeInTheDocument();
  });

  it('schaltet den Auf-/Zuklapp-Knopf zwischen Mehr zeigen und Weniger zeigen um', async () => {
    wiederherstellen = fetchErsatz(() => ({ body: FIXTURE }));
    rendern(<KennzahlenKachel />);
    await screen.findByText(euro(FIXTURE.kursgewinnCent));

    const mehrKnopf = screen.getByRole('button', { name: de.kennzahlen.mehrZeigen });
    await userEvent.click(mehrKnopf);
    expect(screen.getByRole('button', { name: de.kennzahlen.wenigerZeigen })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: de.kennzahlen.wenigerZeigen }));
    expect(screen.getByRole('button', { name: de.kennzahlen.mehrZeigen })).toBeInTheDocument();
  });

  it('erklaert bei ausgeschalteter Top 25, wie man sie einschaltet, und nur dann', async () => {
    wiederherstellen = fetchErsatz(() => ({ body: FIXTURE }));
    const { container, unmount } = rendern(<KennzahlenKachel top25Aus />);
    await userEvent.click(await screen.findByRole('button', { name: de.top25.ausHinweis }));
    expect(await screen.findByText(de.top25.ausSchritte[1]!)).toBeInTheDocument();
    await erwarteBarrierefrei(container);
    unmount();

    rendern(<KennzahlenKachel />);
    await screen.findByText(euro(FIXTURE.kursgewinnCent));
    expect(screen.queryByRole('button', { name: de.top25.ausHinweis })).not.toBeInTheDocument();
  });

  it('zeigt die Hinweise des Kerns im Dialog hinter der Titelzeile, ausser denen, die anderswo stehen', async () => {
    wiederherstellen = fetchErsatz(() => ({
      body: {
        ...FIXTURE,
        hinweise: [
          { code: 'H_AUSBUCHUNG', anzahl: 1 },
          { code: 'H_KURSLUECKE', anzahl: 3 },
          { code: 'H_KEIN_VPI', anzahl: null },
          { code: 'H_DRIFT_AUSGESETZT', anzahl: null },
        ],
      },
    }));
    const { container } = rendern(<KennzahlenKachel />);
    const knopf = await screen.findByRole('button', { name: de.hinweisKnopf.anzahl(2, '2') });
    await erwarteBarrierefrei(container);
    expect(screen.queryByText(de.kennzahlen.hinweis.H_AUSBUCHUNG(1, '1'))).not.toBeInTheDocument();

    await userEvent.click(knopf);
    const dialog = screen.getByRole('dialog', { name: de.kennzahlen.hinweiseTitel });
    expect(within(dialog).getByText(de.kennzahlen.hinweis.H_AUSBUCHUNG(1, '1'))).toBeInTheDocument();
    expect(within(dialog).getByText(de.kennzahlen.hinweis.H_KURSLUECKE(3, '3'))).toBeInTheDocument();
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByText(/H_KEIN_VPI|H_DRIFT_AUSGESETZT/)).not.toBeInTheDocument();
  });

  it('zeigt keinen Hinweis-Knopf, wenn nur Hinweise kommen, die anderswo stehen', async () => {
    wiederherstellen = fetchErsatz(() => ({
      body: { ...FIXTURE, hinweise: [{ code: 'H_KEIN_VPI', anzahl: null }] },
    }));
    rendern(<KennzahlenKachel />);
    await screen.findByText(euro(FIXTURE.kursgewinnCent));
    expect(screen.queryByRole('button', { name: /Hinweis/ })).not.toBeInTheDocument();
  });

  it('zeigt das Skeleton, solange die Abfrage haengt', () => {
    wiederherstellen = fetchErsatz(() => 'haengt');
    const { container } = rendern(<KennzahlenKachel />);

    expect(screen.getByText(de.zustand.laedt)).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('zeigt den Fehlerzustand, ohne die Anwendung zu reissen, wenn der Server ablehnt', async () => {
    wiederherstellen = fetchErsatz(() => ({
      status: 500,
      body: { fehler: { code: 'E_DB', text: 'Die Datenbank ist nicht erreichbar.' } },
    }));
    rendern(<KennzahlenKachel />);

    expect(await screen.findByText(de.zustand.fehler)).toBeInTheDocument();
    expect(screen.getByText('Die Datenbank ist nicht erreichbar.')).toBeInTheDocument();
  });

  it('macht die Erklaerungs-Knoepfe mit der Tastatur erreichbar', async () => {
    wiederherstellen = fetchErsatz(() => ({ body: FIXTURE }));
    rendern(<KennzahlenKachel />);
    await screen.findByText(euro(FIXTURE.kursgewinnCent));

    const erklaerungen = screen.getAllByRole('button', { name: new RegExp(`^${de.erklaerungOeffnen}:`) });
    expect(erklaerungen.length).toBeGreaterThan(0);

    await userEvent.tab();
    expect(erklaerungen[0]).toHaveFocus();
  });

  it('besteht axe ohne Verstoss, sobald die Tabelle steht', async () => {
    wiederherstellen = fetchErsatz(() => ({ body: FIXTURE }));
    const { container } = rendern(<KennzahlenKachel />);
    await screen.findByText(euro(FIXTURE.kursgewinnCent));
    await erwarteBarrierefrei(container);
  });

  it('zeigt "nicht berechenbar" statt eines rohen Bindestrichs, wenn TWR/Jahr fehlt', async () => {
    wiederherstellen = fetchErsatz(() => ({ body: { ...FIXTURE, twrProJahr: null } }));
    rendern(<KennzahlenKachel />);
    await screen.findByText(euro(FIXTURE.kursgewinnCent));
    expect(screen.getAllByText(de.xirr.nichtBerechenbar).length).toBeGreaterThan(0);
  });

  it('zeigt eine Anmerkung im Erklaerungs-Popover statt als staendig sichtbaren Text', async () => {
    wiederherstellen = fetchErsatz(() => ({ body: { ...FIXTURE, twrProJahr: null } }));
    rendern(<KennzahlenKachel />);
    await screen.findByText(euro(FIXTURE.kursgewinnCent));

    expect(screen.queryByText(de.kennzahlen.twrProJahrZuKurz)).not.toBeInTheDocument();

    const knopf = screen.getByRole('button', {
      name: `${de.erklaerungOeffnen}: ${de.kennzahlen.twrProJahr}`,
    });
    await userEvent.click(knopf);

    await waitFor(() => {
      expect(screen.getByText(de.kennzahlen.twrProJahrZuKurz)).toBeInTheDocument();
    });
  });

  it('stellt der Ø Inflation p.a. den Durchschnitt des laufenden Jahres im Popover zur Seite', async () => {
    // Zwei verschiedene Fragen: "wie teuer wurde es ueber die Anlagedauer" und
    // "wie teuer wird es gerade". Ohne die zweite Zahl liest sich die erste wie beides.
    wiederherstellen = fetchErsatz(() => ({ body: FIXTURE }));
    rendern(<KennzahlenKachel />);
    await screen.findByText(euro(FIXTURE.kursgewinnCent));

    const knopf = screen.getByRole('button', {
      name: `${de.erklaerungOeffnen}: ${de.kennzahlen.inflation}`,
    });
    await userEvent.click(knopf);

    await waitFor(() => {
      expect(
        screen.getByText(new RegExp(de.kennzahlen.inflationLaufendesJahr('2026', '2,58 %'))),
      ).toBeInTheDocument();
    });
  });

  it('laesst den Hinweis zum laufenden Jahr weg, solange dafuer keine Zahl vorliegt', async () => {
    wiederherstellen = fetchErsatz(() => ({
      body: { ...FIXTURE, real: { ...FIXTURE.real, teuerungLaufendesJahr: null } },
    }));
    rendern(<KennzahlenKachel />);
    await screen.findByText(euro(FIXTURE.kursgewinnCent));

    const knopf = screen.getByRole('button', {
      name: `${de.erklaerungOeffnen}: ${de.kennzahlen.inflation}`,
    });
    await userEvent.click(knopf);

    await waitFor(() => {
      expect(screen.getByText(de.kennzahlen.erklaerung.inflation)).toBeInTheDocument();
    });
    expect(screen.queryByText(/2026 bisher/)).not.toBeInTheDocument();
  });

  it('schweigt zum laufenden Jahr, sobald die Teuerung bis in den Basismonat reicht', async () => {
    // Der Hinweis "fuer das laufende Jahr liegt noch keine Zahl vor" gehoert nur dorthin,
    // wo er stimmt — sonst steht er dauerhaft unter einer Zahl, die es laengst gibt.
    wiederherstellen = fetchErsatz(() => ({ body: FIXTURE }));
    rendern(<KennzahlenKachel />);
    await screen.findByText(euro(FIXTURE.kursgewinnCent));

    const knopf = screen.getByRole('button', { name: `${de.erklaerungOeffnen}: ${de.kennzahlen.real}` });
    await userEvent.click(knopf);

    await waitFor(() => {
      expect(screen.getByText(new RegExp(de.kennzahlen.realBasis('Juli 2026')))).toBeInTheDocument();
    });
    expect(screen.queryByText(/liegt noch keine Zahl vor/)).not.toBeInTheDocument();
  });

  it('zeigt Volatilitaet, Max. Drawdown und Sharpe-Ratio im deutschen Format', async () => {
    wiederherstellen = fetchErsatz(() => ({ body: FIXTURE }));
    rendern(<KennzahlenKachel />);
    await screen.findByText(euro(FIXTURE.kursgewinnCent));

    expect(screen.getByText('14,20 %')).toBeInTheDocument();
    expect(screen.getByText('15,20 %')).toBeInTheDocument();
    expect(screen.getByText('0,85')).toBeInTheDocument();
  });

  it('blendet Volatilitaet und Sharpe-Ratio aus, wenn sie nicht berechenbar sind', async () => {
    wiederherstellen = fetchErsatz(() => ({
      body: {
        ...FIXTURE,
        volatilitaetProJahr: { art: 'zu_wenig_daten' },
        sharpe: { art: 'kein_zins' },
      },
    }));
    rendern(<KennzahlenKachel />);
    await screen.findByText(euro(FIXTURE.kursgewinnCent));

    expect(screen.queryByText(de.kennzahlen.volatilitaet)).not.toBeInTheDocument();
    expect(screen.queryByText(de.kennzahlen.sharpe)).not.toBeInTheDocument();
    expect(screen.getByText(de.kennzahlen.maxDrawdown)).toBeInTheDocument();
  });

  it('nennt den durchschnittlichen risikofreien Zins im Erklaerungstext der Sharpe-Ratio', async () => {
    wiederherstellen = fetchErsatz(() => ({ body: FIXTURE }));
    rendern(<KennzahlenKachel />);
    await screen.findByText(euro(FIXTURE.kursgewinnCent));

    const sharpeKnopf = screen.getByRole('button', {
      name: `${de.erklaerungOeffnen}: ${de.kennzahlen.sharpe}`,
    });
    await userEvent.click(sharpeKnopf);
    await waitFor(() => {
      expect(screen.getByText(/2,30 %/)).toBeInTheDocument();
    });
  });

  it('oeffnet per Klick auf "Zinsen und Erträge" den Dialog mit den zugehoerigen Transaktionen', async () => {
    wiederherstellen = fetchErsatz(() => ({ body: FIXTURE }));
    rendern(<KennzahlenKachel />);
    await screen.findByText(euro(FIXTURE.kursgewinnCent));

    await userEvent.click(
      screen.getByRole('button', { name: de.kennzahlen.detailsOeffnen(de.kennzahlen.zinsen) }),
    );

    const dialog = await screen.findByRole('dialog', { name: de.kennzahlen.zinsen });
    const innerhalb = within(dialog);
    expect(innerhalb.getByText('iShares Core MSCI World')).toBeInTheDocument();
    expect(innerhalb.getByText(de.kennzahlen.ertragsTyp.DIVIDEND)).toBeInTheDocument();
    expect(innerhalb.getByText(de.kennzahlen.ertragsTyp.INTEREST)).toBeInTheDocument();
    expect(innerhalb.getByText(euro(11_111, true))).toBeInTheDocument();
    expect(innerhalb.getByText('15.07.2026')).toBeInTheDocument();
    expect(innerhalb.queryByText(de.kennzahlen.steuern)).not.toBeInTheDocument();

    // Die Wofuer-Spalte: Zinsen auf Cash gehoeren zum Verrechnungskonto, eine
    // Dividende zu einem Wertpapier.
    expect(innerhalb.getByRole('columnheader', { name: de.kennzahlen.detailsSpalteWofuer })).toBeInTheDocument();
    expect(innerhalb.getByText(de.kennzahlen.bezugVerrechnungskonto)).toBeInTheDocument();
  });

  it('nennt in der Wofuer-Spalte das Wertpapier einer Steuer und gesteht einen fehlenden Bezug ein', async () => {
    wiederherstellen = fetchErsatz(() => ({ body: FIXTURE }));
    rendern(<KennzahlenKachel />);
    await screen.findByText(euro(FIXTURE.kursgewinnCent));

    await userEvent.click(
      screen.getByRole('button', { name: de.kennzahlen.detailsOeffnen(de.kennzahlen.steuern) }),
    );

    const dialog = await screen.findByRole('dialog', { name: de.kennzahlen.steuern });
    const zeilen = within(dialog).getAllByRole('row');

    // Vorabpauschale auf einen konkreten ETF — Abzug, also negativ.
    const abzug = within(zeilen.at(-2)!);
    expect(abzug.getByText(de.kennzahlen.ertragsTyp.TAX)).toBeInTheDocument();
    expect(abzug.getByText('iShares Core MSCI World')).toBeInTheDocument();
    expect(abzug.getByText(euro(-234_567, true))).toBeInTheDocument();

    // Erstattung ohne Bezugswertpapier: positiv, und die Spalte raet nichts.
    const erstattung = within(zeilen.at(-1)!);
    expect(erstattung.getByText(de.kennzahlen.ertragsTyp.TAX_RETURN)).toBeInTheDocument();
    expect(erstattung.getByText(de.kennzahlen.bezugUnbekannt)).toBeInTheDocument();
    expect(erstattung.getByText(euro(1_000, true))).toBeInTheDocument();
  });

  it('oeffnet per Klick auf "Realisierte Gewinne" den Dialog mit den FIFO-Verkaeufen', async () => {
    wiederherstellen = fetchErsatz(() => ({ body: FIXTURE }));
    rendern(<KennzahlenKachel />);
    await screen.findByText(euro(FIXTURE.kursgewinnCent));

    await userEvent.click(
      screen.getByRole('button', { name: de.kennzahlen.detailsOeffnen(de.kennzahlen.realisiert) }),
    );

    const dialog = await screen.findByRole('dialog', { name: de.kennzahlen.realisiert });
    const innerhalb = within(dialog);
    expect(innerhalb.getByText('iShares Core MSCI World')).toBeInTheDocument();
    expect(innerhalb.getByText(de.kennzahlen.realisierterVerkauf)).toBeInTheDocument();
    expect(innerhalb.getByText(euro(45_000, true))).toBeInTheDocument();
    expect(innerhalb.getByText('10.05.2026')).toBeInTheDocument();
  });

  it('macht den Kennzahl-Dialog mit der Tastatur bedienbar und schliesst ihn mit Escape', async () => {
    wiederherstellen = fetchErsatz(() => ({ body: FIXTURE }));
    rendern(<KennzahlenKachel />);
    await screen.findByText(euro(FIXTURE.kursgewinnCent));

    const knopf = screen.getByRole('button', { name: de.kennzahlen.detailsOeffnen(de.kennzahlen.zinsen) });
    fokussieren(knopf);
    await userEvent.keyboard('{Enter}');

    await screen.findByRole('dialog', { name: de.kennzahlen.zinsen });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    // Ohne Rueckgabe landet der Fokus auf <body> (WCAG 2.4.3).
    expect(knopf).toHaveFocus();
  });

  it('besteht axe ohne Verstoss, waehrend der Kennzahl-Dialog offen ist', async () => {
    wiederherstellen = fetchErsatz(() => ({ body: FIXTURE }));
    const { container } = rendern(<KennzahlenKachel />);
    await screen.findByText(euro(FIXTURE.kursgewinnCent));

    await userEvent.click(
      screen.getByRole('button', { name: de.kennzahlen.detailsOeffnen(de.kennzahlen.realisiert) }),
    );
    await screen.findByRole('dialog', { name: de.kennzahlen.realisiert });

    await erwarteBarrierefrei(container);
  });
});
