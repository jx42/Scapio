/*
 * Kachel 2, Ansicht: ein Ring und daneben die Liste, die ihn erklaert.
 *
 * Der Ring allein beantwortet keine Frage — "wie viel ist das in Euro?" steht nicht
 * darin. Deshalb traegt jede Legendenzeile Prozent UND Betrag, und der Ring ist nur
 * das Bild dazu. [P-06]
 *
 * Die Zeilen sind Knoepfe, nicht nur Text: Hervorheben muss mit der Tastatur gehen,
 * ein Hover-Effekt allein waere fuer die halbe Bedienung unerreichbar.
 */

import { Cell, Label, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { Wallet } from 'lucide-react';

import { de } from '@/i18n/de';
import type { PositionZeile } from '@/lib/api';
import { AUFTEILUNG_CHART_HOEHE, LINIE_HAUPT, RING_AUSSEN, RING_INNEN, RING_LUECKE_GRAD } from '@/lib/chartmasse';
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

  // grid-cols-1 statt der impliziten auto-Spalte: die waechst sonst auf die Breite der
  // Legende und schiebt die Kachel bei schmalem Fenster ueber den Rand hinaus.
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
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
            de.aufteilung.spalteDetails,
          ],
          zeilen: stuecke.map((s) => [
            s.name,
            s.position === null ? de.aufteilung.artCash : de.aufteilung.art(s.art),
            anteilProzent(s.anteil),
            euroAusCent(s.wertCent),
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
              data={stuecke}
              dataKey="wertCent"
              nameKey="name"
              onMouseEnter={(_, index) => onHover(stuecke[index]?.schluessel ?? null)}
              onMouseLeave={() => onHover(null)}
              innerRadius={RING_INNEN}
              outerRadius={RING_AUSSEN}
              paddingAngle={RING_LUECKE_GRAD}
              stroke={FARBE.flaeche}
              strokeWidth={LINIE_HAUPT}
              isAnimationActive={false}
            >
              {stuecke.map((s, i) => (
                <Cell
                  key={s.schluessel}
                  fill={farbe(i)}
                  fillOpacity={hervorgehoben === null || hervorgehoben === s.schluessel ? 1 : 0.35}
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

      <div>
        <div
          aria-hidden="true"
          className="flex items-baseline gap-x-3 border-b border-rand/60 pb-2 text-xs font-medium text-text-leise"
        >
          <span className="min-w-0 flex-1 break-words">{de.aufteilung.spaltePosition}</span>
          <span className={ART_SPALTE}>{de.aufteilung.spalteArt}</span>
          <span className="min-w-16 shrink-0 text-right">{de.aufteilung.spalteAnteil}</span>
          <span className="min-w-24 shrink-0 text-right">{de.aufteilung.spalteWert}</span>
        </div>
        <ul className="flex flex-col">
          {stuecke.map((s, i) => {
            const aktiv = hervorgehoben === s.schluessel;
            return (
              <li
                key={s.schluessel}
                data-aktiv={aktiv ? '' : undefined}
                className={cn('zeile-hover flex flex-col', i < stuecke.length - 1 && 'border-b border-rand/60')}
              >
                <button
                  type="button"
                  aria-pressed={ausgewaehlt === s.schluessel}
                  onMouseEnter={() => onHover(s.schluessel)}
                  onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(s.schluessel)}
                  onBlur={() => onHover(null)}
                  onClick={() => {
                    onHervorheben(ausgewaehlt === s.schluessel ? null : s.schluessel);
                  }}
                  className={cn(
                    'pt-2 text-left',
                    s.position === null && 'pb-2',
                  )}
                >
                  <span className="flex items-baseline gap-x-3">
                    <Farbtupfer farbe={farbe(i)} />
                    {/* Leerraum zwischen Flex-Kindern rendert nicht, trennt aber die Woerter im Namen des Knopfs. */}
                    <span className="min-w-0 flex-1 break-words text-text">
                      {s.name}
                    </span>{' '}
                    <span className={cn(ART_SPALTE, 'text-text-leise')}>
                      {s.position === null ? de.aufteilung.artCash : de.aufteilung.art(s.art)}
                    </span>{' '}
                    <LegendenWerte anteil={s.anteil} wertCent={s.wertCent} />
                  </span>
                </button>
                {s.position === null ? null : (
                  // Der Link ist ein Geschwister des Knopfs, nicht sein Kind: `<a>` in `<button>` ist ungueltig.
                  // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- nur Zeiger-Hervorhebung; per Tastatur hebt der Knopf darueber hervor.
                  <div
                    onMouseEnter={() => onHover(s.schluessel)}
                    onMouseLeave={() => onHover(null)}
                    className="flex flex-wrap items-center gap-2 pt-2 pb-2"
                  >
                    <Positionsdetail position={s.position} />
                    <OnvistaLink variant="link" isin={s.position.isin} name={s.name}>
                      {de.aufteilung.onvista}
                    </OnvistaLink>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
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

/** Zweite Zeile einer Legendenzeile: Gewinn (Euro und Prozent) als Badge mit Pfeil statt Vorzeichen. */
function Positionsdetail({ position }: { position: PositionZeile }) {
  const angezeigterGewinn = useZahlZaehler(
    de.satz.mitNebenwert(
      betragOhneVorzeichen(position.gewinnCent, euroAusCent),
      betragOhneVorzeichen(position.gewinnProzent, prozent),
    ),
  );
  return <RichtungsBadge wert={position.gewinnCent}>{angezeigterGewinn}</RichtungsBadge>;
}
