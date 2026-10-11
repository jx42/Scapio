/** Gemeinsamer Port fuer den e2e-Server, geteilt zwischen `playwright.config.ts` und `server-start.ts`. */
export const E2E_PORT = 4790;
export const E2E_URSPRUNG = `http://127.0.0.1:${String(E2E_PORT)}`;
