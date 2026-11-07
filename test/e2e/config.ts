/** Gemeinsamer Port fuer den e2e-Server, geteilt zwischen `playwright.config.ts` und `server-start.ts`. */
export const E2E_PORT = 4790;
export const E2E_URSPRUNG = `http://127.0.0.1:${String(E2E_PORT)}`;
/** Seite von `start/edgecases.ts`; der Port steht dort fest. */
export const EDGECASES_SEITE = 'http://127.0.0.1:4793/test/edgecases/index.html';
