/*
 * Das Jahr des Releases, aus dem die öffentliche Demo stammt. Steht nur im
 * <meta name="release-jahr">, das `npm run demo:export` einfügt [ADR-069] — lokal und unter
 * `npm run demo` fehlt das Tag, dann entfällt der Urhebervermerk.
 */

const META_NAME = 'release-jahr';

export function releaseJahr(): string | null {
  if (typeof document === 'undefined') return null;
  const inhalt = document.querySelector(`meta[name="${META_NAME}"]`)?.getAttribute('content') ?? '';
  return /^\d{4}$/.test(inhalt) ? inhalt : null;
}
