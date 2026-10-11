/*
 * Kachel 4: Inhalt fuer die gehaltenen Fonds, zu denen diese Auswertung keine
 * Bestandteile zeigen kann. Rein darstellend, ohne eigene Abfrage — Inhalt von
 * `Top25Dialog`, ob einige oder alle Fonds fehlen.
 */

import { Copy } from 'lucide-react';
import { toast } from 'sonner';

import { de } from '@/i18n/de';
import type { FehlenderFonds } from '@/lib/api';
import { prozent } from '@/lib/format';
import { Button } from '@/components/ui/button';
// Typ von der Rechenkern-Seite — nur `import type`, kein Serverpfad im Bundle. [INV-11]
// Der Laufzeit-Array bleibt hier eigens stehen (die Kachel rechnet nicht, importiert aber
// auch nichts aus `db/`/`ingest/`); `satisfies` haelt ihn deckungsgleich mit der Typquelle.
import type { FundsJsonAnbieter } from '../../../db/repository/fondsAufloesung.ts';

const FUNDS_JSON_ANBIETER = ['ishares', 'xtrackers', 'amundi'] as const satisfies readonly FundsJsonAnbieter[];

function istFundsJsonAnbieter(anbieter: string): anbieter is FundsJsonAnbieter {
  return (FUNDS_JSON_ANBIETER as readonly string[]).includes(anbieter);
}

/** Der fertige `funds.json`-Baustein fuer einen Fonds, sofern der Anbieter das erlaubt. */
function fundsJsonSchnipsel(fonds: FehlenderFonds): string | null {
  if (fonds.fall !== 'abrufGescheitert' || !istFundsJsonAnbieter(fonds.anbieter)) return null;
  const eintrag =
    fonds.anbieter === 'ishares'
      ? { anbieter: fonds.anbieter, isin: fonds.isin, name: fonds.name, produktId: de.top25.fundsJsonAdressePlatzhalter }
      : { anbieter: fonds.anbieter, isin: fonds.isin, name: fonds.name };
  return JSON.stringify(eintrag, null, 2);
}

async function kopieren(schnipsel: string): Promise<void> {
  await navigator.clipboard.writeText(schnipsel);
  toast.success(de.top25.fundsJsonKopiert);
}

export type FehlendeFondsListeProps = {
  /** Anteil des ganzen Depots mit bekannten Bestandteilen, 0..1 — nicht dieselbe Zahl wie der Untertitel. */
  readonly abdeckung: number;
  readonly fehlendeFonds: readonly FehlenderFonds[];
};

export function FehlendeFondsListe({ abdeckung, fehlendeFonds }: FehlendeFondsListeProps) {
  const eintraege = fehlendeFonds.map((fonds) => ({ fonds, schnipsel: fundsJsonSchnipsel(fonds) }));
  const mitSchnipsel = eintraege.filter((e) => e.schnipsel !== null);
  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-text-leise">{de.top25.fehlendeFondsEinleitung(prozent(abdeckung))}</p>
      <ul className="flex flex-col">
        {eintraege.map(({ fonds, schnipsel }) => (
          <li key={fonds.isin} className="border-b border-rand py-3 first:pt-0 last:border-b-0 last:pb-0">
            <p>
              <span className="font-medium text-text">{fonds.name}</span>{' '}
              <span className="text-text-leise">{de.top25.fehlendeFondsIsin(fonds.isin)}</span>
            </p>
            <p className="mt-1 text-text-leise">
              {fonds.fall === 'gesperrt'
                ? de.top25.fehlendeFondsGesperrt(de.top25.anbieterName[fonds.anbieter] ?? de.top25.anbieterUnbekannt)
                : de.top25.fehlendeFondsAbrufGescheitert}
            </p>
            {schnipsel === null ? null : (
              <div className="mt-2 flex flex-col items-start gap-2">
                <pre className="w-full overflow-x-auto rounded-md border border-rand bg-grund p-2 text-xs text-text-leise">
                  <code>{schnipsel}</code>
                </pre>
                <Button type="button" variant="outline" size="sm" onClick={() => void kopieren(schnipsel)}>
                  <Copy aria-hidden="true" className="size-3.5" />
                  {de.top25.fundsJsonKopierenKnopf}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {mitSchnipsel.length === 0 ? null : (
        <div className="border-t border-rand pt-3">
          <p className="font-medium text-text">{de.top25.fundsJsonAnleitungTitel}</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-text-leise">
            {de.top25
              .fundsJsonAnleitungSchritte(mitSchnipsel.some((e) => e.fonds.anbieter === 'ishares'))
              .map((schritt) => (
                <li key={schritt}>{schritt}</li>
              ))}
          </ol>
        </div>
      )}
    </div>
  );
}
