/*
 * Kachel 3, Ansicht: die Zahlentafel.
 *
 * Eine echte Tabelle, keine Reihe von <div>: die Zeilen haben Bezeichnung und Wert,
 * und genau das soll eine Vorlesehilfe auch ansagen. Kopfzeile und Beschriftung sind
 * fuer das Auge unnoetig und deshalb nur fuer die Vorlesehilfe da.
 *
 * Jede Zeile, deren Zahl fehlen KANN, bringt ihren Satz mit: warum sie fehlt. Ein
 * leeres Feld oder ein blosser Strich waere die schlechteste aller Antworten. [P-08]
 */

import { cloneElement, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { de } from '@/i18n/de';
import type { KennzahlenAntwort } from '@/lib/api';
import {
  betragOhneVorzeichen,
  euroAusCent,
  jahrAusMonat,
  maxDrawdownAnzeige,
  monatLang,
  prozent,
  realRendite,
  richtungswert,
  sharpeAnzeige,
  volatilitaetAnzeige,
  vorzeichen,
  xirrAnzeige,
  zahl,
} from '@/lib/format';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Kennzahlzeile } from '@/components/Kennzahlzeile';
import { Table, TableBody, TableCaption, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  KennzahlDetailsDialog,
  ertragsZeilenAlsDetails,
  realisierteZeilenAlsDetails,
} from '@/features/kennzahlen/KennzahlDetailsDialog';

export type KennzahlenAnsichtProps = {
  readonly daten: KennzahlenAntwort;
  /** Kachel ist ueber ihre an Aufteilung gebundene Hoehe hinaus aufgeklappt. */
  readonly ausgeklappt: boolean;
  /** Aktuell gebundene (eingeklappte) Aussenhoehe — Grundlage fuer die Zielhoehe beim Aufklappen. */
  readonly hoehe: number | null;
  /** Meldet einmalig beim Aufklappen die volle Zielhoehe, damit die Kachel dorthin animieren kann. */
  readonly onVolleHoeheAendern: (hoehe: number) => void;
  readonly aufAusklappenUmschalten: () => void;
};

type DetailAuswahl = 'zinsen' | 'steuern' | 'gebuehren' | 'realisiert' | null;

export function KennzahlenAnsicht({
  daten,
  ausgeklappt,
  hoehe,
  onVolleHoeheAendern,
  aufAusklappenUmschalten,
}: KennzahlenAnsichtProps) {
  const [details, setDetails] = useState<DetailAuswahl>(null);
  const xirr = xirrAnzeige(daten.xirr);
  const real = realRendite(daten.real);
  const fortgeschrieben = daten.real.fortgeschriebeneMonate ?? [];
  const laufendesJahr = daten.real.teuerungLaufendesJahr;
  const volatilitaet = volatilitaetAnzeige(daten.volatilitaetProJahr);
  const maxDrawdown = maxDrawdownAnzeige(daten.maxDrawdown);
  const sharpe = sharpeAnzeige(daten.sharpe);

  const rahmenRef = useRef<HTMLDivElement>(null);
  const [sichtbareAnzahl, setSichtbareAnzahl] = useState(Number.POSITIVE_INFINITY);

  const aktiv =
    details === 'zinsen'
      ? {
          titel: de.kennzahlen.zinsen,
          spalteMitte: de.kennzahlen.detailsSpalteWofuer,
          zeilen: ertragsZeilenAlsDetails(daten.zinsenTransaktionen),
        }
      : details === 'steuern'
        ? {
            titel: de.kennzahlen.steuern,
            spalteMitte: de.kennzahlen.detailsSpalteWofuer,
            zeilen: ertragsZeilenAlsDetails(daten.steuernTransaktionen),
          }
        : details === 'gebuehren'
          ? {
              titel: de.kennzahlen.gebuehren,
              spalteMitte: de.kennzahlen.detailsSpalteWofuer,
              zeilen: ertragsZeilenAlsDetails(daten.gebuehrenTransaktionen),
            }
        : details === 'realisiert'
          ? {
              titel: de.kennzahlen.realisiert,
              spalteMitte: de.kennzahlen.detailsSpaltePosition,
              zeilen: realisierteZeilenAlsDetails(daten.realisierteVerkaeufe),
            }
          : null;

  const alleZeilen = [
    <Kennzahlzeile
      key="investiert"
      bezeichnung={de.kennzahlen.einstand}
      wert={euroAusCent(daten.investiertCent)}
      erklaerung={de.kennzahlen.erklaerung.einstand}
    />,
    <Kennzahlzeile
      key="kursgewinn"
      bezeichnung={de.kennzahlen.kursgewinn}
      {...richtungswert(daten.kursgewinnCent, euroAusCent)}
      nebenwert={betragOhneVorzeichen(daten.kursgewinnProzent, prozent)}
      erklaerung={de.kennzahlen.erklaerung.kursgewinn}
    />,
    <Kennzahlzeile
      key="realisiert"
      bezeichnung={de.kennzahlen.realisiert}
      {...richtungswert(daten.realisiertCent, euroAusCent)}
      erklaerung={de.kennzahlen.erklaerung.realisiert}
      onDetails={() => setDetails('realisiert')}
    />,
    <Kennzahlzeile
      key="zinsen"
      bezeichnung={de.kennzahlen.zinsen}
      {...richtungswert(daten.zinsenCent, euroAusCent)}
      erklaerung={de.kennzahlen.erklaerung.zinsen}
      onDetails={() => setDetails('zinsen')}
    />,
    <Kennzahlzeile
      key="steuern"
      bezeichnung={de.kennzahlen.steuern}
      {...richtungswert(daten.steuernCent, euroAusCent)}
      erklaerung={de.kennzahlen.erklaerung.steuern}
      onDetails={() => setDetails('steuern')}
    />,
    <Kennzahlzeile
      key="gebuehren"
      bezeichnung={de.kennzahlen.gebuehren}
      {...richtungswert(daten.gebuehrenCent, euroAusCent)}
      erklaerung={de.kennzahlen.erklaerung.gebuehren}
      onDetails={() => setDetails('gebuehren')}
    />,
    <Kennzahlzeile
      key="twr"
      bezeichnung={de.kennzahlen.twr}
      {...richtungswert(daten.twr, prozent)}
      erklaerung={de.kennzahlen.erklaerung.twr}
      anmerkung={daten.twrGrob === true ? de.kennzahlen.twrGrob : null}
    />,
    <Kennzahlzeile
      key="twrProJahr"
      bezeichnung={de.kennzahlen.twrProJahr}
      {...richtungswert(daten.twrProJahr, prozent)}
      erklaerung={de.kennzahlen.erklaerung.twrProJahr}
      anmerkung={daten.twrProJahr === null ? de.kennzahlen.twrProJahrZuKurz : null}
    />,
    <Kennzahlzeile
      key="xirr"
      bezeichnung={de.kennzahlen.xirr}
      wert={xirr.wert}
      richtung={xirr.rate === null ? 'neutral' : vorzeichen(xirr.rate).richtung}
      pfeil={xirr.rate === null ? '' : vorzeichen(xirr.rate).pfeil}
      erklaerung={de.kennzahlen.erklaerung.xirr}
      anmerkung={xirr.satz}
    />,
    <Kennzahlzeile
      key="inflation"
      bezeichnung={de.kennzahlen.inflation}
      wert={daten.inflation === null ? de.xirr.nichtBerechenbar : prozent(daten.inflation)}
      erklaerung={de.kennzahlen.erklaerung.inflation}
      anmerkung={inflationAnmerkung(
        daten.inflation === null,
        laufendesJahr === null || laufendesJahr === undefined
          ? null
          : de.kennzahlen.inflationLaufendesJahr(jahrAusMonat(daten.real.basisMonat), prozent(laufendesJahr)),
      )}
    />,
    <Kennzahlzeile
      key="real"
      bezeichnung={de.kennzahlen.real}
      {...richtungswert(real.rate, prozent)}
      erklaerung={de.kennzahlen.erklaerung.real}
      anmerkung={realAnmerkung(
        real.rate === null ? (xirr.satz ?? de.kennzahlen.inflationFehlt) : null,
        real.ersatz,
        daten.real.teuerungBisMonat,
        daten.real.basisMonat,
        fortgeschrieben.length,
      )}
    />,
    volatilitaet === null ? null : (
      <Kennzahlzeile
        key="volatilitaet"
        bezeichnung={de.kennzahlen.volatilitaet}
        wert={volatilitaet}
        richtung="neutral"
        erklaerung={de.kennzahlen.erklaerung.volatilitaet}
      />
    ),
    <Kennzahlzeile
      key="maxDrawdown"
      bezeichnung={de.kennzahlen.maxDrawdown}
      wert={maxDrawdown.wert}
      richtung={daten.maxDrawdown.art === 'ok' ? 'ab' : 'neutral'}
      pfeil={daten.maxDrawdown.art === 'ok' ? de.kennzahlen.richtungPfeil.ab : ''}
      erklaerung={de.kennzahlen.erklaerung.maxDrawdown}
      anmerkung={maxDrawdown.satz ?? maxDrawdown.zeitraum}
    />,
    sharpe === null ? null : (
      <Kennzahlzeile
        key="sharpe"
        bezeichnung={de.kennzahlen.sharpe}
        wert={sharpe.wert}
        richtung={sharpe.richtung}
        erklaerung={de.kennzahlen.erklaerung.sharpe(sharpe.zinsSatz)}
      />
    ),
  ].filter((zeile) => zeile !== null);

  // Die erste nicht mehr ganz passende Zeile bleibt sichtbar: der Rahmen schneidet sie ab,
  // die Maske blendet sie aus. So gibt es keinen Leerraum zwischen Tabelle und Knopf.
  // Alle Zeilen bleiben immer im DOM — nur so lässt sich bei wachsendem Rahmen (z. B.
  // wenn Aufteilung erst nach Kennzahlen seine endgueltige Hoehe meldet) erneut pruefen,
  // ob wieder mehr Zeilen passen. Entfernte (.slice-)Zeilen koennten spaeter nicht mehr
  // gemessen werden und die Kachel bliebe faelschlich zu knapp befuellt. Ueberzaehlige
  // Zeilen werden daher nur unsichtbar (`invisible`), nie aus dem Baum entfernt — das
  // haelt Layout UND Barrierefreiheitsbaum korrekt (`visibility: hidden` faellt aus
  // beidem heraus, `overflow-hidden` am Rahmen schneidet den Rest optisch ab).
  useLayoutEffect(() => {
    const rahmen = rahmenRef.current;
    if (rahmen === null) return undefined;

    const anpassen = () => {
      const verfuegbar = rahmen.clientHeight;
      const zeilenKnoten = rahmen.querySelectorAll<HTMLElement>('tbody tr');
      let passend = zeilenKnoten.length;
      for (let i = 0; i < zeilenKnoten.length; i++) {
        const zeile = zeilenKnoten[i]!;
        if (zeile.offsetTop + zeile.offsetHeight > verfuegbar) {
          passend = i;
          break;
        }
      }
      setSichtbareAnzahl(Math.max(1, passend));
    };

    anpassen();
    const beobachter = new ResizeObserver(anpassen);
    beobachter.observe(rahmen);
    return () => beobachter.disconnect();
  }, [alleZeilen.length]);

  const alleSichtbar = sichtbareAnzahl >= alleZeilen.length;
  // Die angeschnittene Zeile bleibt als Andeutung stehen, ist aber `inert`: ein Knopf unter
  // der Blende darf keinen Fokus bekommen, den man nicht sieht. [WCAG 2.4.11]
  const sichtbareZeilen = alleZeilen.map((zeile, index) =>
    cloneElement(zeile, {
      className: index > sichtbareAnzahl ? 'invisible' : undefined,
      inert: !ausgeklappt && index >= sichtbareAnzahl,
    }),
  );

  // Meldet die Zielhoehe nur beim Aufklappen und nur einmalig (nicht laufend per
  // ResizeObserver) — sonst wuerde die spaeter selbst mitwachsende Aussenhoehe
  // (Aufteilung folgt der aufgeklappten Kachel) rueckwirkend in die Zielhoehe
  // einfliessen und die Kachel ueber ihr Ziel hinausschiessen lassen.
  const aufKlickenUmschalten = () => {
    const rahmen = rahmenRef.current;
    if (!ausgeklappt && rahmen !== null && hoehe !== null) {
      onVolleHoeheAendern(hoehe + (rahmen.scrollHeight - rahmen.clientHeight));
    }
    aufAusklappenUmschalten();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Verblasst die letzte Zeile per Maske, statt eine zweite Flaeche darueberzulegen —
          so scheint die echte, durchscheinende Kachel-Flaeche durch, kein Farbabgleich noetig. */}
      <div
        ref={rahmenRef}
        id="kennzahlen-liste"
        className={cn('-mx-2 min-h-0 flex-1 overflow-hidden px-2', !ausgeklappt && !alleSichtbar && 'ausblenden-unten')}
      >
        <Table>
          <TableCaption className="sr-only">{de.kennzahlen.tabelle}</TableCaption>
          <TableHeader className="sr-only">
            <TableRow>
              <TableHead scope="col">{de.kennzahlen.spalteBezeichnung}</TableHead>
              <TableHead scope="col">{de.kennzahlen.spalteWert}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{sichtbareZeilen}</TableBody>
        </Table>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={aufKlickenUmschalten}
        aria-expanded={ausgeklappt}
        aria-controls="kennzahlen-liste"
        className={cn('w-fit', !ausgeklappt && alleSichtbar && 'invisible')}
      >
        <ChevronDown className={cn('transition-transform', ausgeklappt && 'rotate-180')} aria-hidden="true" />
        {ausgeklappt ? de.kennzahlen.wenigerZeigen : de.kennzahlen.mehrZeigen}
      </Button>
      <KennzahlDetailsDialog
        titel={aktiv?.titel ?? ''}
        spalteMitte={aktiv?.spalteMitte ?? de.kennzahlen.detailsSpaltePosition}
        zeilen={aktiv?.zeilen ?? null}
        onOpenChange={(offen) => {
          if (!offen) setDetails(null);
        }}
      />
    </div>
  );
}

/**
 * Ein Satz aus bis zu vier Teilen: warum die Realrendite fehlt, oder — beim Ersatz ueber
 * die Fisher-Gleichung — dass und bis wann sie mit der Durchschnittsteuerung rechnet;
 * sonst Kaufkraftbasis und fortgeschriebene Monate der exakten Rechnung.
 */
function realAnmerkung(
  fehltSatz: string | null,
  ersatz: boolean,
  teuerungBisMonat: string | null,
  basisMonat: string,
  fortgeschrieben: number,
): string {
  const teile: string[] = [];
  if (fehltSatz !== null) return fehltSatz;
  if (ersatz) {
    teile.push(de.kennzahlen.realUeberTeuerung);
    if (teuerungBisMonat !== null && teuerungBisMonat < basisMonat) {
      teile.push(de.kennzahlen.realTeuerungBis(monatLang(teuerungBisMonat)));
    }
  } else if (basisMonat !== '') {
    teile.push(`${de.kennzahlen.realBasis(monatLang(basisMonat))}.`);
    if (fortgeschrieben > 0) {
      teile.push(de.kennzahlen.realFortgeschrieben(zahl(fortgeschrieben)));
    }
  }
  return de.kennzahlen.anmerkungTeile(teile);
}

/**
 * Ein Satz aus bis zu zwei Teilen: warum die Teuerung insgesamt fehlt, und die
 * aktuelle Inflation des laufenden Jahres, sofern vorhanden.
 */
function inflationAnmerkung(inflationFehlt: boolean, laufendesJahr: string | null): string {
  const teile: string[] = [];
  if (inflationFehlt) teile.push(de.kennzahlen.inflationFehlt);
  if (laufendesJahr !== null) teile.push(`${laufendesJahr}.`);
  return de.kennzahlen.anmerkungTeile(teile);
}
