/*
 * Ein Ring der Länder oder Sektoren im Reiter Analyse: Überschrift, Ring, Legende darunter. Gruppen,
 * Anteile und „Übrige“ kommen fertig aus `core/lookthrough.ts`.
 *
 * Wie in der Aufteilung sind die Legendenzeilen Knöpfe, damit Hervorheben auch per Tastatur geht.
 * Hover und Auswahl hält `AnalyseAnsicht`, weil die Treemap den Sektor mit hervorhebt.
 */

import { memo, useId } from 'react';
import { Cell, Label, Pie, PieChart, ResponsiveContainer } from 'recharts';

import { de } from '@/i18n/de';
import type { Gruppe } from '@/lib/api';
import { ANALYSE_CHART_HOEHE, DECKKRAFT_GEDIMMT, LINIE_HAUPT, RING_AUSSEN, RING_INNEN, RING_LUECKE_GRAD } from '@/lib/chartmasse';
import { anteilProzent, euroAusCent, zahl } from '@/lib/format';
import { FARBE } from '@/lib/farben';
import { cn } from '@/lib/utils';
import { useZahlZaehler } from '@/hooks/useZahlZaehler';
import { ChartRahmen } from '@/components/ChartRahmen';
import { Farbtupfer, RingMitte, type RingSymbol, ringFarbe } from '@/components/Ring';
import { ANALYSE_ZEILEN, AnalyseUeberschrift } from './AnalyseSpalte';

/**
 * Index der Gruppe zu einem Rohnamen, wie `core/lookthrough.ts` ihn gruppiert: ohne eigene Gruppe
 * „Übrige“, und `-1`, wenn es auch die nicht gibt.
 */
export function gruppenIndex(gruppen: readonly Gruppe[], name: string | null): number {
  const gesucht = name?.trim() ?? '';
  const index = gesucht === '' ? -1 : gruppen.findIndex((g) => g.name === gesucht);
  return index === -1 ? gruppen.findIndex((g) => g.name === null) : index;
}

/**
 * Farbe einer Gruppe nach ihrem Rohnamen — dieselbe im Ring und in der Treemap. Grau ist, was im
 * Ring keine eigene Farbe hat: „Übrige“, unbekannte Namen und fehlende Angaben.
 */
export function gruppenFarbe(gruppen: readonly Gruppe[], name: string | null): string {
  const index = gruppenIndex(gruppen, name);
  return index === -1 || gruppen[index]?.name === null ? FARBE.rand : ringFarbe(index);
}

/**
 * Schlüssel einer Gruppe für Hover und Auswahl: ihr Rohname, „Übrige“ leer. Am Namen statt am Index,
 * damit eine Auswahl nach einem Lauf mit neuer Reihenfolge an derselben Gruppe bleibt.
 */
export function gruppenSchluessel(g: Gruppe): string {
  return g.name ?? '';
}

/** Der Schlüssel, wenn es die Gruppe (noch) gibt; sonst nichts hervorgehoben. */
export function vorhandeneGruppe(gruppen: readonly Gruppe[], schluessel: string | null): string | null {
  return schluessel !== null && gruppen.some((g) => gruppenSchluessel(g) === schluessel) ? schluessel : null;
}

export type GruppenRingProps = {
  readonly titel: string;
  readonly ring: string;
  readonly tabelle: string;
  readonly spalte: string;
  readonly gruppen: readonly Gruppe[];
  readonly anzeigename: (name: string | null) => string;
  readonly symbol: (name: string | null) => RingSymbol;
  readonly ausgeklappt: boolean;
  /** Ziel von `aria-controls` des gemeinsamen „Mehr zeigen“. */
  readonly listeId: string;
  /** Schlüssel nach `gruppenSchluessel`. */
  readonly hover: string | null;
  readonly ausgewaehlt: string | null;
  readonly onHover: (schluessel: string | null) => void;
  readonly onAuswahl: (schluessel: string | null) => void;
};

// Ohne memo zeichnete jeder Hover über Treemap oder Tabelle beide Ringe neu.
export const GruppenRing = memo(function GruppenRing({
  titel,
  ring,
  tabelle,
  spalte,
  gruppen,
  anzeigename,
  symbol,
  ausgeklappt,
  listeId,
  hover,
  ausgewaehlt,
  onHover,
  onAuswahl,
}: GruppenRingProps) {
  const titelId = useId();
  const hervorgehoben = vorhandeneGruppe(gruppen, hover ?? ausgewaehlt);
  const farbe = (index: number) => gruppenFarbe(gruppen, gruppen[index]?.name ?? null);
  // Ohne Hervorhebung, oder wenn ein Lauf die Gruppe entfernt hat, die größte.
  const mitte = gruppen.find((g) => gruppenSchluessel(g) === hervorgehoben) ?? gruppen[0];
  const angeschnitten = !ausgeklappt && gruppen.length > ANALYSE_ZEILEN;
  const sichtbar = ausgeklappt ? gruppen : gruppen.slice(0, ANALYSE_ZEILEN + 1);

  const zeile = (g: Gruppe, i: number) => {
    const k = gruppenSchluessel(g);
    return (
      <li
        key={k}
        // Unter der Blende: sichtbar angedeutet, aber ohne Fokus. [WCAG 2.4.11]
        inert={i >= ANALYSE_ZEILEN && !ausgeklappt}
        data-aktiv={hervorgehoben === k ? '' : undefined}
        className={cn('zeile-hover', i < sichtbar.length - 1 && 'border-b border-rand/60')}
      >
        <button
          type="button"
          aria-pressed={ausgewaehlt === k}
          onMouseEnter={() => onHover(k)}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover(k)}
          onBlur={() => onHover(null)}
          onClick={() => onAuswahl(ausgewaehlt === k ? null : k)}
          className="flex min-h-6 w-full items-baseline gap-x-2 py-2 text-left"
        >
          <span className="w-6 shrink-0 tabular-nums text-text-leise">{rang(g, i)}</span>{' '}
          <Farbtupfer farbe={farbe(i)} />
          <span className="min-w-0 flex-1 truncate text-text">{anzeigename(g.name)}</span>{' '}
          <GruppenWerte anteil={g.anteil} exposureCent={g.exposureCent} />
        </button>
      </li>
    );
  };

  return (
    <section aria-labelledby={titelId} className="flex min-w-0 flex-col gap-3">
      <AnalyseUeberschrift id={titelId}>{titel}</AnalyseUeberschrift>
      {/* Name vorn: die erste Spalte ist Zeilenkopf, und „Übrige“ hat keinen Rang. */}
      <ChartRahmen
        hoehe={ANALYSE_CHART_HOEHE}
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
              onMouseEnter={(_, index) => {
                const g = gruppen[index];
                onHover(g === undefined ? null : gruppenSchluessel(g));
              }}
              onMouseLeave={() => onHover(null)}
              innerRadius={RING_INNEN}
              outerRadius={RING_AUSSEN}
              paddingAngle={RING_LUECKE_GRAD}
              stroke={FARBE.flaeche}
              strokeWidth={LINIE_HAUPT}
              isAnimationActive={false}
            >
              {gruppen.map((g, i) => (
                <Cell
                  key={gruppenSchluessel(g)}
                  fill={farbe(i)}
                  fillOpacity={hervorgehoben === null || hervorgehoben === gruppenSchluessel(g) ? 1 : DECKKRAFT_GEDIMMT}
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

      <div className="min-w-0">
        <div
          aria-hidden="true"
          className="flex items-baseline gap-x-2 border-b border-rand/60 pb-2 text-xs font-medium text-text-leise"
        >
          <span className="w-6 shrink-0">{de.top25.spalteRangKurz}</span>
          <span className="min-w-0 flex-1">{spalte}</span>
          <span className="min-w-14 shrink-0 text-right">{de.top25.spalteAnteil}</span>
          <span className="min-w-24 shrink-0 text-right">{de.top25.spalteExposure}</span>
        </div>
        {/* `-mx-2 px-2`: die Maske schneidet sonst den seitlichen Überstand des Zeilen-Hovers ab. */}
        <ul id={listeId} aria-label={titel} className={cn('-mx-2 flex flex-col px-2', angeschnitten && 'ausblenden-unten')}>
          {sichtbar.map((g, i) => zeile(g, i))}
        </ul>
      </div>
    </section>
  );
});

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
