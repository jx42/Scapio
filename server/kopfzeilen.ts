/**
 * Die Kopfzeilen jeder Antwort, ohne Node- und Fastify-Importe: Der Server setzt sie in
 * `sicherheit.ts`, der Worker der Demo (`demo-worker/`) aus derselben Quelle. [ADR-048]
 */

/**
 * `style-src-attr 'unsafe-inline'` ist ABSICHT: Recharts setzt `style`-Attribute auf
 * seine SVG-Knoten [P-06]. Die Lockerung gilt ausschliesslich fuer Attribute —
 * `style-src` selbst bleibt `'self'`, und `script-src` bleibt unangetastet.
 * Nicht entfernen, ohne die Charts zu pruefen. [server/CLAUDE.md]
 *
 * Die beiden `sha256-…` in `style-src`: `sonner` (Toast, `components/ui/sonner.tsx`)
 * legt sein Grundgeruest beim Import unbedingt per `<style>` an — unabhaengig davon,
 * ob `<Toaster>` je gerendert wird — und tut das in zwei Schritten: leeres `<style>`
 * einhaengen, danach den Text setzen. Beides sind eigene Pruefungen durch die CSP.
 * Der erste Hash ist `sha256('')`, dem leeren Zwischenzustand jeder so gebauten
 * `<style>`-Einspeisung; der zweite ist der exakte Inhalt von `sonner@2.0.8`s
 * mitgelieferter CSS-Zeichenkette. Ein `npm update sonner`, das den Inhalt aendert,
 * macht den zweiten Hash ungueltig — dann taucht dieselbe, harmlose Verstoss-Meldung
 * wieder auf (die Regeln greifen dann schlicht nicht, nichts bricht). Neu berechnen:
 * in den Devtools gegen die neu gebaute Seite `document.querySelector('style').textContent`
 * kopieren, dann `node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('base64'))" "<Inhalt>"`.
 * Kein `'unsafe-inline'` hierfuer: die Hashes lassen nur genau diese beiden bekannten
 * Inhalte durch, nichts sonst.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=' 'sha256-StEaX+se6YS7pqjzrzMIA0KaX9zF/8zAhvQXZAe5epY='",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join('; ');

export const KOPFZEILEN: ReadonlyArray<readonly [string, string]> = [
  ['Content-Security-Policy', CSP],
  ['X-Content-Type-Options', 'nosniff'],
  ['Cross-Origin-Resource-Policy', 'same-origin'],
  ['Cross-Origin-Opener-Policy', 'same-origin'],
  ['Referrer-Policy', 'no-referrer'],
  ['Permissions-Policy', 'geolocation=(), camera=(), microphone=()'],
  // Der Sitzungsschluessel steckt in der index.html — nichts davon darf im Cache landen.
  // Die einzige Ausnahme steht direkt darunter: inhaltsadressierte Dateien.
  ['Cache-Control', 'no-store'],
];

/**
 * Die eine bewusste Ausnahme von `no-store`.
 *
 * Vite schreibt Bundle, Stylesheet und Schriften als `name-<hash>.ext` nach
 * `dist/assets/`. Der Hash steht fuer den INHALT: aendert sich eine Zeile, aendert sich
 * der Dateiname, und die alte Adresse wird nie wieder angefragt. Genau dafuer ist
 * `immutable` gemacht — ohne diese Zeile laedt jeder Reload knapp 1 MB neu.
 *
 * Sicherheitlich unbedenklich, und das ist keine Abwaegung, sondern eine Eigenschaft:
 * unter `/assets/` liegen ausschliesslich gebaute Programmdateien. Keine Depotzahl,
 * kein Sitzungsschluessel — der steckt in der `index.html`, und die bleibt `no-store`.
 */
export const UNVERAENDERLICH = 'public, max-age=31536000, immutable';

/**
 * Nur `/assets/…-<8 Zeichen Hash>.<endung>`. Ein Suffixvergleich auf `/assets/` allein
 * genuegt nicht: eine Datei ohne Hash im Namen bekaeme ein Jahr Cache und liesse sich
 * nie mehr austauschen.
 */
const INHALTSADRESSIERT = /^\/assets\/[A-Za-z0-9._-]+-[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+$/;

export function istUnveraenderlich(url: string): boolean {
  return INHALTSADRESSIERT.test(url.split('?')[0] ?? '');
}
