/*
 * Link zum Fehlerformular auf GitHub, als Knopf gestaltet [ADR-070]. Steht dort, wo nur
 * eine neue Version hilft oder etwas Unerwartetes passiert ist — Faelle, von denen der
 * Entwickler sonst nichts erfaehrt.
 *
 * Feste Adresse ohne Code und ohne Depotwerte [INV-06]; den Code traegt der Nutzer im
 * Formular ein.
 */

import { Bug } from 'lucide-react';

import { de } from '@/i18n/de';
import { Button } from '@/components/ui/button';

export function FehlerMelden() {
  return (
    <Button asChild size="sm" variant="outline">
      <a
        href="https://github.com/jx42/Scapio/issues/new?template=bug.yml" /* INV-AUSNAHME: feste Adresse, kein Wert — ADR-070 */
        target="_blank"
        rel="noopener noreferrer"
        aria-label={de.fehlerMelden.oeffnen}
      >
        <Bug aria-hidden="true" />
        {de.fehlerMelden.knopf}
      </a>
    </Button>
  );
}
