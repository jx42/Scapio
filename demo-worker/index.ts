/**
 * Worker der öffentlichen Demo [ADR-048]: liest nur aus dem Abzug, rechnet nichts, schreibt
 * nichts. Abfrageparameter werden über `shared/demoAbzug.ts` zu Dateipfaden.
 */

import { abzugPfad } from '../shared/demoAbzug.ts';
import { KOPFZEILEN, UNVERAENDERLICH, istUnveraenderlich } from '../server/kopfzeilen.ts';

/** Nur das, was der Worker vom Binding braucht — keine Abhängigkeit auf die Workers-Typen. */
export type Umgebung = {
  readonly ASSETS: { fetch(anfrage: Request | string): Promise<Response> };
};

function mitKopfzeilen(antwort: Response, pfad: string): Response {
  const neu = new Response(antwort.body, antwort);
  for (const [name, wert] of KOPFZEILEN) neu.headers.set(name, wert);
  if (antwort.status === 200 && istUnveraenderlich(pfad)) neu.headers.set('Cache-Control', UNVERAENDERLICH);
  return neu;
}

function nichtGefunden(): Response {
  return new Response('Nicht im Demo-Abzug.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

export default {
  async fetch(anfrage: Request, umgebung: Umgebung): Promise<Response> {
    const adresse = new URL(anfrage.url);
    if (anfrage.method !== 'GET' && anfrage.method !== 'HEAD') {
      return mitKopfzeilen(new Response('Die Demo ändert nichts.', { status: 405, headers: { Allow: 'GET, HEAD' } }), adresse.pathname);
    }

    let antwort: Response;
    if (adresse.pathname === '/api' || adresse.pathname.startsWith('/api/')) {
      const pfad = abzugPfad(adresse.pathname, adresse.searchParams);
      antwort = pfad === null ? nichtGefunden() : await umgebung.ASSETS.fetch(new Request(new URL(pfad, adresse), { method: anfrage.method }));
    } else {
      antwort = await umgebung.ASSETS.fetch(anfrage);
    }
    return mitKopfzeilen(antwort, adresse.pathname);
  },
};
