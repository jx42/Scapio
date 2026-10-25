/*
 * Kachel 4, rechte Hälfte: Länder über Sektoren, je Legende links und Ring rechts. Keine eigene
 * Überschrift je Gruppe — die Kopfzeile „Land“ bzw. „Sektor“ sagt es schon.
 * Gruppen, Anteile und „Übrige“ kommen fertig aus `core/lookthrough.ts`.
 *
 * Wie in der Aufteilung sind die Legendenzeilen Knöpfe, damit Hervorheben auch per Tastatur geht.
 * Zugeklappt je fünf Zeilen; ihre Höhe gibt die Unternehmen daneben vor. Der Ring zeigt immer
 * alle Gruppen.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Cell, Label, Pie, PieChart, ResponsiveContainer } from 'recharts';

import { de } from '@/i18n/de';
import type { Gruppe } from '@/lib/api';
import { GRUPPEN_RING_HOEHE, LINIE_HAUPT, RING_AUSSEN, RING_INNEN, RING_LUECKE_GRAD } from '@/lib/chartmasse';
import { anteilProzent, euroAusCent, zahl } from '@/lib/format';
import { FARBE } from '@/lib/farben';
import { useGespeicherterSchalter } from '@/lib/speicher';
import { cn } from '@/lib/utils';
import { useZahlZaehler } from '@/hooks/useZahlZaehler';
import { ChartRahmen } from '@/components/ChartRahmen';
import { Farbtupfer, RingMitte, type RingSymbol, ringFarbe } from '@/components/Ring';
import { landSymbol, sektorSymbol } from './gruppenSymbole';
import { Button } from '@/components/ui/button';

const STANDARD_ANZAHL = 5;

export type LaenderSektorenAnsichtProps = {
  readonly laender: readonly Gruppe[];
  readonly sektoren: readonly Gruppe[];
};

export function LaenderSektorenAnsicht({ laender, sektoren }: LaenderSektorenAnsichtProps) {
  const [ausgeklappt, setAusgeklappt] = useGespeicherterSchalter('laenderSektorenAusgeklappt', false);
  const mehr = laender.length > STANDARD_ANZAHL || sektoren.length > STANDARD_ANZAHL;

  return (
    <div className="flex flex-col gap-6">
      {laender.length === 0 ? null : (
        <GruppenRing
          titel={de.top25.laender}
          ring={de.top25.ringLaender}
          tabelle={de.top25.tabelleLaender}
          spalte={de.top25.spalteLand}
          gruppen={laender}
          anzeigename={de.top25.land}
          symbol={landSymbol}
          ausgeklappt={ausgeklappt}
        />
      )}
      {sektoren.length === 0 ? null : (
        <GruppenRing
          titel={de.top25.sektoren}
          ring={de.top25.ringSektoren}
          tabelle={de.top25.tabelleSektoren}
          spalte={de.top25.spalteSektor}
          gruppen={sektoren}
          anzeigename={de.top25.sektor}
          symbol={sektorSymbol}
          ausgeklappt={ausgeklappt}
        />
      )}
      {mehr ? (
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={ausgeklappt}
          onClick={() => setAusgeklappt(!ausgeklappt)}
          className="-mt-2 self-start"
        >
          <ChevronDown className={cn('transition-transform', ausgeklappt && 'rotate-180')} aria-hidden="true" />
          {ausgeklappt ? de.top25.wenigerZeigen : de.top25.mehrZeigen}
        </Button>
      ) : null}
    </div>
  );
}

type GruppenRingProps = {
  readonly titel: string;
  readonly ring: string;
  readonly tabelle: string;
  readonly spalte: string;
  readonly gruppen: readonly Gruppe[];
  readonly anzeigename: (name: string | null) => string;
  readonly symbol: (name: string | null) => RingSymbol;
  readonly ausgeklappt: boolean;
};

function GruppenRing({ titel, ring, tabelle, spalte, gruppen, anzeigename, symbol, ausgeklappt }: GruppenRingProps) {
  const [hover, setHover] = useState<number | null>(null);
  const [ausgewaehlt, setAusgewaehlt] = useState<number | null>(null);
  const hervorgehoben = hover ?? ausgewaehlt;

  // „Übrige“ grau statt in der Farbreihe: es ist kein Land und kein Sektor.
  const farbe = (index: number) => (gruppen[index]?.name === null ? FARBE.rand : ringFarbe(index));
  // Nach einem Lauf mit weniger Gruppen zeigt eine alte Auswahl ins Leere; dann die größte.
  const mitte = gruppen[hervorgehoben ?? 0] ?? gruppen[0];
  // Zugeklappt eine Zeile mehr, die unter der Maske verblasst — wie bei Kennzahlen und Unternehmen.
  const angeschnitten = !ausgeklappt && gruppen.length > STANDARD_ANZAHL;
  const sichtbar = ausgeklappt ? gruppen : gruppen.slice(0, STANDARD_ANZAHL + 1);

  const zeile = (g: Gruppe, i: number) => (
    <li
      key={g.name ?? ''}
      // Unter der Blende: sichtbar angedeutet, aber ohne Fokus. [WCAG 2.4.11]
      inert={i >= STANDARD_ANZAHL && !ausgeklappt}
      data-aktiv={hervorgehoben === i ? '' : undefined}
      className={cn('zeile-hover', i < sichtbar.length - 1 && 'border-b border-rand/60')}
    >
      <button
        type="button"
        aria-pressed={ausgewaehlt === i}
        onMouseEnter={() => setHover(i)}
        onMouseLeave={() => setHover(null)}
        onFocus={() => setHover(i)}
        onBlur={() => setHover(null)}
        onClick={() => setAusgewaehlt(ausgewaehlt === i ? null : i)}
        className="flex min-h-6 w-full items-baseline gap-x-2 py-2 text-left sm:gap-x-3"
      >
        <span className="w-8 shrink-0 tabular-nums text-text-leise sm:w-10">{rang(g, i)}</span>{' '}
        <Farbtupfer farbe={farbe(i)} />
        <span className="min-w-0 flex-1 hyphens-auto break-words text-text">{anzeigename(g.name)}</span>{' '}
        <GruppenWerte anteil={g.anteil} exposureCent={g.exposureCent} />
      </button>
    </li>
  );

  return (
    <section className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-6">
      <div className="min-w-0">
        <div
          aria-hidden="true"
          className="flex items-baseline gap-x-2 border-b border-rand/60 pb-2 text-xs font-medium text-text-leise sm:gap-x-3"
        >
          <span className="w-8 shrink-0 sm:w-10">{de.top25.spalteRang}</span>
          <span className="min-w-0 flex-1">{spalte}</span>
          <span className="min-w-14 shrink-0 text-right">{de.top25.spalteAnteil}</span>
          <span className="min-w-24 shrink-0 text-right">{de.top25.spalteExposure}</span>
        </div>
        {/* `-mx-2 px-2`: die Maske schneidet sonst den seitlichen Überstand des Zeilen-Hovers ab. */}
        <ul aria-label={titel} className={cn('-mx-2 flex flex-col px-2', angeschnitten && 'ausblenden-unten')}>{sichtbar.map((g, i) => zeile(g, i))}</ul>
      </div>

      <div className="mx-auto w-66 sm:mx-0">
        {/* Name vorn: die erste Spalte ist Zeilenkopf, und „Übrige“ hat keinen Rang. */}
        <ChartRahmen
          hoehe={GRUPPEN_RING_HOEHE}
          label={ring}
          tabelle={{
            beschriftung: tabelle,
            spalten: [spalte, de.top25.spalteRang, de.top25.spalteAnteil, de.top25.spalteExposure],
            zeilen: gruppen.map((g, i) => [anzeigename(g.name), rang(g, i), anteilProzent(g.anteil), euroAusCent(g.exposureCent)]),
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart accessibilityLayer={false} aria-hidden="true">
              {/* rootTabIndex -1: das SVG ist aria-hidden; bedient wird über die Legende. */}
              <Pie
                rootTabIndex={-1}
                data={[...gruppen]}
                dataKey="exposureCent"
                onMouseEnter={(_, index) => setHover(index)}
                onMouseLeave={() => setHover(null)}
                innerRadius={RING_INNEN}
                outerRadius={RING_AUSSEN}
                paddingAngle={RING_LUECKE_GRAD}
                stroke={FARBE.flaeche}
                strokeWidth={LINIE_HAUPT}
                isAnimationActive={false}
              >
                {gruppen.map((g, i) => (
                  <Cell
                    key={g.name ?? ''}
                    fill={farbe(i)}
                    fillOpacity={hervorgehoben === null || hervorgehoben === i ? 1 : 0.35}
                  />
                ))}
                {mitte === undefined ? null : (
                  <Label
                    content={
                      <RingMitte
                        symbol={symbol(mitte.name)}
                        beschriftung={anzeigename(mitte.name)}
                        wert={anteilProzent(mitte.anteil)}
                        ohneZaehler
                      />
                    }
                  />
                )}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </ChartRahmen>
      </div>
    </section>
  );
}

// „Übrige“ ist keine Gruppe mit Platz in der Reihe, sondern der Rest.
function rang(g: Gruppe, index: number): string {
  return g.name === null ? '' : zahl(index + 1);
}

/** Eigene Komponente, weil `useZahlZaehler` als Hook nicht in der `.map()`-Schleife stehen darf. */
function GruppenWerte({ anteil, exposureCent }: { readonly anteil: number; readonly exposureCent: number }) {
  const angezeigterAnteil = useZahlZaehler(anteilProzent(anteil));
  const angezeigterWert = useZahlZaehler(euroAusCent(exposureCent));
  return (
    <>
      <span className="min-w-14 shrink-0 text-right tabular-nums text-text-leise">{angezeigterAnteil}</span>{' '}
      <span className="min-w-24 shrink-0 text-right tabular-nums text-text">{angezeigterWert}</span>
    </>
  );
}
