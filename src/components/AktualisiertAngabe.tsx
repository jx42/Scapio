/*
 * "Vor 3 Tagen aktualisiert" im Seitenkopf. Eigene Komponente, damit der Minutentakt aus
 * `useJetzt` nur diese Zeile neu rendert, nicht die Seite. Der genaue Zeitpunkt steht
 * maschinenlesbar in `dateTime`; ein `title=` gibt es hier nicht (src/CLAUDE.md).
 */
import { useJetzt } from '@/hooks/useJetzt';
import { aktualisiertRelativ } from '@/lib/format';

export function AktualisiertAngabe({ stand }: { readonly stand: string }) {
  const text = aktualisiertRelativ(stand, useJetzt());
  if (text === null) return null;
  return (
    <p className="text-xs text-text-leise">
      <time dateTime={stand}>{text}</time>
    </p>
  );
}
