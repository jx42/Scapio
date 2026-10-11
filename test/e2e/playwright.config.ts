import { defineConfig } from '@playwright/test';
import { E2E_URSPRUNG } from './config.ts';

/**
 * Ein einziger Ablauf (Bauanleitung §Test-Matrix: "Durchstich"): echter Chromium gegen
 * einen echten, gebauten Server, um zu pruefen, was jsdom nicht pruefen kann — dass die
 * echte CSP (insbesondere `style-src-attr 'unsafe-inline'` fuer Recharts) das echte
 * Chart-Rendering nicht bricht.
 */
export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: E2E_URSPRUNG,
  },
  webServer: {
    command: 'npm run build && node --experimental-strip-types test/e2e/server-start.ts',
    // Ohne Angabe liefe der Befehl im Ordner dieser Datei.
    cwd: '../..',
    url: E2E_URSPRUNG,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
