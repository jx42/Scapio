/**
 * Der abgesicherte Abruf (Bauanleitung 6.5).
 *
 * Zwei Adressen aus `config.json` erreichen das Netz; alles andere hier ist Abwehr.
 * Die Tests laufen ohne Netz und ohne DNS: die Hosts sind IP-Literale, `fetch` ist
 * ersetzt. Ein Test, der wirklich zu iShares telefoniert, prueft die Leitung, nicht
 * den Code — und ist an dem Tag rot, an dem iShares umbaut.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { holeText, istPrivateAdresse, NetzFehler, pruefeAdresse } from '../../ingest/netz.ts';

const OEFFENTLICH = '93.184.216.34';

// Fuer den einen Test mit Hostnamen; ohne Stub fragte er den echten Resolver.
vi.mock('node:dns/promises', () => ({
  lookup: () => Promise.resolve([{ address: OEFFENTLICH, family: 4 }]),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('istPrivateAdresse', () => {
  it('erkennt die privaten und lokalen IPv4-Bereiche', () => {
    for (const a of [
      '127.0.0.1',
      '127.255.255.254',
      '10.0.0.1',
      '100.64.0.1', // 100.64/10 Carrier-Grade-NAT (RFC 6598)
      '100.100.0.1',
      '100.127.255.255',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '198.18.0.1', // 198.18/15 Benchmarking (RFC 2544)
      '198.19.255.255',
      '169.254.169.254', // der Metadatendienst — der eigentliche Grund fuer diese Liste
      '0.0.0.0',
      '224.0.0.1',
      '255.255.255.255',
    ]) {
      expect(istPrivateAdresse(a), a).toBe(true);
    }
  });

  it('laesst oeffentliche IPv4-Adressen durch', () => {
    for (const a of [
      OEFFENTLICH,
      '8.8.8.8',
      '100.63.255.255', // knapp unter dem CGNAT-Block
      '100.128.0.1', // knapp darueber
      '172.15.0.1',
      '172.32.0.1',
      '192.167.0.1',
      '198.17.255.255', // knapp unter dem Benchmarking-Block
      '198.20.0.1', // knapp darueber
      '1.1.1.1',
    ]) {
      expect(istPrivateAdresse(a), a).toBe(false);
    }
  });

  it('erkennt die privaten IPv6-Bereiche, auch IPv4-abgebildet oder eingebettet', () => {
    for (const a of [
      '::1',
      '::',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1%en0',
      'ff02::1',
      '::ffff:127.0.0.1',
      '64:ff9b::127.0.0.1', // NAT64 (RFC 6052), eingebettetes Loopback
      '64:ff9b::10.0.0.1', // NAT64, eingebettetes 10/8
      '2002::1', // 6to4 (RFC 3056) — pauschal abgelehnt, nicht dekodiert
      '2002:c000:0204::1',
    ]) {
      expect(istPrivateAdresse(a), a).toBe(true);
    }
    expect(istPrivateAdresse('2606:4700:4700::1111')).toBe(false);
    expect(istPrivateAdresse('::ffff:93.184.216.34')).toBe(false);
    // NAT64 mit eingebetteter oeffentlicher Adresse bleibt oeffentlich — dieselbe
    // Adresse wie OEFFENTLICH, nur durch das NAT64-Praefix hindurch dekodiert.
    expect(istPrivateAdresse(`64:ff9b::${OEFFENTLICH}`)).toBe(false);
  });

  it('lehnt ab, was gar keine Adresse ist', () => {
    // Konservativ: wer hier nichts erkennt, darf nicht "also oeffentlich" schliessen.
    for (const a of ['', 'localhost', '127.0.0.1.evil.tld', '999.1.1.1', '0x7f000001']) {
      expect(istPrivateAdresse(a), a).toBe(true);
    }
  });
});

describe('pruefeAdresse', () => {
  it('fragt nach gerissenem Zeitlimit keinen Resolver mehr', async () => {
    const fehler = await pruefeAdresse('https://www.ishares.com/', ['www.ishares.com'], AbortSignal.abort()).catch((f: unknown) => f);
    expect((fehler as Error).name).toBe('AbortError');
  });

  it('nimmt https auf einem erlaubten, oeffentlichen Host', async () => {
    const url = await pruefeAdresse(`https://${OEFFENTLICH}/daten.csv`, [OEFFENTLICH]);
    expect(url.pathname).toBe('/daten.csv');
  });

  it('lehnt http ab', async () => {
    await expect(pruefeAdresse(`http://${OEFFENTLICH}/x`, [OEFFENTLICH])).rejects.toMatchObject({
      code: 'E_NETZ_SCHEMA',
    });
  });

  it('lehnt file: und data: ab', async () => {
    for (const adresse of ['file:///etc/passwd', 'data:text/csv,a,b']) {
      await expect(pruefeAdresse(adresse, [OEFFENTLICH])).rejects.toBeInstanceOf(NetzFehler);
    }
  });

  it('lehnt Adressen mit Zugangsdaten ab', async () => {
    await expect(
      pruefeAdresse(`https://nutzer:geheim@${OEFFENTLICH}/x`, [OEFFENTLICH]),
    ).rejects.toMatchObject({ code: 'E_NETZ_ADRESSE' });
  });

  it('vergleicht den Host exakt — kein Suffix, kein Muster', async () => {
    // Der Klassiker: `endsWith('ishares.com')` haette hier `true` gesagt.
    for (const host of ['www.ishares.com.boese.tld', 'boese-www.ishares.com', 'ishares.com']) {
      await expect(pruefeAdresse(`https://${host}/x`, ['www.ishares.com'])).rejects.toMatchObject({
        code: 'E_NETZ_HOST',
      });
    }
  });

  it('vergleicht den Host ohne Ruecksicht auf Gross- und Kleinschreibung', async () => {
    const url = await pruefeAdresse('https://WWW.ISHARES.COM/x', ['www.ishares.com']);
    expect(url.hostname).toBe('www.ishares.com');
  });

  it('lehnt einen erlaubten Host ab, der auf eine private Adresse zeigt', async () => {
    // Der Host steht in der Allowlist — und ist trotzdem verboten, weil er im
    // eigenen Netz landet. Beide Pruefungen sind noetig, keine ersetzt die andere.
    await expect(pruefeAdresse('https://127.0.0.1/x', ['127.0.0.1'])).rejects.toMatchObject({
      code: 'E_NETZ_PRIVAT',
    });
    await expect(pruefeAdresse('https://[::1]/x', ['::1'])).rejects.toMatchObject({ code: 'E_NETZ_PRIVAT' });
  });

  it('lehnt eine kaputte Adresse ab', async () => {
    await expect(pruefeAdresse('keine url', [OEFFENTLICH])).rejects.toMatchObject({ code: 'E_NETZ_ADRESSE' });
  });
});

// ---------------------------------------------------------------------------

const OPTIONEN = { erlaubteHosts: [OEFFENTLICH, '127.0.0.1'], zeitlimitMs: 1000, groesstMb: 1 };

/** Ersetzt `fetch` durch eine Liste vorbereiteter Antworten, eine je Sprung. */
function fetchGibt(...antworten: readonly Response[]): { anrufe: URL[]; optionen: RequestInit[] } {
  const anrufe: URL[] = [];
  const optionenListe: RequestInit[] = [];
  let i = 0;
  vi.stubGlobal('fetch', (ziel: URL, optionen: RequestInit) => {
    anrufe.push(new URL(String(ziel)));
    optionenListe.push(optionen);
    expect(optionen.redirect).toBe('manual');
    const antwort = antworten[i];
    i += 1;
    if (antwort === undefined) throw new Error('mehr fetch-Aufrufe als vorbereitete Antworten');
    return Promise.resolve(antwort);
  });
  return { anrufe, optionen: optionenListe };
}

function umleitung(nach: string, status = 302): Response {
  return new Response(null, { status, headers: { location: nach } });
}

describe('holeText', () => {
  it('gibt den Koerper zurueck', async () => {
    fetchGibt(new Response('ISIN,Name\nIE00B4L5Y983,Welt\n'));
    await expect(holeText(`https://${OEFFENTLICH}/x.csv`, OPTIONEN)).resolves.toContain('IE00B4L5Y983');
  });

  it('folgt einer Umleitung auf einen erlaubten Host', async () => {
    const { anrufe } = fetchGibt(umleitung('/anders.csv'), new Response('spalte\n'));
    await expect(holeText(`https://${OEFFENTLICH}/x.csv`, OPTIONEN)).resolves.toBe('spalte\n');
    expect(anrufe.map((u) => u.pathname)).toEqual(['/x.csv', '/anders.csv']);
  });

  it('lehnt eine Umleitung auf 127.0.0.1 ab', async () => {
    // Der Angriff, gegen den `redirect: "manual"` ueberhaupt existiert: der erste
    // Abruf ist harmlos, das Ziel des zweiten steht in der fremden Antwort.
    fetchGibt(umleitung('https://127.0.0.1/geheim'));
    await expect(holeText(`https://${OEFFENTLICH}/x.csv`, OPTIONEN)).rejects.toMatchObject({
      code: 'E_NETZ_PRIVAT',
    });
  });

  it('lehnt eine Umleitung auf einen fremden Host ab', async () => {
    fetchGibt(umleitung('https://boese.tld/x'));
    await expect(holeText(`https://${OEFFENTLICH}/x.csv`, OPTIONEN)).rejects.toMatchObject({
      code: 'E_NETZ_HOST',
    });
  });

  it('lehnt eine Umleitung auf http ab', async () => {
    fetchGibt(umleitung(`http://${OEFFENTLICH}/x`));
    await expect(holeText(`https://${OEFFENTLICH}/x.csv`, OPTIONEN)).rejects.toMatchObject({
      code: 'E_NETZ_SCHEMA',
    });
  });

  it('bricht nach zwei Umleitungen ab', async () => {
    const { anrufe } = fetchGibt(umleitung('/a'), umleitung('/b'), umleitung('/c'));
    await expect(holeText(`https://${OEFFENTLICH}/x.csv`, OPTIONEN)).rejects.toMatchObject({
      code: 'E_NETZ_UMLEITUNG',
    });
    expect(anrufe).toHaveLength(3);
  });

  it('lehnt eine Umleitung ohne Location ab', async () => {
    fetchGibt(new Response(null, { status: 302 }));
    await expect(holeText(`https://${OEFFENTLICH}/x.csv`, OPTIONEN)).rejects.toMatchObject({
      code: 'E_NETZ_UMLEITUNG',
    });
  });

  it('meldet einen Fehlerstatus, ohne den Koerper zu nennen', async () => {
    fetchGibt(new Response('<html>Fehlerseite mit Kontostand 378055,37</html>', { status: 503 }));
    const fehler = await holeText(`https://${OEFFENTLICH}/x.csv`, OPTIONEN).catch((f: NetzFehler) => f);
    expect(fehler).toBeInstanceOf(NetzFehler);
    expect((fehler as NetzFehler).code).toBe('E_NETZ_STATUS');
    expect((fehler as NetzFehler).message).toBe('Status 503.');
    expect((fehler as NetzFehler).message).not.toContain('378055');
  });

  it('lehnt eine angekuendigte Ueberlaenge ab und gibt die Verbindung frei', async () => {
    // Beobachtbar ist hier `cancel`, nicht "es wurde nicht gelesen": ein
    // ReadableStream ruft `pull` von sich aus, sobald Platz im Puffer ist.
    // Der Beleg ist, dass der Koerper verworfen wird, statt in den Speicher zu wandern.
    let abgebrochen = false;
    const koerper = new ReadableStream<Uint8Array>({
      pull(steuerung) {
        steuerung.enqueue(new Uint8Array(16));
      },
      cancel() {
        abgebrochen = true;
      },
    });
    fetchGibt(new Response(koerper, { headers: { 'content-length': '99999999' } }));
    await expect(holeText(`https://${OEFFENTLICH}/x.csv`, { ...OPTIONEN, groesstMb: 1 })).rejects.toMatchObject({
      code: 'E_NETZ_GROESSE',
    });
    expect(abgebrochen).toBe(true);
  });

  it('bricht ab, sobald der Strom die Grenze reisst — auch ohne content-length', async () => {
    // `content-length` ist ein Hinweis der Gegenseite, kein Schutz. Der Schutz ist,
    // dass hier mitten im Lesen abgebrochen wird und nicht erst danach.
    let gesendet = 0;
    const koerper = new ReadableStream<Uint8Array>({
      pull(steuerung) {
        gesendet += 1;
        steuerung.enqueue(new Uint8Array(1000));
        if (gesendet > 100) steuerung.close();
      },
    });
    fetchGibt(new Response(koerper));
    await expect(
      holeText(`https://${OEFFENTLICH}/x.csv`, { ...OPTIONEN, groesstMb: 2 / 1024 }),
    ).rejects.toMatchObject({ code: 'E_NETZ_GROESSE' });
    // Bei 2 KiB Grenze und 1000 Bytes je Stueck: nach dem dritten Stueck ist Schluss.
    expect(gesendet).toBeLessThan(10);
  });

  it('meldet ein gerissenes Zeitlimit als E_NETZ_ZEIT', async () => {
    vi.stubGlobal('fetch', (_ziel: URL, optionen: RequestInit) => {
      return new Promise((_erfuellen, ablehnen) => {
        optionen.signal?.addEventListener('abort', () => {
          const fehler = new Error('abgebrochen');
          fehler.name = 'AbortError';
          ablehnen(fehler);
        });
      });
    });
    await expect(
      holeText(`https://${OEFFENTLICH}/x.csv`, { ...OPTIONEN, zeitlimitMs: 10 }),
    ).rejects.toMatchObject({ code: 'E_NETZ_ZEIT' });
  });

  it('nennt bei einem Verbindungsfehler nur den Typ', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('connect ECONNREFUSED 10.0.0.5:443')));
    const fehler = await holeText(`https://${OEFFENTLICH}/x.csv`, OPTIONEN).catch((f: NetzFehler) => f);
    expect((fehler as NetzFehler).code).toBe('E_NETZ');
    expect((fehler as NetzFehler).message).not.toContain('10.0.0.5');
  });

  it('sendet ohne json-Option ein GET ohne Rumpf', async () => {
    const { optionen } = fetchGibt(new Response('x'));
    await holeText(`https://${OEFFENTLICH}/x.csv`, OPTIONEN);
    expect(optionen[0]?.method).toBe('GET');
    expect(optionen[0]?.body).toBeUndefined();
  });

  it('sendet die json-Option als POST-Rumpf mit content-type application/json', async () => {
    const { optionen } = fetchGibt(new Response('{"ok":true}'));
    await holeText(`https://${OEFFENTLICH}/x`, { ...OPTIONEN, json: { a: 1, b: 'zwei' } });
    expect(optionen[0]?.method).toBe('POST');
    expect(optionen[0]?.body).toBe('{"a":1,"b":"zwei"}');
    expect((optionen[0]?.headers as Record<string, string>)['content-type']).toBe('application/json');
  });

  it('sendet denselben Rumpf erneut, wenn eine Umleitung dem POST folgt', async () => {
    const { anrufe, optionen } = fetchGibt(umleitung('/anders'), new Response('{"ok":true}'));
    await holeText(`https://${OEFFENTLICH}/x`, { ...OPTIONEN, json: { a: 1 } });
    expect(anrufe.map((u) => u.pathname)).toEqual(['/x', '/anders']);
    expect(optionen[0]?.method).toBe('POST');
    expect(optionen[1]?.method).toBe('POST');
    expect(optionen[1]?.body).toBe('{"a":1}');
  });

  it('prueft die Adresse, bevor irgendetwas abgerufen wird', async () => {
    const { anrufe } = fetchGibt();
    await expect(holeText('https://boese.tld/x', OPTIONEN)).rejects.toMatchObject({ code: 'E_NETZ_HOST' });
    expect(anrufe).toEqual([]);
  });
});
