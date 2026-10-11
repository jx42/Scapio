/*
 * Der Ablauf der MCP-Anmeldung (noetig, laeuft, erfolgreich, gescheitert) — gemeldet
 * von `Aktualisieren` ueber `onAnmeldungStatus`. Betrifft die ganze Seite genauso wie
 * die Hinweise des letzten Laufs und steht deshalb neben `Laufhinweise`: eine
 * Alert-Reihe zwischen Seitentitel und Kacheln, nie als Text neben dem Knopf.
 * https://ui.shadcn.com/docs/components/base/alert
 *
 * `noetig` stammt vom Fehlercode des letzten BEENDETEN Laufs und bleibt deshalb stehen,
 * bis ein neuer Lauf ihn ersetzt — auch dann noch, wenn die Anmeldung selbst laengst
 * laeuft, gescheitert oder schon abgeschlossen ist. Ungefiltert zeigte das zwei Alerts,
 * die sich widersprechen: „Anmeldung noetig“ neben „Anmeldung abgeschlossen“. Der Alert
 * blendet `noetig` deshalb aus, sobald `laeuft`, `erfolg` oder `fehler` den aktuelleren
 * Stand kennt.
 */

import { useEffect, useState } from 'react';
import { CircleCheck, KeyRound, Loader2, RefreshCw, TriangleAlert, X } from 'lucide-react';

import { de } from '@/i18n/de';
import type { McpAnmeldungStatus } from '@/components/Aktualisieren';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function McpAnmeldungHinweise({
  noetig,
  erstmals,
  laeuft,
  erfolg,
  fehler,
  onAnmelden,
  onAktualisieren,
}: McpAnmeldungStatus) {
  // Rein optische Sichtbarkeit, kein Datenzustand: setzt sich zurueck, sobald die
  // erfolgreiche Anmeldung selbst verschwindet, damit die naechste wieder angezeigt wird.
  const [erfolgVersteckt, setErfolgVersteckt] = useState(false);
  useEffect(() => {
    if (!erfolg) setErfolgVersteckt(false);
  }, [erfolg]);

  const zeigeNoetig = noetig && !laeuft && !erfolg && fehler === null;
  const zeigeErfolg = erfolg && !erfolgVersteckt;

  if (!zeigeNoetig && !laeuft && !zeigeErfolg && fehler === null) return null;

  return (
    <div className="flex flex-col gap-2">
      {zeigeNoetig && (
        <Alert variant={erstmals ? 'default' : 'verlust'} role={erstmals ? 'status' : 'alert'}>
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>{de.mcpAnmeldung.titel}</AlertTitle>
          <AlertDescription>{erstmals ? de.mcpAnmeldung.ersteAnmeldung : de.mcpAnmeldung.noetig}</AlertDescription>
          <AlertAction>
            <Button type="button" size="sm" onClick={onAnmelden}>
              <KeyRound aria-hidden="true" />
              {de.mcpAnmeldung.anmeldenKnopf}
            </Button>
          </AlertAction>
        </Alert>
      )}

      {laeuft && (
        <Alert role="status">
          <Loader2 aria-hidden="true" className="animate-spin" />
          <AlertTitle>{de.mcpAnmeldung.titel}</AlertTitle>
          <AlertDescription>{de.mcpAnmeldung.laeuftBeschreibung}</AlertDescription>
        </Alert>
      )}

      {zeigeErfolg && (
        <Alert role="status">
          <CircleCheck aria-hidden="true" />
          <AlertTitle>{de.mcpAnmeldung.titel}</AlertTitle>
          <AlertDescription>{de.mcpAnmeldung.erfolg}</AlertDescription>
          <AlertAction className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                onAktualisieren();
                setErfolgVersteckt(true);
              }}
            >
              <RefreshCw aria-hidden="true" />
              {de.aktualisieren.knopf}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8"
              aria-label={de.dialog.schliessen}
              onClick={() => setErfolgVersteckt(true)}
            >
              <X aria-hidden="true" />
            </Button>
          </AlertAction>
        </Alert>
      )}

      {fehler !== null && (
        <Alert variant="verlust">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>{de.mcpAnmeldung.titel}</AlertTitle>
          <AlertDescription>
            <p>{de.mcpAnmeldung.gescheitert(fehler.code)}</p>
            <p className="text-xs text-text-leise">{de.laufhinweise.code(fehler.code)}</p>
          </AlertDescription>
          <AlertAction>
            <Button type="button" size="sm" onClick={onAnmelden}>
              <KeyRound aria-hidden="true" />
              {de.mcpAnmeldung.anmeldenKnopf}
            </Button>
          </AlertAction>
        </Alert>
      )}
    </div>
  );
}
