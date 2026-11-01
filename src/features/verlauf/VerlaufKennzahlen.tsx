/*
 * Kachel 1, Zusatz: sechs Kennzahlen als grosse Karten ueber dem Verlauf.
 *
 * Die erste Karte ist der Depotwert selbst (Bezeichnung "Depotwert", Stand-Datum als
 * Subline statt einer gezaehlten Zahl) — dieselbe Zahl wie im Kopf der Verlauf-Kachel
 * darunter, hier nur vorangestellt, damit die Seite mit dem Gesamtwert beginnt, bevor
 * sie ihn aufschluesselt.
 *
 * Die Karten sind der einzige Ort fuer Rendite- und Risikokennzahlen (ADR-059): was frueher
 * eine eigene Kennzahlen-Kachel zeigte, steht als Subline, zweite Zeile oder im Popover der
 * passenden Karte. Reine Ansicht: keine Query, keine Rechnung.
 *
 * Kopfzahl bei TWR und IZF ist jeweils die annualisierte Zahl — `twrProJahr` bzw.
 * die Realrendite p.a. (`realRendite`) —, die Subline traegt
 * die zugehoerige Gesamt- bzw. Nominalzahl ohne Richtungspfeil, einzeilig. Die Gewichtung
 * (zeit- bzw. geldgewichtet) steht im Erklaertext — sonst wirkt eine Realrendite ueber der
 * Marktrendite wie ein Fehler, obwohl beide anders gewichten. So sind beide Kopfzahlen der Karten untereinander vergleichbar
 * (beide p.a.), waehrend die jeweils andere Zahl nicht verloren geht.
 *
 * Auch unter `sm` bleiben alle sechs Karten gross, zwei je Reihe. Damit das bei 390 px
 * traegt, ist jede Subline einzeilig und kurz gehalten ("Inflat.").
 *
 * Die Drawdown-Karte schaltet das Einzeichnen im Verlauf um. Der Knopf liegt
 * als Flaeche ueber der Karte statt um sie herum: ein `<button>` darf den Info-Knopf nicht
 * enthalten.
 */

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
  richtungPfeil,
  richtungswert,
  sharpeAnzeige,
  volatilitaetAnzeige,
  xirrAnzeige,
  zahl,
  type Richtung,
} from '@/lib/format';
import { richtungTon } from '@/lib/farben';
import { cn } from '@/lib/utils';
import { useZahlZaehler } from '@/hooks/useZahlZaehler';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { InfoKnopf } from '@/components/InfoKnopf';
import { RichtungsPfeil, TextMitPfeil } from '@/components/RichtungsPfeil';

export type VerlaufKennzahlenProps = {
  readonly daten: KennzahlenAntwort | undefined;
  readonly laedt: boolean;
  readonly drawdownGezeigt: boolean;
  readonly onDrawdownZeigen: () => void;
};

/** Die Karte nimmt die Richtung ihrer Kopfzahl in Rand und Flaeche auf; neutral bleibt Schimmer. */
const GLAS_TON: Record<Richtung, string | undefined> = {
  auf: 'glas-ton-gewinn',
  ab: 'glas-ton-verlust',
  neutral: undefined,
};

type Karte = {
  readonly bezeichnung: string;
  readonly wert: string;
  readonly richtung: Richtung;
  readonly pfeil: string;
  readonly subline: string | null;
  /**
   * `false`, wenn `subline` keine zaehlenswerte einzelne Zahl ist — ein Satz mit zwei Zahlen
   * (Real mit Inflation), wo der Zaehler nur die erste erwischen und die zweite hart springen
   * lassen wuerde, oder eine Zahl hinter Text (Volatilitaet).
   */
  readonly sublineAnimiert?: boolean;
  readonly erklaerung: string;
  /** Erklaerungen der Zahlen aus der Subline, im selben Popover. */
  readonly ergaenzungen?: readonly { readonly bezeichnung: string; readonly text: string }[];
  /** Warum eine Zahl fehlt oder woran sie krankt; leise unter den Erklaerungen. */
  readonly anmerkungen?: readonly string[];
  readonly aktion?: { readonly bezeichnung: string; readonly gedrueckt: boolean; readonly onKlick: () => void };
};

function karten(daten: KennzahlenAntwort, drawdownGezeigt: boolean, onDrawdownZeigen: () => void): readonly Karte[] {
  const xirr = xirrAnzeige(daten.xirr);
  const izf = xirr.rate === null ? xirr.wert : prozent(xirr.rate);
  const real = realRendite(daten.real);
  const maxDrawdown = maxDrawdownAnzeige(daten.maxDrawdown);
  const volatilitaet = volatilitaetAnzeige(daten.volatilitaetProJahr);
  const sharpe = sharpeAnzeige(daten.sharpe);
  const laufendesJahr = daten.real.teuerungLaufendesJahr;

  return [
    {
      bezeichnung: de.verlauf.depotwert,
      wert: euroAusCent(daten.gesamtCent),
      richtung: 'neutral',
      pfeil: '',
      subline: de.kennzahlen.sublineInvestiert(euroAusCent(daten.investiertCent)),
      erklaerung: de.kennzahlen.erklaerung.gesamt,
      ergaenzungen: [{ bezeichnung: de.kennzahlen.einstand, text: de.kennzahlen.erklaerung.einstand }],
    },
    {
      bezeichnung: de.kennzahlen.kursgewinn,
      ...richtungswert(daten.kursgewinnCent, euroAusCent),
      subline: betragOhneVorzeichen(daten.kursgewinnProzent, prozent),
      erklaerung: de.kennzahlen.erklaerung.kursgewinn,
    },
    {
      bezeichnung: de.kennzahlen.twrProJahrKurz,
      ...richtungswert(daten.twrProJahr, prozent),
      subline: de.kennzahlen.sublineTwrGesamt(daten.twr === null ? de.xirr.nichtBerechenbar : prozent(daten.twr)),
      erklaerung: de.kennzahlen.erklaerung.twrProJahr,
      ergaenzungen: [{ bezeichnung: de.kennzahlen.twr, text: de.kennzahlen.erklaerung.twr }],
      anmerkungen: [
        ...(daten.twrProJahr === null ? [de.kennzahlen.twrProJahrZuKurz] : []),
        ...(daten.twrGrob ? [de.kennzahlen.twrGrob] : []),
      ],
    },
    {
      bezeichnung: de.kennzahlen.real,
      ...richtungswert(real.rate, prozent),
      subline: de.kennzahlen.sublineReal(izf, daten.inflation === null ? de.xirr.nichtBerechenbar : prozent(daten.inflation)),
      sublineAnimiert: false,
      erklaerung: de.kennzahlen.erklaerung.real,
      ergaenzungen: [
        { bezeichnung: de.kennzahlen.xirr, text: de.kennzahlen.erklaerung.xirr },
        { bezeichnung: de.kennzahlen.inflation, text: de.kennzahlen.erklaerung.inflation },
      ],
      anmerkungen: [
        realAnmerkung(
          real.rate === null ? (xirr.satz ?? de.kennzahlen.inflationFehlt) : null,
          real.ersatz,
          daten.real.teuerungBisMonat,
          daten.real.basisMonat,
          daten.real.fortgeschriebeneMonate.length,
        ),
        ...(real.rate !== null && xirr.satz !== null ? [xirr.satz] : []),
        ...(daten.inflation === null && real.rate !== null ? [de.kennzahlen.inflationFehlt] : []),
        ...(laufendesJahr === null
          ? []
          : [`${de.kennzahlen.inflationLaufendesJahr(jahrAusMonat(daten.real.basisMonat), prozent(laufendesJahr))}.`]),
      ],
    },
    {
      bezeichnung: de.kennzahlen.maxDrawdownKurz,
      wert: maxDrawdown.wert,
      richtung: daten.maxDrawdown.art === 'ok' ? 'ab' : 'neutral',
      pfeil: daten.maxDrawdown.art === 'ok' ? richtungPfeil(daten.maxDrawdown.anteil) : '',
      subline: volatilitaet === null ? null : de.kennzahlen.sublineVolatilitaet(volatilitaet),
      sublineAnimiert: false,
      erklaerung: de.kennzahlen.erklaerung.maxDrawdown,
      ergaenzungen:
        volatilitaet === null ? [] : [{ bezeichnung: de.kennzahlen.volatilitaet, text: de.kennzahlen.erklaerung.volatilitaet }],
      anmerkungen: maxDrawdown.satz === null ? [] : [maxDrawdown.satz],
      aktion: { bezeichnung: de.verlauf.drawdownZeigen, gedrueckt: drawdownGezeigt, onKlick: onDrawdownZeigen },
    },
    ...(sharpe === null
      ? []
      : [
          {
            bezeichnung: de.kennzahlen.sharpe,
            wert: sharpe.wert,
            richtung: sharpe.richtung,
            pfeil: '',
            subline: sharpe.bewertung,
            erklaerung: de.kennzahlen.erklaerung.sharpe(sharpe.zinsSatz),
          },
        ]),
  ];
}

function realAnmerkung(
  fehltSatz: string | null,
  ersatz: boolean,
  teuerungBisMonat: string | null,
  basisMonat: string,
  fortgeschrieben: number,
): string {
  if (fehltSatz !== null) return fehltSatz;
  const teile: string[] = [];
  if (ersatz) {
    teile.push(de.kennzahlen.realUeberTeuerung);
    if (teuerungBisMonat !== null && teuerungBisMonat < basisMonat) teile.push(de.kennzahlen.realTeuerungBis(monatLang(teuerungBisMonat)));
  } else if (basisMonat !== '') {
    teile.push(`${de.kennzahlen.realBasis(monatLang(basisMonat))}.`);
    if (fortgeschrieben > 0) teile.push(de.kennzahlen.realFortgeschrieben(zahl(fortgeschrieben)));
  }
  return de.kennzahlen.anmerkungTeile(teile);
}

export function VerlaufKennzahlen({ daten, laedt, drawdownGezeigt, onDrawdownZeigen }: VerlaufKennzahlenProps) {
  if (laedt) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
    );
  }

  // Vor dem ersten Lauf gaebe es nur Nullkarten und „nicht berechenbar“.
  if (daten === undefined || daten.drift.stufe === 'leer') return null;

  const alleKarten = karten(daten, drawdownGezeigt, onDrawdownZeigen);
  return (
    <section aria-label={de.kennzahlen.ueberblick}>
      <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3', alleKarten.length === 6 ? 'lg:grid-cols-6' : 'lg:grid-cols-5')}>
        {alleKarten.map((karte) => (
          <Kennzahlkarte key={karte.bezeichnung} karte={karte} />
        ))}
      </div>
    </section>
  );
}

/** Eigene Komponente, weil `useZahlZaehler` als Hook nicht in einer `.map()`-Schleife stehen darf. */
function Kennzahlkarte({ karte }: { readonly karte: Karte }) {
  const angezeigterWert = useZahlZaehler(karte.wert);
  const gezaehlteSubline = useZahlZaehler(karte.subline ?? '');
  const angezeigteSubline =
    karte.sublineAnimiert === false ? (karte.subline ?? '') : gezaehlteSubline;

  return (
    <Card className={cn('min-w-0', karte.aktion === undefined ? undefined : 'relative', GLAS_TON[karte.richtung])}>
      {karte.aktion === undefined ? null : (
        <button
          type="button"
          aria-label={karte.aktion.bezeichnung}
          aria-pressed={karte.aktion.gedrueckt}
          onClick={karte.aktion.onKlick}
          className="absolute inset-0 cursor-pointer rounded-lg aria-pressed:ring-1 aria-pressed:ring-verlust"
        />
      )}
      <CardHeader className="max-sm:px-4">
        <CardTitle>
          <span className="relative z-10 inline-flex items-center gap-1.5">
            {karte.bezeichnung}
            <InfoKnopf bezeichnung={karte.bezeichnung} inhaltKlasse="max-h-[70vh] overflow-y-auto">
              <p>{karte.erklaerung}</p>
              {(karte.ergaenzungen ?? []).map((e) => (
                <p key={e.bezeichnung} className="mt-2">
                  <span className="font-medium">{de.satz.beschriftung(e.bezeichnung)}</span> {e.text}
                </p>
              ))}
              {(karte.anmerkungen ?? [])
                .filter((a) => a !== '')
                .map((a) => (
                  <p key={a} className="mt-2 text-text-leise">
                    <TextMitPfeil text={a} />
                  </p>
                ))}
            </InfoKnopf>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="max-sm:px-4">
        <span className={cn('text-2xl font-bold break-words sm:whitespace-nowrap leuchten-zahl', richtungTon[karte.richtung])}>
          <RichtungsPfeil pfeil={karte.pfeil} className="mr-1" />
          {angezeigterWert}
        </span>
        {karte.subline === null ? null : (
          <CardDescription className="mt-1 break-words">
            <TextMitPfeil text={angezeigteSubline} />
          </CardDescription>
        )}
      </CardContent>
    </Card>
  );
}
