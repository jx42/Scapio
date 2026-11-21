/*
 * Hinweise aus dem letzten Lauf: eine Alert-Reihe zwischen Seitentitel und Kacheln, ueber
 * die gesamte Seitenbreite. Jeder Alert sagt, was passiert ist und was der Nutzer tun kann.
 * https://ui.shadcn.com/docs/components/base/alert
 *
 * Drei Sorten, in dieser Reihenfolge:
 * - ein gescheiterter Lauf (`fehler`): Satz zum Code, dazu der Code klein;
 * - gescheiterte Quellen (`lib/quellenMeldung.ts`): Ursache, Folge, Abhilfe — mit
 *   Aktualisieren-Knopf, wo ein zweiter Versuch hilft;
 * - uebrige Hinweise (`lib/hinweisText.ts`): Titel, Satz, Abhilfe — per X ausblendbar,
 *   gemerkt je Lauf im Browser, die Daten bleiben unberuehrt.
 *
 * „Fehler melden“ steht, wo nur eine neue Version hilft oder etwas Unerwartetes passiert ist.
 *
 * Die Reihe ist eine Live-Region, die immer im DOM steht, auch leer — gefuellt eingefuegt,
 * sagt ein Screenreader sie oft nicht an. Leer ist sie `sr-only` und nimmt keinen Abstand.
 */

import { RefreshCw, TriangleAlert, X } from 'lucide-react';

import { de } from '@/i18n/de';
import type { LaufFehlerCode } from '../../shared/laufFehler.ts';
import type { LaufHinweis } from '@/lib/api';
import { hinweisMelden, hinweisSchluessel, hinweisText, hinweisTitel, hinweisTun } from '@/lib/hinweisText';
import { meldenSinnvoll, quellenMeldungen, type QuellenMeldung } from '@/lib/quellenMeldung';
import { useAusgeblendet } from '@/lib/speicher';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FehlerMelden } from '@/components/FehlerMelden';

/** Codes, bei denen ein erneuter Lauf oft schon genuegt — nur dort steht der Knopf. */
const ERNEUT_SINNVOLL: ReadonlySet<string> = new Set([
  'E_MCP_DROSSEL',
  'E_MCP_ZEIT',
  'E_MCP_TRANSIENT',
  'E_MCP_ABGELEHNT',
  'E_MCP_UNVOLLSTAENDIG',
  'E_STORNO_BREMSE',
  'E_SPERRE',
] satisfies (LaufFehlerCode | 'E_SPERRE')[]);

export function Laufhinweise({
  laufId,
  hinweise,
  quellen,
  fehler,
  onAktualisieren,
}: {
  readonly laufId: number | null;
  readonly hinweise: readonly LaufHinweis[];
  readonly quellen: Readonly<Record<string, string>>;
  /** Der Fehler eines abgebrochenen Laufs — `null` bei `teilweise` (die Quellen-Alerts
   *  nennen den Code dort je Quelle) und bei faelliger Anmeldung (eigener Alert, App.tsx). */
  readonly fehler: { readonly code: string; readonly text: string | null } | null;
  readonly onAktualisieren: () => void;
}) {
  const [ausgeblendet, ausblenden] = useAusgeblendet(laufId);
  const meldungen = quellenMeldungen(hinweise, quellen);
  const sichtbar = hinweise
    .filter((hinweis) => hinweis.art !== 'quelleGescheitert')
    .map((hinweis) => ({ hinweis, schluessel: hinweisSchluessel(hinweis) }))
    .filter(({ schluessel }) => !ausgeblendet.has(schluessel));

  return (
    <div role="status" className="flex flex-col gap-2 empty:sr-only">
      {fehler !== null && (
        <Alert variant="warnung" role="none">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>{de.laufhinweise.fehlerTitel}</AlertTitle>
          <AlertDescription>
            <p>
              {de.laufhinweise.fehlerFolge} {de.laufFehler[fehler.code] ?? de.laufFehler.sonst}
            </p>
            <p className="text-xs text-text-leise">{de.laufhinweise.code(fehler.code)}</p>
          </AlertDescription>
          <Aktionen
            aktualisieren={ERNEUT_SINNVOLL.has(fehler.code) ? onAktualisieren : null}
            melden={meldenSinnvoll(fehler.code)}
          />
        </Alert>
      )}
      {meldungen.map((meldung) => (
        <QuellenAlert key={meldung.schluessel} meldung={meldung} onAktualisieren={onAktualisieren} />
      ))}
      {sichtbar.map(({ hinweis, schluessel }) => (
        <Alert key={schluessel} variant="warnung" role="none">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>{hinweisTitel(hinweis)}</AlertTitle>
          <AlertDescription>
            <p>{hinweisText(hinweis)}</p>
            <p>{hinweisTun(hinweis)}</p>
          </AlertDescription>
          <AlertAction className="flex items-center gap-2">
            {hinweisMelden(hinweis) && <FehlerMelden />}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => ausblenden(schluessel)}
            >
              <X aria-hidden="true" />
              <span className="sr-only">{de.laufhinweise.ausblenden}</span>
            </Button>
          </AlertAction>
        </Alert>
      ))}
    </div>
  );
}

function QuellenAlert({
  meldung,
  onAktualisieren,
}: {
  readonly meldung: QuellenMeldung;
  readonly onAktualisieren: () => void;
}) {
  return (
    <Alert variant="warnung" role="none">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>{meldung.titel}</AlertTitle>
      <AlertDescription>
        <p>
          {meldung.grund !== null && `${meldung.grund} `}
          {meldung.folge}
        </p>
        <p>{meldung.tun}</p>
        {meldung.code !== null && <p className="text-xs text-text-leise">{de.laufhinweise.code(meldung.code)}</p>}
      </AlertDescription>
      <Aktionen aktualisieren={meldung.erneutSinnvoll ? onAktualisieren : null} melden={meldung.meldenSinnvoll} />
    </Alert>
  );
}

function Aktionen({
  aktualisieren,
  melden,
}: {
  readonly aktualisieren: (() => void) | null;
  readonly melden: boolean;
}) {
  if (aktualisieren === null && !melden) return null;
  return (
    <AlertAction className="flex flex-wrap items-center gap-2">
      {aktualisieren !== null && (
        <Button type="button" size="sm" variant="outline" onClick={aktualisieren}>
          <RefreshCw aria-hidden="true" />
          {de.aktualisieren.knopf}
        </Button>
      )}
      {melden && <FehlerMelden />}
    </AlertAction>
  );
}
