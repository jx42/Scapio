// Nur Typen: ein Laufzeit-Import aus `vitest/config` zoege vitest in den Bau von `npm start`. [ADR-047]
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { ladeKonfiguration } from './shared/konfiguration.ts';
import { drittlizenzen } from './shared/drittlizenzen.ts';

/*
 * Ratsche der Testabdeckung je Ordner, in Prozent: knapp unter dem Ist vom 2026-11-06
 * (ein Punkt, bei `shared/` und `start/` zwei — dort stehen die Plattformzweige, und die CI
 * misst auf drei Systemen). Steigt das Ist, die Zahl nachziehen; gesenkt wird nur bewusst,
 * mit Grund in der Commit-Nachricht. `core/` hielt schon vorher 95 % je Kennzahl.
 */
export const ABDECKUNG = {
  core: { statements: 98, branches: 95, functions: 98, lines: 98 },
  db: { statements: 96, branches: 87, functions: 96, lines: 97 },
  ingest: { statements: 85, branches: 73, functions: 87, lines: 87 },
  server: { statements: 87, branches: 81, functions: 87, lines: 89 },
  shared: { statements: 87, branches: 83, functions: 89, lines: 88 },
  start: { statements: 46, branches: 49, functions: 60, lines: 46 },
  src: { statements: 83, branches: 71, functions: 81, lines: 86 },
} as const;

/*
 * Ein Chunk, bewusst ohne Code-Splitting: lokal ausgeliefert, alle Kacheln rendern sofort.
 * Die Grenze in kB (1 kB = 1000 Byte, wie Vite zaehlt) ersetzt Vites 500-kB-Warnung und ist
 * zugleich das Budget, gegen das `test/pruefschwellen.test.ts` den Bau prueft.
 */
export const BUNDLE_KB = 1200;

// INV-07: auch der Entwicklungsserver bindet ausschliesslich an 127.0.0.1.
// Der Port nur fuer `npm run dev`: Bau und vitest sollen keine `einstellungen.json` lesen.
export default defineConfig(({ command, mode }) => ({
  plugins: [react(), tailwindcss(), drittlizenzen(fileURLToPath(new URL('.', import.meta.url)))],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy:
      command === 'serve' && mode !== 'test'
        ? { '/api': { target: `http://127.0.0.1:${String(ladeKonfiguration().port)}`, changeOrigin: false } }
        : undefined,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // INV-11: keine externe Ressource, alles wird eingebettet ausgeliefert.
    assetsInlineLimit: 0,
    sourcemap: false,
    chunkSizeWarningLimit: BUNDLE_KB,
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    // Die Umgebung steht als `@vitest-environment`-Kommentar in der jeweiligen Datei.
    // `environmentMatchGlobs` waere kuerzer, ist aber seit Vitest 3.2 abgekuendigt.
    // Worktrees von Agenten unter .claude/ tragen eigene Kopien der Tests.
    exclude: ['**/node_modules/**', 'dist/**', 'test/e2e/**', '.claude/**'],

    /*
     * `node:sqlite` ist als experimentell markiert und meldet das bei jedem Import —
     * in jedem Worker erneut, rund zwanzig Zeilen pro Suite. Die Entscheidung fuer
     * `node:sqlite` steht in ADR-002 und wird nicht bei jedem Testlauf neu verhandelt;
     * ausgeschaltet wird nur diese eine Warnungsklasse, nicht alle.
     */
    execArgv: ['--disable-warning=ExperimentalWarning'],
    coverage: {
      provider: 'v8',
      include: [`{${Object.keys(ABDECKUNG).join(',')}}/**/*.{ts,tsx,mjs}`],
      exclude: ['**/*.d.ts'],
      // Nur Schwellen je Ordner: eine globale gaelte zusaetzlich fuer alle Dateien zusammen.
      thresholds: Object.fromEntries(Object.entries(ABDECKUNG).map(([ordner, s]) => [`${ordner}/**`, s])),
      // Je Datei: `npm run test:abdeckung -- --coverage.reporter=text`.
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: '.start/abdeckung',
    },
  },
}));
