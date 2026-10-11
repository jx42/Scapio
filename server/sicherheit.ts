/**
 * Ein einziges `onRequest` fuer ALLE Routen. Keine Route entscheidet selbst,
 * ob sie geschuetzt ist — sonst waere die eine, die es vergisst, das Loch. [§9]
 *
 * Warum ueberhaupt etwas schuetzen, wenn der Server nur auf 127.0.0.1 hoert?
 * Weil jede Seite im Browser desselben Rechners diesen Server erreichen kann.
 * Zwei Angriffe bleiben also uebrig, und gegen genau die richtet sich dieses Modul:
 *
 *  - CSRF: eine fremde Seite laesst den Browser `POST /api/refresh` schicken.
 *    Abwehr: Origin-Pruefung plus ein Sitzungsschluessel, den nur die eigene Seite kennt.
 *  - DNS-Rebinding: ein fremder Name zeigt auf 127.0.0.1, wodurch der Browser die
 *    fremde Seite als "gleiche Herkunft" ansieht. Abwehr: der `Host`-Kopf muss
 *    woertlich `127.0.0.1:<port>` oder `localhost:<port>` sein.
 *
 * ZUR ORIGIN-REGEL: Browser senden bei einer normalen Navigation (die Seite selbst,
 * das Bundle, das Stylesheet) und bei same-origin-GET per `fetch` KEINEN `Origin`-Kopf.
 * Die Regel "Origin fehlt → 403" woertlich auf jede Anfrage angewandt, wuerde die
 * eigene Seite unerreichbar machen. Deshalb:
 *   - Auf `/api/*` gilt sie streng: entweder `Origin` stimmt exakt, oder — wenn er
 *     ganz fehlt — muss `Sec-Fetch-Site: same-origin` belegen, dass die Anfrage aus
 *     der eigenen Seite kommt. `Sec-Fetch-*` setzt der Browser selbst; Seitencode
 *     kann es nicht faelschen. Fehlt BEIDES (curl, ein fremdes Skript), ist es 403 —
 *     ebenso bei `Origin: null` oder jeder fremden Herkunft.
 *   - Fuer die Auslieferung der Seite genuegt die Host-Pruefung; sonst kaeme die
 *     Seite selbst nie durch, denn bei einer Navigation sendet der Browser keinen
 *     `Origin`. Ein fremdes Dokument kann aus der Seite nichts lesen (CORP/COOP
 *     unten, und kein CORS-Header).
 *
 * Kein CORS-Header wird jemals gesetzt. `@fastify/cors` ist nicht installiert und
 * wird nicht installiert. [CLAUDE.md]
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { herkunftAbgelehnt, hostAbgelehnt, rumpfAbgelehnt, tokenFehlt, ApiFehler } from './fehler.ts';
import { KOPFZEILEN, UNVERAENDERLICH, istUnveraenderlich } from './kopfzeilen.ts';

export { CSP, KOPFZEILEN, UNVERAENDERLICH, istUnveraenderlich } from './kopfzeilen.ts';

/** Erkennt `/api`, `/api/…` und `/api?…` — nie per Suffix oder Teilstring. */
function istApiPfad(pfad: string): boolean {
  return pfad === '/api' || pfad.startsWith('/api/') || pfad.startsWith('/api?');
}

/** 32 zufaellige Bytes. Nur im Speicher, nie auf Platte, nie in einem Log. */
export function neuerToken(): string {
  return randomBytes(32).toString('hex');
}

/** Zeitkonstanter Vergleich. Ungleiche Laenge zaehlt als ungleich, ohne Vergleich. */
export function tokenStimmt(erwartet: string, gegeben: unknown): boolean {
  if (typeof gegeben !== 'string') return false;
  const a = Buffer.from(erwartet, 'utf8');
  const b = Buffer.from(gegeben, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type SicherheitsOptionen = {
  readonly port: number;
  readonly token: string;
};

function ersterWert(kopf: string | string[] | undefined): string | undefined {
  return Array.isArray(kopf) ? kopf[0] : kopf;
}

export function registriereSicherheit(app: FastifyInstance, optionen: SicherheitsOptionen): void {
  const { port, token } = optionen;
  const erlaubteHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  // Aus den Hosts abgeleitet, nicht daneben gepflegt: eine Seite, die unter einem erlaubten
  // Host ausgeliefert wird, muss von dort auch POSTen koennen.
  const erlaubteHerkunft = new Set([...erlaubteHosts].map((h) => `http://${h}`));

  app.addHook('onRequest', (anfrage: FastifyRequest, antwort: FastifyReply, weiter: (f?: Error) => void) => {
    // Zuerst die Koepfe — sie sollen auch auf einer 403-Antwort stehen.
    for (const [name, wert] of KOPFZEILEN) antwort.header(name, wert);

    const methode = anfrage.method.toUpperCase();
    if (methode !== 'GET' && methode !== 'HEAD' && methode !== 'POST') {
      weiter(
        new ApiFehler('E_METHODE', 405, 'Diese Methode bedient der Server nicht.', 'Erlaubt sind GET und POST.'),
      );
      return;
    }

    // DNS-Rebinding: gilt fuer JEDE Anfrage, auch fuer die Seite selbst.
    const host = ersterWert(anfrage.headers.host);
    if (host === undefined || !erlaubteHosts.has(host.toLowerCase())) {
      weiter(hostAbgelehnt());
      return;
    }

    // Prozent-kodiert (`/%61pi/refresh`) sieht der rohe Pfad nicht als `/api/*` aus, das
    // Routing loest trotzdem dorthin auf. `onRequest` laeuft bei Fastify NACH dem Routing
    // (empirisch gegen 5.12.1 geprueft: `routeOptions.url` traegt hier bereits das passende
    // Muster) — deshalb reicht es, zusaetzlich zum rohen Pfad die aufgeloeste Route zu pruefen,
    // ohne einen spaeteren Hook zu brauchen. Bei einer unbekannten Route ist `routeOptions.url`
    // `undefined`; dann traegt der rohe Pfad die Entscheidung wie bisher.
    const istApi = istApiPfad(anfrage.url) || istApiPfad(anfrage.routeOptions.url ?? '');
    const herkunft = ersterWert(anfrage.headers.origin);

    if (herkunft !== undefined) {
      // Auch der Wert "null" ist eine fremde Herkunft, kein fehlender Kopf.
      if (!erlaubteHerkunft.has(herkunft)) {
        weiter(herkunftAbgelehnt());
        return;
      }
    } else if (istApi) {
      // Kein Origin auf /api/*: nur durchlassen, wenn der BROWSER selbst bescheinigt,
      // dass die Anfrage aus der eigenen Seite kommt. Alles andere — curl, ein fremdes
      // Formular, ein Skript ohne Browserkontext — bekommt 403. [§9]
      const ziel = ersterWert(anfrage.headers['sec-fetch-site']);
      if (ziel !== 'same-origin') {
        weiter(herkunftAbgelehnt());
        return;
      }
    }

    if (methode === 'POST') {
      if (!tokenStimmt(token, ersterWert(anfrage.headers['x-portfolio-token']))) {
        weiter(tokenFehlt());
        return;
      }
      // Die mutierenden Routen nehmen keinerlei Eingabe entgegen. [INV-08, ADR-012]
      const laenge = ersterWert(anfrage.headers['content-length']);
      const stueckweise = ersterWert(anfrage.headers['transfer-encoding']);
      const hatRumpf = (laenge !== undefined && laenge !== '0') || stueckweise !== undefined;
      const hatParameter = anfrage.url.includes('?');
      if (hatRumpf || hatParameter) {
        weiter(rumpfAbgelehnt());
        return;
      }
    }

    weiter();
  });

  // Die eine Ausnahme von `no-store`, als sichtbarer Zweig. Erst beim Senden, weil erst
  // dann der Status feststeht: ein 404 mit `immutable` — etwa waehrend `vite build --watch`
  // `dist/` leert — hielte der Browser ein Jahr lang fest, und da der Hash bei gleichem
  // Inhalt gleich bleibt, kaeme die Datei auch nach dem Bau nie an. Nur lesende Methoden:
  // eine Antwort auf POST wird nie gecacht.
  app.addHook('onSend', (anfrage: FastifyRequest, antwort: FastifyReply, nutzlast: unknown, weiter) => {
    const methode = anfrage.method.toUpperCase();
    const erfolgreich = antwort.statusCode === 200 || antwort.statusCode === 304;
    if ((methode === 'GET' || methode === 'HEAD') && erfolgreich && istUnveraenderlich(anfrage.url)) {
      antwort.header('Cache-Control', UNVERAENDERLICH);
    }
    weiter(null, nutzlast);
  });
}
