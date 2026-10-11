/*
 * Fehlendes Sitzungstoken — als Alert in der Reihe zwischen Seitentitel und Kacheln,
 * nicht als Unterzeile am Knopf: eine Zeile darunter uebersieht man, und es betrifft
 * die ganze Seite. Einen laufenden Lauf zeigt allein der Knopf mit Spinner.
 * https://ui.shadcn.com/docs/components/base/alert
 */

import { TriangleAlert } from 'lucide-react';

import { de } from '@/i18n/de';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function AktualisierenHinweise({ kannAktualisieren }: { readonly kannAktualisieren: boolean }) {
  if (kannAktualisieren) return null;

  return (
    <Alert variant="verlust" role="alert">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>{de.aktualisieren.keinTokenTitel}</AlertTitle>
      <AlertDescription>{de.aktualisieren.keinToken}</AlertDescription>
    </Alert>
  );
}
