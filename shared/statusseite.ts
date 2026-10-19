/**
 * Hülle der zwei Seiten, die außerhalb des Vite-Baus entstehen: die Hinweisseite ohne Bau
 * (`server/server.ts`) und die Seite nach der MCP-Anmeldung (`ingest/mcpAnmeldung.ts`).
 * Farbfeld, Glas und Lichtkante sind von Hand aus `src/styles/theme.css` übernommen
 * (ADR-029) — Tailwind läuft hier nicht. Ändert sich dort ein Token, gehört er hier nach.
 *
 * Alle Teile sind feste Texte aus dem Code, kein Fremdtext — daher keine INV-06-Frage.
 */

import { geistFontBase64Wert } from './geistFont.ts';

export type Statusseite = {
  readonly titel: string;
  /** Inline-SVG, 1em-unabhängig; bekommt die Farbe über `currentColor`. */
  readonly symbol: string;
  readonly ton: 'akzent' | 'gewinn';
  readonly ueberschrift: string;
  /** HTML — nur feste Texte. */
  readonly text: string;
  /** Zusätzliches CSS, etwa eine Animation für das Symbol. */
  readonly stil?: string;
  /** HTML vor `</body>`, etwa ein Skript mit Nonce. Es findet den Inhalt unter `#statusseite`. */
  readonly fuss?: string;
  /** Unbestimmter Fortschrittsbalken unter dem Text: es passiert noch etwas, Dauer unbekannt. */
  readonly fortschritt?: string;
  /** Zweiter Absatz unter dem Fortschrittsbalken — nur feste Texte. */
  readonly nachsatz?: string;
};

export const HAKEN =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>';

const TOENE = {
  akzent: 'oklch(0.72 0.14 240)',
  gewinn: 'oklch(0.75 0.15 150)',
} as const;

export function statusseite(seite: Statusseite): string {
  const ton = TOENE[seite.ton];
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${seite.titel}</title>
<style>
  @font-face {
    font-family: 'Geist Variable';
    font-style: normal;
    font-weight: 100 900;
    font-display: swap;
    src: url(data:font/woff2;base64,${geistFontBase64Wert()}) format('woff2-variations');
  }
  :root {
    color-scheme: dark;
    --grund: oklch(0.14 0.012 260);
    --text: oklch(0.95 0.005 250);
    --text-leise: oklch(0.7 0.01 250);
    --ton: ${ton};
  }
  html {
    background: var(--grund);
  }
  html, body {
    margin: 0;
    min-height: 100%;
  }
  body {
    box-sizing: border-box;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    font-family: 'Geist Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    color: var(--text);
    -webkit-font-smoothing: antialiased;
    background:
      radial-gradient(55rem 38rem at 8% -8%, oklch(0.45 0.11 245 / 0.34), transparent 70%),
      radial-gradient(45rem 36rem at 96% 6%, oklch(0.45 0.08 200 / 0.2), transparent 70%),
      radial-gradient(60rem 42rem at 55% 108%, oklch(0.45 0.09 165 / 0.18), transparent 70%)
      fixed var(--grund);
  }
  main {
    position: relative;
    box-sizing: border-box;
    width: 100%;
    max-width: 36rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
    text-align: center;
    padding: 2.5rem 2rem;
    border: 1px solid transparent;
    border-radius: 0.75rem;
    background:
      linear-gradient(160deg, color-mix(in oklch, var(--ton) 5%, transparent), transparent 55%) padding-box,
      oklch(1 0 0 / 0.035) padding-box;
    box-shadow: 0 1px 1px oklch(0 0 0 / 0.1), 0 12px 32px -18px oklch(0 0 0 / 0.5);
  }
  #statusseite {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
  }
  main::before {
    content: '';
    position: absolute;
    inset: -1px;
    padding: 1px;
    border-radius: inherit;
    background: linear-gradient(180deg, oklch(1 0 0 / 0.2), oklch(1 0 0 / 0.095) 45%, oklch(1 0 0 / 0.11));
    mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    mask-composite: exclude;
    pointer-events: none;
  }
  .symbol {
    width: 3.5rem;
    height: 3.5rem;
    display: grid;
    place-items: center;
    border-radius: 9999px;
    color: var(--ton);
    background: color-mix(in oklch, var(--ton) 14%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--ton) 30%, transparent);
  }
  .symbol svg {
    width: 1.75rem;
    height: 1.75rem;
  }
  h1 {
    font-size: 1.5rem;
    font-weight: 600;
    line-height: 1.25;
    margin: 0;
  }
  p {
    font-size: 1rem;
    line-height: 1.5;
    color: var(--text-leise);
    margin: 0;
    text-wrap: balance;
  }
  .fortschritt {
    position: relative;
    width: 100%;
    max-width: 16rem;
    height: 0.25rem;
    overflow: hidden;
    border-radius: 9999px;
    background: color-mix(in oklch, var(--ton) 18%, transparent);
  }
  .fortschritt::after {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 40%;
    border-radius: inherit;
    background: var(--ton);
    animation: gleiten 1.4s ease-in-out infinite;
  }
  @keyframes gleiten {
    from { transform: translateX(-100%); }
    to { transform: translateX(250%); }
  }
  code {
    font-family: ui-monospace, monospace;
    font-size: 0.9375em;
    color: var(--text);
  }
  @media (prefers-reduced-motion: reduce) {
    * { animation: none !important; }
  }
${seite.stil ?? ''}
</style>
</head>
<body>
<main>
<div id="statusseite" role="status">
  <div class="symbol">${seite.symbol}</div>
  <h1>${seite.ueberschrift}</h1>
  <p>${seite.text}</p>
${seite.fortschritt === undefined ? '' : `  <div class="fortschritt" role="progressbar" aria-label="${seite.fortschritt}"></div>\n`}${seite.nachsatz === undefined ? '' : `  <p>${seite.nachsatz}</p>\n`}</div>
</main>
${seite.fuss ?? ''}
</body>
</html>`;
}
