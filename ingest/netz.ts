/**
 * Der abgesicherte `fetch` fuer CSV und VPI (Bauanleitung 6.5). Dazu die zwei Bausteine, die auch
 * MCP und OAuth brauchen: `lesenMitGrenze`, `holeMitZeitlimit`.
 *
 * Zwei Adressen aus `config.json` erreichen das Netz. Beide sind fremd, beide koennen
 * umleiten, und eine Umleitung ist der uebliche Weg, aus einem harmlosen Abruf einen
 * Zugriff auf `127.0.0.1` oder auf Metadatendienste im privaten Netz zu machen. Deshalb:
 *
 *   - `redirect: 'manual'`, hoechstens zwei Spruenge, jeder einzeln geprueft
 *   - Schema muss `https` sein
 *   - Host muss EXAKT in `erlaubteHosts` stehen — Allowlist, kein Muster, kein Suffixvergleich
 *   - die aufgeloeste IP darf in keinem privaten Bereich liegen
 *   - die Antwort wird stroemend gelesen und bei Ueberschreiten der Groesse abgebrochen,
 *     nicht erst nach dem Puffern
 *   - Zeitlimit `csvZeitlimitMs`
 *
 * Kein I/O ausser diesem. Kein `core/`-Import ausser Typen. [INV-04 bleibt unberuehrt]
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { NetzFehlerCode } from '../shared/laufFehler.ts';

export class NetzFehler extends Error {
  readonly code: NetzFehlerCode;
  constructor(code: NetzFehlerCode, meldung: string) {
    super(meldung);
    this.name = 'NetzFehler';
    this.code = code;
  }
}

/**
 * Private, lokale und Link-Local-Bereiche. Ein Abruf, der hier landet, ist kein Abruf
 * von iShares oder Eurostat mehr, sondern ein Zugriff auf diesen Rechner oder sein Netz.
 */
export function istPrivateAdresse(adresse: string): boolean {
  const art = isIP(adresse);

  if (art === 4) {
    const teile = adresse.split('.').map((t) => Number(t));
    const [a, b] = teile;
    if (a === undefined || b === undefined || teile.length !== 4) return true;
    if (teile.some((t) => !Number.isInteger(t) || t < 0 || t > 255)) return true;
    if (a === 127) return true; // 127/8   Loopback
    if (a === 10) return true; // 10/8    privat
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 Carrier-Grade-NAT (RFC 6598)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true; // 192.168/16
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 Benchmarking (RFC 2544)
    if (a === 169 && b === 254) return true; // 169.254/16 Link-Local
    if (a === 0) return true; // 0/8     "dieses Netz"
    if (a >= 224) return true; // Multicast und reserviert
    return false;
  }

  if (art === 6) {
    const k = adresse.toLowerCase().split('%')[0] ?? '';
    if (k === '::1' || k === '::') return true;
    // IPv4-abgebildet: ::ffff:127.0.0.1
    const abgebildet = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(k);
    if (abgebildet?.[1] !== undefined) return istPrivateAdresse(abgebildet[1]);
    // NAT64 (RFC 6052): 64:ff9b::/96 bettet eine IPv4-Adresse in die unteren 32 Bit ein —
    // dieselbe Pruefung wie bei ::ffff:, nur mit dem anderen Praefix.
    const nat64 = /^64:ff9b::(\d{1,3}(?:\.\d{1,3}){3})$/.exec(k);
    if (nat64?.[1] !== undefined) return istPrivateAdresse(nat64[1]);
    const erstes = k.split(':')[0] ?? '';
    if (erstes.length === 0) return true;
    const wort = Number.parseInt(erstes, 16);
    if (!Number.isFinite(wort)) return true;
    // 6to4 (RFC 3056): 2002::/16 tunnelt zu einer eingebetteten IPv4-Adresse. Legacy und
    // ungenutzt hier — statt die Adresse zu dekodieren, pauschal den ganzen Block ablehnen.
    if (wort === 0x2002) return true;
    if ((wort & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((wort & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
    if ((wort & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    return false;
  }

  // Kein gueltiges Literal — konservativ ablehnen.
  return true;
}

// `lookup` kennt kein Signal; ein haengender Resolver hielte den Abruf sonst am Zeitlimit vorbei auf.
function mitAbbruch<T>(arbeit: () => Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return arbeit();
  if (signal.aborted) return Promise.reject(abbruchFehler());
  const versprechen = arbeit();
  return new Promise<T>((erfuellen, ablehnen) => {
    const beiAbbruch = (): void => ablehnen(abbruchFehler());
    signal.addEventListener('abort', beiAbbruch, { once: true });
    versprechen.then(erfuellen, ablehnen).finally(() => signal.removeEventListener('abort', beiAbbruch));
  });
}

function abbruchFehler(): Error {
  return new DOMException('Zeitlimit', 'AbortError');
}

/** Prueft eine einzelne Adresse: Schema, Host in der Allowlist, aufgeloeste IP oeffentlich. */
export async function pruefeAdresse(adresse: string, erlaubteHosts: readonly string[], signal?: AbortSignal): Promise<URL> {
  let url: URL;
  try {
    url = new URL(adresse);
  } catch {
    throw new NetzFehler('E_NETZ_ADRESSE', 'Adresse ist keine gueltige URL.');
  }

  if (url.protocol !== 'https:') {
    throw new NetzFehler('E_NETZ_SCHEMA', `Nur https ist erlaubt, nicht ${url.protocol.replace(':', '')}.`);
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new NetzFehler('E_NETZ_ADRESSE', 'Adressen mit Zugangsdaten sind nicht erlaubt.');
  }

  // Exakter Vergleich. Kein endsWith, kein Muster — sonst passt `www.ishares.com.boese.tld`.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!erlaubteHosts.some((h) => h.toLowerCase() === host)) {
    throw new NetzFehler('E_NETZ_HOST', `Host ${host} steht nicht in erlaubteHosts.`);
  }

  const adressen: string[] = [];
  if (isIP(host) !== 0) {
    adressen.push(host);
  } else {
    try {
      const treffer = await mitAbbruch(() => lookup(host, { all: true, verbatim: true }), signal);
      for (const t of treffer) adressen.push(t.address);
    } catch (fehler) {
      if ((fehler as Error).name === 'AbortError') throw fehler;
      throw new NetzFehler('E_NETZ_DNS', `Host ${host} ist nicht aufloesbar.`);
    }
  }

  if (adressen.length === 0) {
    throw new NetzFehler('E_NETZ_DNS', `Host ${host} loest auf keine Adresse auf.`);
  }
  // ALLE aufgeloesten Adressen muessen oeffentlich sein. Eine einzige private genuegt,
  // um den Abruf abzulehnen — welche der Adressen `fetch` waehlt, entscheiden wir nicht.
  for (const a of adressen) {
    if (istPrivateAdresse(a)) {
      throw new NetzFehler('E_NETZ_PRIVAT', `Host ${host} zeigt auf eine nicht oeffentliche Adresse.`);
    }
  }

  return url;
}

export type HolOptionen = {
  readonly erlaubteHosts: readonly string[];
  readonly zeitlimitMs: number;
  readonly groesstMb: number;
  /** `text/csv` oder `application/json` — landet im Accept-Kopf, sonst nichts. */
  readonly accept?: string;
  /** Gesetzt: POST mit diesem Rumpf als JSON (Amundi). Fehlt: GET wie bisher. */
  readonly json?: unknown;
};

const HOECHSTENS_SPRUENGE = 2;

/**
 * Holt eine Adresse als Text. Wirft `NetzFehler`, wenn irgendetwas nicht passt.
 * Der Inhalt der Antwort erscheint in keiner Fehlermeldung — nur Laenge und Status.
 */
export async function holeText(adresse: string, optionen: HolOptionen): Promise<string> {
  const grenze = optionen.groesstMb * 1024 * 1024;
  const abbruch = new AbortController();
  const wecker = setTimeout(() => abbruch.abort(), optionen.zeitlimitMs);

  // Bleibt ueber alle Umleitungsspruenge hinweg gleich — Methode und Rumpf aendern sich
  // nicht, nur die Adresse wird je Sprung neu geprueft.
  const koerper = optionen.json === undefined ? undefined : JSON.stringify(optionen.json);

  try {
    let aktuell = await pruefeAdresse(adresse, optionen.erlaubteHosts, abbruch.signal);

    for (let sprung = 0; sprung <= HOECHSTENS_SPRUENGE; sprung += 1) {
      const antwort = await fetch(aktuell, {
        method: koerper === undefined ? 'GET' : 'POST',
        redirect: 'manual',
        signal: abbruch.signal,
        body: koerper,
        headers: {
          accept: optionen.accept ?? 'text/csv,application/json;q=0.9,*/*;q=0.1',
          'accept-language': 'de,en;q=0.8',
          'user-agent': 'scapio/1 (lokal)',
          ...(koerper === undefined ? {} : { 'content-type': 'application/json' }),
        },
      });

      if (antwort.status >= 300 && antwort.status < 400) {
        if (sprung === HOECHSTENS_SPRUENGE) {
          throw new NetzFehler('E_NETZ_UMLEITUNG', `Mehr als ${HOECHSTENS_SPRUENGE} Umleitungen.`);
        }
        const ziel = antwort.headers.get('location');
        if (ziel === null || ziel.length === 0) {
          throw new NetzFehler('E_NETZ_UMLEITUNG', `Status ${antwort.status} ohne Location.`);
        }
        // Relative Umleitung an der aktuellen Adresse aufloesen, dann VOLL pruefen.
        const naechste = new URL(ziel, aktuell).toString();
        aktuell = await pruefeAdresse(naechste, optionen.erlaubteHosts, abbruch.signal);
        // Koerper der Umleitung verwerfen, damit die Verbindung freigegeben wird.
        await antwort.body?.cancel();
        continue;
      }

      if (!antwort.ok) {
        await antwort.body?.cancel();
        throw new NetzFehler('E_NETZ_STATUS', `Status ${antwort.status}.`);
      }

      // Angekuendigte Groesse frueh pruefen — spart den Abruf, ersetzt ihn aber nicht.
      const angekuendigt = antwort.headers.get('content-length');
      if (angekuendigt !== null) {
        const n = Number.parseInt(angekuendigt, 10);
        if (Number.isFinite(n) && n > grenze) {
          await antwort.body?.cancel();
          throw new NetzFehler('E_NETZ_GROESSE', `Antwort kuendigt ${n} Bytes an, erlaubt sind ${grenze}.`);
        }
      }

      return await lesenMitGrenze(antwort, grenze);
    }

    throw new NetzFehler('E_NETZ_UMLEITUNG', 'Umleitungen nicht aufgeloest.');
  } catch (fehler) {
    if (fehler instanceof NetzFehler) throw fehler;
    if ((fehler as Error).name === 'AbortError') {
      throw new NetzFehler('E_NETZ_ZEIT', `Zeitlimit von ${optionen.zeitlimitMs} ms ueberschritten.`);
    }
    throw new NetzFehler('E_NETZ', `Abruf gescheitert: ${(fehler as Error).name}`);
  } finally {
    clearTimeout(wecker);
  }
}

/**
 * Liest den Koerper stueckweise und bricht ab, SOBALD die Grenze ueberschritten ist —
 * nicht erst, nachdem alles im Speicher liegt. Das ist der eigentliche Schutz;
 * `content-length` ist nur ein Hinweis, den die Gegenseite auch weglassen kann.
 * Die eine Stelle fuer alle Abrufe (CSV, MCP, OAuth): eine Haertung gilt fuer alle.
 */
export async function lesenMitGrenze(antwort: Response, grenze: number): Promise<string> {
  const koerper = antwort.body;
  if (koerper === null) return '';

  const leser = koerper.getReader();
  const dekoder = new TextDecoder('utf-8');
  const stuecke: string[] = [];
  let gelesen = 0;

  try {
    for (;;) {
      const { done, value } = await leser.read();
      if (done) break;
      if (value === undefined) continue;
      gelesen += value.byteLength;
      if (gelesen > grenze) {
        throw new NetzFehler('E_NETZ_GROESSE', `Antwort zu gross (${gelesen} Bytes, erlaubt sind ${grenze}).`);
      }
      stuecke.push(dekoder.decode(value, { stream: true }));
    }
    stuecke.push(dekoder.decode());
    return stuecke.join('');
  } finally {
    // Bricht die Uebertragung ab, wenn wir vorzeitig aussteigen.
    await leser.cancel().catch(() => undefined);
  }
}

export type GeleseneAntwort = { readonly status: number; readonly ok: boolean; readonly text: string };

/**
 * `fetch` samt Lesen des Koerpers unter EINEM Zeitlimit — ein Wecker, der schon bei den
 * Kopfzeilen endet, liesse eine Gegenstelle den Koerper beliebig langsam traeufeln.
 */
export async function holeMitZeitlimit(url: string, optionen: RequestInit, zeitlimitMs: number, grenze: number): Promise<GeleseneAntwort> {
  const abbruch = new AbortController();
  const wecker = setTimeout(() => abbruch.abort(), zeitlimitMs);
  try {
    const antwort = await fetch(url, { ...optionen, signal: abbruch.signal });
    const text = await lesenMitGrenze(antwort, grenze);
    return { status: antwort.status, ok: antwort.ok, text };
  } finally {
    clearTimeout(wecker);
  }
}
