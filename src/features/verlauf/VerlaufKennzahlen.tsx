/*
 * Kachel 1, Zusatz: sechs Kennzahlen als grosse Karten ueber dem Verlauf.
 *
 * Die erste Karte ist der Depotwert selbst (Bezeichnung "Depotwert", Stand-Datum als
 * Subline statt einer gezaehlten Zahl) — dieselbe Zahl wie im Kopf der Verlauf-Kachel
 * darunter, hier nur vorangestellt, damit die Seite mit dem Gesamtwert beginnt, bevor
 * sie ihn aufschluesselt.
 *
 * Dieselben Werte wie in Kachel 3 (Kennzahlen), hier die Kopfzahl je Karte samt
 * Erklaerungs-Tooltip direkt am Kartentitel — naeher an der Zahl als ein Info-i im
 * Kopf der Verlauf-Kachel darunter. Der Tooltip-Text kommt aus derselben Konstante
 * (`de.kennzahlen.erklaerung`), die auch Kachel 3 fuellt: eine Quelle, zwei Stellen,
 * keine zweite, moeglicherweise abweichende Formulierung. Reine Ansicht: keine
 * Query, keine Rechnung.
 *
 * Kursgewinn zeigt den Euro-Betrag als Kopfzahl, den Prozentwert als Subline — hier
 * zaehlt die absolute Zahl, waehrend die Tabelle in Kachel 3 beide gleichrangig zeigt.
 *
 * Kopfzahl bei TWR und IZF ist jeweils die annualisierte Zahl — `twrProJahr` bzw.
 * die Realrendite p.a. (`realRendite`, dieselbe Wahl wie in Kachel 3) —, die Subline traegt
 * die zugehoerige Gesamt- bzw. Nominalzahl ohne Richtungspfeil, einzeilig. Die Gewichtung
 * (zeit- bzw. geldgewichtet) steht im Erklaertext — sonst wirkt eine Realrendite ueber der
 * Marktrendite wie ein Fehler, obwohl beide anders gewichten. So sind beide Kopfzahlen der Karten untereinander vergleichbar
 * (beide p.a.), waehrend die jeweils andere Zahl nicht verloren geht.
 *
 * Auch unter `sm` bleiben alle sechs Karten gross, zwei je Reihe. Damit das bei 390 px
 * traegt, ist jede Subline einzeilig und so kurz gehalten, dass sie in die halbe Breite
 * passt: Stand ohne Uhrzeit, Drawdown-Zeitraum mit zweistelligem Jahr.
 */

import { de } from '@/i18n/de';
import type { KennzahlenAntwort } from '@/lib/api';
import {
  betragOhneVorzeichen,
  euroAusCent,
  maxDrawdownAnzeige,
  prozent,
  realRendite,
  richtungPfeil,
  richtungswert,
  sharpeAnzeige,
  xirrAnzeige,
  zeitpunktNurTag,
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
   * `false`, wenn `subline` keine zaehlenswerte einzelne Zahl ist — ein Datumsbereich
   * (MaxDrawdown) oder ein Satz mit zwei Zahlen (Real mit Inflation), wo der Zaehler
   * nur die erste erwischen und die zweite hart springen lassen wuerde.
   */
  readonly sublineAnimiert?: boolean;
  readonly erklaerung: string;
};

function karten(daten: KennzahlenAntwort): readonly Karte[] {
  const xirr = xirrAnzeige(daten.xirr);
  const izf = xirr.rate === null ? xirr.wert : prozent(xirr.rate);
  const real = realRendite(daten.real);
  const maxDrawdown = maxDrawdownAnzeige(daten.maxDrawdown);
  const sharpe = sharpeAnzeige(daten.sharpe);

  const standTag = zeitpunktNurTag(daten.stand);

  return [
    {
      bezeichnung: de.verlauf.depotwert,
      wert: euroAusCent(daten.gesamtCent),
      richtung: 'neutral',
      pfeil: '',
      subline: standTag === null ? de.seite.standUnbekannt : de.seite.stand(standTag),
      sublineAnimiert: false,
      erklaerung: de.kennzahlen.erklaerung.gesamt,
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
    },
    {
      bezeichnung: de.kennzahlen.real,
      ...richtungswert(real.rate, prozent),
      subline: de.kennzahlen.sublineXirr(izf),
      erklaerung: de.kennzahlen.erklaerung.real,
    },
    {
      bezeichnung: de.kennzahlen.maxDrawdownKurz,
      wert: maxDrawdown.wert,
      richtung: daten.maxDrawdown.art === 'ok' ? 'ab' : 'neutral',
      pfeil: daten.maxDrawdown.art === 'ok' ? richtungPfeil(daten.maxDrawdown.anteil) : '',
      subline: maxDrawdown.zeitraumKurz,
      sublineAnimiert: false,
      erklaerung: de.kennzahlen.erklaerung.maxDrawdown,
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

export function VerlaufKennzahlen({ daten, laedt }: VerlaufKennzahlenProps) {
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

  const alleKarten = karten(daten);
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
    <Card className={cn('min-w-0', GLAS_TON[karte.richtung])}>
      <CardHeader className="max-sm:px-4">
        <CardTitle>
          <span className="inline-flex items-center gap-1.5">
            {karte.bezeichnung}
            <InfoKnopf bezeichnung={karte.bezeichnung}>
              <p>{karte.erklaerung}</p>
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
