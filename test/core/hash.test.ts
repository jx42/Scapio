import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { sha256 } from '../../core/hash.ts';

/**
 * Der Kern darf `node:crypto` nicht importieren [INV-04] — der Test darf es.
 * Genau darum ist er hier: er haelt die eigene Implementierung gegen die des
 * Betriebssystems, statt ihr zu glauben.
 */
const referenz = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

describe('sha256', () => {
  it('trifft die bekannten Testvektoren', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('stimmt mit node:crypto ueberein — auch an den Blockgrenzen', () => {
    for (const laenge of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) {
      const text = 'x'.repeat(laenge);
      expect(sha256(text), `Laenge ${laenge}`).toBe(referenz(text));
    }
  });

  it('kodiert UTF-8 selbst, inklusive Umlauten und Emoji', () => {
    for (const text of ['Nestlé', 'Größe', '日本語', '😀', 'a😀b', 'äöüß']) {
      expect(sha256(text), text).toBe(referenz(text));
    }
  });

  it('behandelt eine einzelne Ersatzzeichen-Haelfte wie node:crypto', () => {
    const halb = '\ud83d';
    expect(sha256(halb + 'x')).toBe(referenz(halb + 'x'));
  });

  it('trifft die kanonische Form einer Depotzeile', () => {
    const zeile = '{"mengen":[["IE00B4L5Y983","100000000"]],"kurse":[["IE00B4L5Y983","98765432"]],"cash":"-98765"}';
    expect(sha256(zeile)).toBe(referenz(zeile));
    expect(sha256(zeile)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('aendert sich, wenn sich ein Zeichen aendert', () => {
    expect(sha256('a')).not.toBe(sha256('b'));
    expect(sha256('10.00')).not.toBe(sha256('10.0'));
  });
});

describe('sha256 an den Raendern der Kodierung', () => {
  it('ersetzt jede unpaarige Ersatzzeichen-Haelfte, wie node:crypto es tut', () => {
    for (const text of ['\ud83d', '\udc00', '\ud83dx', 'x\udc00', '\ud83d😀']) {
      expect(sha256(text), JSON.stringify(text)).toBe(referenz(text));
    }
  });
});
