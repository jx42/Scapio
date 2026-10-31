/*
 * Kachel 2, Ansicht: ein Ring und daneben die Liste, die ihn erklaert.
 *
 * Der Ring allein beantwortet keine Frage — "wie viel ist das in Euro?" steht nicht
 * darin. Deshalb traegt jede Legendenzeile Prozent UND Betrag, und der Ring ist nur
 * das Bild dazu. [P-06]
 *
 * Der Name fuehrt zu onvista, Art und Werte sind ein Knopf: Hervorheben muss mit der Tastatur
 * gehen, ein Hover-Effekt allein waere fuer die halbe Bedienung unerreichbar.
 */

import { Cell, Label, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { Wallet } from 'lucide-react';

import { de } from '@/i18n/de';
import type { PositionZeile } from '@/lib/api';
import { AUFTEILUNG_CHART_HOEHE, DECKKRAFT_GEDIMMT, LINIE_HAUPT, RING_AUSSEN, RING_INNEN, RING_LUECKE_GRAD } from '@/lib/chartmasse';
import { anteilProzent, betragOhneVorzeichen, euroAusCent, prozent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { FARBE } from '@/lib/farben';
import { useZahlZaehler } from '@/hooks/useZahlZaehler';
import { ChartRahmen } from '@/components/ChartRahmen';
import { OnvistaLink } from '@/components/OnvistaLink';
import { RichtungsBadge } from '@/components/RichtungsBadge';
import { Farbtupfer, RingMitte, ringFarbe as farbe } from '@/components/Ring';
import { LeerZustand } from '@/components/Zustaende';

const CASH_SCHLUESSEL = 'cash';

/**
 * Raster einer Legendenzeile: breit Position | Gewinn in einer Zeile, schmal der Gewinn darunter,
 * damit bei 375 px nichts überläuft. Nach Breite der Legende, nicht des Fensters.
 */
const ZEILE = 'grid grid-cols-1 items-baseline gap-x-3 @3xl/legende:grid-cols-[minmax(0,1fr)_11rem]';

/** Die Art-Spalte: feste Breite, bricht Langes um statt es zu kürzen (WCAG 1.4.10) und entfällt auf schmalen Bildschirmen, damit der Name Platz behält. */
const ART_SPALTE = 'hidden w-16 shrink-0 break-words sm:block';

type Stueck = {
  readonly schluessel: string;
  readonly name: string;
  readonly art: string | null;
  readonly wertCent: number;
  readonly anteil: number;
  readonly position: PositionZeile | null;
};

export type AufteilungAnsichtProps = {
  readonly positionen: readonly PositionZeile[];
  readonly cashCent: number;
  readonly cashAnteil: number;
  /** Depotwert gesamt fuer die Mitte des Rings. Fehlt er, bleibt die Mitte leer. */
  readonly gesamtCent: number | null;
  readonly hervorgehoben: string | null;
  readonly ausgewaehlt: string | null;
  readonly onHervorheben: (schluessel: string | null) => void;
  readonly onHover: (schluessel: string | null) => void;
};

export function AufteilungAnsicht({
  positionen,
  cashCent,
  cashAnteil,
  gesamtCent,
  hervorgehoben,
  ausgewaehlt,
  onHervorheben,
  onHover,
}: AufteilungAnsichtProps) {
  // Nur zusammengestellt, nicht gerechnet: Anteile kommen fertig vom Server,
  // Cash steht hinten, weil es keine Anlageentscheidung ist.
  const stuecke: Stueck[] = positionen.map((p) => ({
    schluessel: p.isin,
    name: p.name,
    art: p.art,
    wertCent: p.wertCent,
    anteil: p.anteil,
    position: p,
  }));
  if (cashCent !== 0) {
    stuecke.push({
      schluessel: CASH_SCHLUESSEL,
      name: de.aufteilung.cash,
      art: null,
      wertCent: cashCent,
      anteil: cashAnteil,
      position: null,
    });
  }

  if (stuecke.length === 0) return <LeerZustand text={de.aufteilung.leer} />;
  // Ein überzogenes Verrechnungskonto hat keinen Platz im Ring — Recharts zeichnete das Stück
  // rückwärts —, bleibt aber in der Legende. Die Farbe behält ihren Platz in der Reihe.
  const ringStuecke = stuecke.map((s, farbIndex) => ({ ...s, farbIndex })).filter((s) => s.wertCent > 0);

  // grid-cols-1 statt der impliziten auto-Spalte: die waechst sonst auf die Breite der
  // Legende und schiebt die Kachel bei schmalem Fenster ueber den Rand hinaus.
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-6 @3xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <ChartRahmen
          hoehe={AUFTEILUNG_CHART_HOEHE}
          label={de.aufteilung.ring}
          tabelle={{
            beschriftung: de.aufteilung.tabelle,
            spalten: [
              de.aufteilung.spaltePosition,
              de.aufteilung.spalteArt,
              de.aufteilung.spalteAnteil,
              de.aufteilung.spalteWert,
              de.aufteilung.spalteGewinn,
              de.aufteilung.spalteDetails,
            ],
            zeilen: stuecke.map((s) => [
              s.name,
              s.position === null ? de.aufteilung.artCash : de.aufteilung.art(s.art),
              anteilProzent(s.anteil),
              euroAusCent(s.wertCent),
              s.position === null ? '' : gewinnText(s.position),
              s.position?.isin ?? '',
            ]),
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart accessibilityLayer={false} aria-hidden="true">
              {/* rootTabIndex -1: das SVG ist aria-hidden, ein Tabstopp darin waere fuer
                  Screenreader ein Loch. Bedient wird ueber die Legende. */}
              <Pie
                rootTabIndex={-1}
                data={ringStuecke}
                dataKey="wertCent"
                nameKey="name"
                onMouseEnter={(_, index) => onHover(ringStuecke[index]?.schluessel ?? null)}
                onMouseLeave={() => onHover(null)}
                innerRadius={RING_INNEN}
                outerRadius={RING_AUSSEN}
                paddingAngle={RING_LUECKE_GRAD}
                stroke={FARBE.flaeche}
                strokeWidth={LINIE_HAUPT}
                isAnimationActive={false}
              >
                {ringStuecke.map((s) => (
                  <Cell
                    key={s.schluessel}
                    fill={farbe(s.farbIndex)}
                    fillOpacity={hervorgehoben === null || hervorgehoben === s.schluessel ? 1 : DECKKRAFT_GEDIMMT}
                  />
                ))}
                {/* Ohne `position`: "center" liest in Recharts 3 nur die kartesische viewBox, die
                    es im PieChart nicht gibt; RingMitte braucht nur cx/cy der polaren. */}
                {gesamtCent === null ? null : (
                  <Label
                    content={<RingMitte symbol={Wallet} beschriftung={de.aufteilung.gesamt} wert={euroAusCent(gesamtCent)} />}
                  />
                )}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </ChartRahmen>

        <div className="@container/legende">
          <div
            aria-hidden="true"
            className={cn(ZEILE, 'border-b border-rand/60 pb-2 text-xs font-medium text-text-leise')}
          >
            <span className="flex items-baseline gap-x-3">
              <span className="min-w-0 flex-1 break-words">{de.aufteilung.spaltePosition}</span>
              <span className={ART_SPALTE}>{de.aufteilung.spalteArt}</span>
              <span className="min-w-16 shrink-0 text-right">{de.aufteilung.spalteAnteil}</span>
              <span className="min-w-24 shrink-0 text-right">{de.aufteilung.spalteWert}</span>
            </span>
            <span className="hidden text-right @3xl/legende:block">{de.aufteilung.spalteGewinn}</span>
          </div>
          <ul className="flex flex-col">
            {stuecke.map((s, i) => {
              const aktiv = hervorgehoben === s.schluessel;
              return (
                // Die Zeile traegt Hover und Fokus, damit Link und Knopf gleich hervorheben.
                // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- nur Hervorhebung; bedient wird ueber Link und Knopf darin.
                <li
                  key={s.schluessel}
                  data-aktiv={aktiv ? '' : undefined}
                  onMouseEnter={() => onHover(s.schluessel)}
                  onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(s.schluessel)}
                  // Beim Wechsel vom Link zum Knopf derselben Zeile nicht kurz loslassen.
                  onBlur={(e) => {
                    if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) onHover(null);
                  }}
                  className={cn('zeile-hover', ZEILE, i < stuecke.length - 1 && 'border-b border-rand/60')}
                >
                  <span className={cn('flex items-baseline gap-x-3 pt-2 @3xl/legende:pb-2', s.position === null && 'pb-2')}>
                    <Farbtupfer farbe={farbe(i)} />
                    <span className="min-w-0 flex-1 break-words text-text">
                      {s.position === null ? (
                        s.name
                      ) : (
                        <OnvistaLink variant="name" isin={s.position.isin} name={s.name}>
                          {s.name}
                        </OnvistaLink>
                      )}
                    </span>
                    <button
                      type="button"
                      aria-pressed={ausgewaehlt === s.schluessel}
                      onClick={() => {
                        onHervorheben(ausgewaehlt === s.schluessel ? null : s.schluessel);
                      }}
                      className="flex min-h-6 shrink-0 items-baseline gap-x-3 text-left"
                    >
                      {/* Leerraum zwischen Flex-Kindern rendert nicht, trennt aber die Woerter im Namen des Knopfs. */}
                      <span className="sr-only">{de.aufteilung.hervorheben(s.name)}</span>{' '}
                      <span className={cn(ART_SPALTE, 'text-text-leise')}>
                        {s.position === null ? de.aufteilung.artCash : de.aufteilung.art(s.art)}
                      </span>{' '}
                      <LegendenWerte anteil={s.anteil} wertCent={s.wertCent} />
                    </button>
                  </span>
                  {s.position === null ? null : (
                    <span className="flex pt-1 pb-2 @3xl/legende:justify-end @3xl/legende:pt-2">
                      <Positionsdetail position={s.position} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Anteil und Wert einer Legendenzeile — eigene Komponente, weil `useZahlZaehler`
 *  als Hook nicht in der `.map()`-Schleife der Legende stehen darf. */
function LegendenWerte({ anteil, wertCent }: { readonly anteil: number; readonly wertCent: number }) {
  const angezeigterAnteil = useZahlZaehler(anteilProzent(anteil));
  const angezeigterWert = useZahlZaehler(euroAusCent(wertCent));
  return (
    <>
      <span className="min-w-16 shrink-0 text-right tabular-nums text-text-leise">{angezeigterAnteil}</span>{' '}
      <span className="min-w-24 shrink-0 text-right tabular-nums text-text">{angezeigterWert}</span>
    </>
  );
}

/** Gewinn in Euro und Prozent, mit Vorzeichen — für die Tabellenalternative, wo der Pfeil fehlt. */
function gewinnText(position: PositionZeile): string {
  return de.satz.mitNebenwert(euroAusCent(position.gewinnCent, true), prozent(position.gewinnProzent, true));
}

/** Gewinnspalte: Euro und Prozent als Badge mit Pfeil statt Vorzeichen. */
function Positionsdetail({ position }: { position: PositionZeile }) {
  const angezeigterGewinn = useZahlZaehler(
    de.satz.mitNebenwert(
      betragOhneVorzeichen(position.gewinnCent, euroAusCent),
      betragOhneVorzeichen(position.gewinnProzent, prozent),
    ),
  );
  return <RichtungsBadge wert={position.gewinnCent}>{angezeigterGewinn}</RichtungsBadge>;
}
