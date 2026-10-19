// Nur Typen: ein Laufzeit-Import aus `vitest/config` zoege vitest in den Bau von `npm start`. [ADR-047]
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { ladeKonfiguration } from './shared/konfiguration.ts';

// INV-07: auch der Entwicklungsserver bindet ausschliesslich an 127.0.0.1.
// Der Port nur fuer `npm run dev`: Bau und vitest sollen keine `einstellungen.json` lesen.
export default defineConfig(({ command, mode }) => ({
  plugins: [react(), tailwindcss()],
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
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    // Die Umgebung steht als `@vitest-environment`-Kommentar in der jeweiligen Datei.
    // `environmentMatchGlobs` waere kuerzer, ist aber seit Vitest 3.2 abgekuendigt.
    // Worktrees von Agenten unter .claude/ tragen eigene Kopien der Tests.
    exclude: ['node_modules/**', 'dist/**', 'test/e2e/**', '.claude/**'],

    /*
     * `node:sqlite` ist als experimentell markiert und meldet das bei jedem Import —
     * in jedem Worker erneut, rund zwanzig Zeilen pro Suite. Die Entscheidung fuer
     * `node:sqlite` steht in ADR-002 und wird nicht bei jedem Testlauf neu verhandelt;
     * ausgeschaltet wird nur diese eine Warnungsklasse, nicht alle.
     */
    execArgv: ['--disable-warning=ExperimentalWarning'],
    coverage: {
      provider: 'v8',
      include: ['core/**/*.ts'],
      thresholds: { branches: 95, functions: 95, lines: 95, statements: 95 },
      reporter: ['text', 'json-summary'],
    },
  },
}));
