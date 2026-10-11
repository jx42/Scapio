/**
 * SHA-256, rein in TypeScript.
 *
 * Warum nicht `node:crypto`? Weil `core/` keinen `node:`-Import kennt [INV-04] — und
 * weil die Definition von `eingabe_hash` unter KERN_VERSION stehen muss: aendert sie
 * sich, muss die gesamte Historie neu gerechnet werden, und genau das sichert INV-10 ab.
 * Eine Implementierung hier drin ist versioniert, eine ausserhalb waere es nicht.
 *
 * Gehasht werden Mengen, Kurse und Cash-Bewegungen eines Tages — keine Geheimnisse.
 * Es geht um Wiedererkennung, nicht um Vertraulichkeit.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function drehe(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/** UTF-8-Bytes einer Zeichenkette, ohne `TextEncoder` — der ist Umgebung, nicht Sprache. */
function zuBytes(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let punkt = text.charCodeAt(i);

    if (punkt >= 0xd800 && punkt <= 0xdfff) {
      const niedrig = punkt <= 0xdbff && i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
      if (niedrig >= 0xdc00 && niedrig <= 0xdfff) {
        punkt = (punkt - 0xd800) * 0x400 + (niedrig - 0xdc00) + 0x10000;
        i += 1;
      } else {
        // Einzelne Ersatzzeichen-Haelfte: UTF-8 kennt sie nicht. Sie wird durch das
        // Ersetzungszeichen ersetzt — so wie es jede andere UTF-8-Kodierung tut.
        // Waere sie als drei Bytes durchgereicht (CESU-8), ergaebe derselbe Text hier
        // einen anderen Hash als anderswo, und zwar lautlos.
        punkt = 0xfffd;
      }
    }

    if (punkt < 0x80) {
      bytes.push(punkt);
    } else if (punkt < 0x800) {
      bytes.push(0xc0 | (punkt >> 6), 0x80 | (punkt & 0x3f));
    } else if (punkt < 0x10000) {
      bytes.push(0xe0 | (punkt >> 12), 0x80 | ((punkt >> 6) & 0x3f), 0x80 | (punkt & 0x3f));
    } else {
      bytes.push(
        0xf0 | (punkt >> 18),
        0x80 | ((punkt >> 12) & 0x3f),
        0x80 | ((punkt >> 6) & 0x3f),
        0x80 | (punkt & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}

/** SHA-256 als Hex-Zeichenkette in Kleinbuchstaben. */
export function sha256(text: string): string {
  const daten = zuBytes(text);
  const bitLaenge = daten.length * 8;

  // Auffuellen: 0x80, Nullen, dann 64 Bit Laenge.
  const gesamt = ((daten.length + 9 + 63) >> 6) << 6;
  const block = new Uint8Array(gesamt);
  block.set(daten);
  block[daten.length] = 0x80;

  // Laenge passt fuer alles, was hier gehasht wird, sicher in 53 Bit.
  const hoch = Math.floor(bitLaenge / 0x100000000);
  const tief = bitLaenge >>> 0;
  const ende = gesamt - 8;
  block[ende] = (hoch >>> 24) & 0xff;
  block[ende + 1] = (hoch >>> 16) & 0xff;
  block[ende + 2] = (hoch >>> 8) & 0xff;
  block[ende + 3] = hoch & 0xff;
  block[ende + 4] = (tief >>> 24) & 0xff;
  block[ende + 5] = (tief >>> 16) & 0xff;
  block[ende + 6] = (tief >>> 8) & 0xff;
  block[ende + 7] = tief & 0xff;

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let start = 0; start < gesamt; start += 64) {
    for (let i = 0; i < 16; i += 1) {
      const p = start + i * 4;
      w[i] = ((block[p]! << 24) | (block[p + 1]! << 16) | (block[p + 2]! << 8) | block[p + 3]!) >>> 0;
    }
    for (let i = 16; i < 64; i += 1) {
      const a = w[i - 15]!;
      const b = w[i - 2]!;
      const s0 = (drehe(a, 7) ^ drehe(a, 18) ^ (a >>> 3)) >>> 0;
      const s1 = (drehe(b, 17) ^ drehe(b, 19) ^ (b >>> 10)) >>> 0;
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, hh] = [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!];

    for (let i = 0; i < 64; i += 1) {
      const S1 = (drehe(e, 6) ^ drehe(e, 11) ^ drehe(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (hh + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = (drehe(a, 2) ^ drehe(a, 13) ^ drehe(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + maj) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }

    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }

  let hex = '';
  for (const wort of h) hex += wort.toString(16).padStart(8, '0');
  return hex;
}
