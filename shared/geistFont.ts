/**
 * Geist als Base64 fuer eine `data:`-URL — fuer die Seiten, die ausserhalb des Vite-Baus
 * entstehen (Hinweisseite ohne Bau, MCP-Anmeldeseite): dieselbe Schriftdatei, die der Bau
 * nach `/assets/` legt (siehe `src/styles/theme.css`), hier direkt aus dem Paket gelesen —
 * keine fremde Adresse. [INV-11]
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

let geistFontBase64: string | undefined;

export function geistFontBase64Wert(): string {
  geistFontBase64 ??= readFileSync(
    createRequire(import.meta.url).resolve('@fontsource-variable/geist/files/geist-latin-wght-normal.woff2'),
  ).toString('base64');
  return geistFontBase64;
}
