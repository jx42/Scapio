/*
 * Reiter Analyse der Aufteilung (ADR-060): Länder, Sektoren und Unternehmen in drei gleich breiten
 * Spalten, je Chart oben und Tabelle darunter; unter `xl` untereinander. Die Charts sind gleich
 * hoch, damit die Tabellen auf einer Linie beginnen. Ein „Mehr zeigen“ für alle drei Spalten.
 *
 * Hover und Auswahl der Sektoren liegen hier statt im Ring, weil die Treemap sie mitliest.
 */

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { de } from '@/i18n/de';
import type { Top25 } from '@/lib/api';
import { useGespeicherterSchalter } from '@/lib/speicher';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ANALYSE_ZEILEN, AnalyseUeberschrift } from './AnalyseSpalte';
import { GruppenRing, vorhandeneGruppe } from './GruppenRing';
import { landSymbol, sektorSymbol } from './gruppenSymbole';
import { Top25Ansicht } from './Top25Ansicht';
import { UnternehmenTreemap } from './UnternehmenTreemap';

const SPALTE = 'min-w-0 xl:border-l xl:border-rand/60 xl:px-6 xl:first:border-l-0 xl:first:pl-0 xl:last:pr-0';

export type AnalyseAnsichtProps = {
  readonly daten: Top25;
};

export function AnalyseAnsicht({ daten }: AnalyseAnsichtProps) {
  const { laender, sektoren, zeilen } = daten;
  const unternehmenId = useId();
  const landListeId = useId();
  const sektorListeId = useId();
  const tabelleId = useId();
  const [ausgeklappt, setAusgeklappt] = useGespeicherterSchalter('analyseAusgeklappt', false);
  const [landHover, setLandHover] = useState<string | null>(null);
  const [landAuswahl, setLandAuswahl] = useState<string | null>(null);
  const [sektorHover, setSektorHover] = useState<string | null>(null);
  const [sektorAuswahl, setSektorAuswahl] = useState<string | null>(null);
  const [unternehmen, setUnternehmen] = useState<string | null>(null);

  const mehr = [laender.length, sektoren.length, zeilen.length].some((n) => n > ANALYSE_ZEILEN);
  const gesteuert = [laender.length > 0 && landListeId, sektoren.length > 0 && sektorListeId, tabelleId].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-3 xl:gap-0">
        {laender.length === 0 ? null : (
          <div className={SPALTE}>
            <GruppenRing
              titel={de.top25.laender}
              ring={de.top25.ringLaender}
              tabelle={de.top25.tabelleLaender}
              spalte={de.top25.spalteLand}
              gruppen={laender}
              anzeigename={de.top25.land}
              symbol={landSymbol}
              ausgeklappt={ausgeklappt}
              listeId={landListeId}
              hover={landHover}
              ausgewaehlt={landAuswahl}
              onHover={setLandHover}
              onAuswahl={setLandAuswahl}
            />
          </div>
        )}
        {sektoren.length === 0 ? null : (
          <div className={SPALTE}>
            <GruppenRing
              titel={de.top25.sektoren}
              ring={de.top25.ringSektoren}
              tabelle={de.top25.tabelleSektoren}
              spalte={de.top25.spalteSektor}
              gruppen={sektoren}
              anzeigename={de.top25.sektor}
              symbol={sektorSymbol}
              ausgeklappt={ausgeklappt}
              listeId={sektorListeId}
              hover={sektorHover}
              ausgewaehlt={sektorAuswahl}
              onHover={setSektorHover}
              onAuswahl={setSektorAuswahl}
            />
          </div>
        )}
        <section aria-labelledby={unternehmenId} className={cn(SPALTE, 'flex flex-col gap-3')}>
          <AnalyseUeberschrift id={unternehmenId}>{de.top25.unternehmen}</AnalyseUeberschrift>
          <UnternehmenTreemap
            zeilen={zeilen}
            andereCent={daten.andereCent}
            andereAnteil={daten.andereAnteil}
            andereAnzahl={daten.andereAnzahl}
            sektoren={sektoren}
            hervorgehoben={unternehmen}
            sektorHervorgehoben={vorhandeneGruppe(sektoren, sektorHover ?? sektorAuswahl)}
            onHover={setUnternehmen}
          />
          <Top25Ansicht id={tabelleId} zeilen={zeilen} ausgeklappt={ausgeklappt} hervorgehoben={unternehmen} onHover={setUnternehmen} />
        </section>
      </div>
      {mehr ? (
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={ausgeklappt}
          aria-controls={gesteuert}
          onClick={() => setAusgeklappt(!ausgeklappt)}
          className="self-start"
        >
          <ChevronDown className={cn('transition-transform', ausgeklappt && 'rotate-180')} aria-hidden="true" />
          {ausgeklappt ? de.top25.wenigerZeigen : de.top25.mehrZeigen}
        </Button>
      ) : null}
    </div>
  );
}
