# ADR-069: Plausible in der öffentlichen Demo

## Kontext

Die öffentliche Demo ([ADR-048](ADR-048-demo-als-statischer-abzug.md)) soll zeigen, ob und
woher Besucher kommen. ADR-048 hatte INV-11 ausdrücklich auf die Demo ausgedehnt. Der Grund für
INV-11 trifft dort aber nicht zu: Die Demo zeigt ein erfundenes Depot, ein Dritter erfährt also
nicht, wann jemand auf sein eigenes Depot schaut. Wer eine Seite öffentlich betreibt und misst,
braucht außerdem Impressum und Datenschutzerklärung.

## Entscheidung

**Nur die Demo misst, mit Plausible, und verlinkt Impressum und Datenschutz.**

- **Snippet nur im Abzug:** `npm run demo:export` (`start/demoExport.ts`, `mitStatistik`)
  schreibt das Snippet aus dem Plausible-Konto in die exportierte `index.html`. `src/`,
  `index.html` und `dist/` enthalten es nicht, und die lokale App lädt es nie.
- **Kein Inline-Skript:** Den Teil des Snippets, der die Warteschlange anlegt, schreibt der
  Export als `/statistik.js`. Es wird synchron vor dem asynchronen Plausible-Skript geladen.
  `script-src` braucht dadurch weder `'unsafe-inline'` noch einen Hash.
- **CSP nur im Worker:** `DEMO_KOPFZEILEN` in `server/kopfzeilen.ts` ergänzt `script-src` und
  `connect-src` um `https://plausible.io`, sonst nichts. Der Worker setzt diese Kopfzeilen, der
  lokale Server weiter `KOPFZEILEN`.
- **Fußzeile:** Nur im Demo-Modus (`istDemoModus()`) stehen dort „© Jahr, Jürgen Röhm“, „Impressum“
  (`https://www.jroehm.com/legal-notice/`) und „Datenschutz“
  (`https://www.jroehm.com/privacy-policy/`). Es gelten dieselben Bedingungen wie in ADR-021,
  ADR-022 und ADR-052. Das Jahr ist das des Release-Commits: `demo:export` setzt es als
  `<meta name="release-jahr">`, ohne das Tag entfällt der Vermerk.

## Verworfene Alternativen

- **npm-Paket von Plausible:** Es läge in `src/` und damit im Bundle der lokalen App, auch wenn
  es dort nie startet.
- **Zählung im Worker über die Events-API:** Das braucht kein Skript im Browser, liefert aber nur
  Seitenaufrufe. Bildschirmgröße, Herkunft und Bot-Filter von Plausible fehlen dann.
- **Plausible über den Worker weiterleiten:** Damit bliebe die CSP bei `'self'`. Der Worker
  müsste dafür aber `POST` annehmen, und bisher lehnt er jedes `POST` ab.

## Folgen

- INV-11 gilt weiter ohne Ausnahme für die lokale App. In der Demo lädt der Browser Code von
  `plausible.io`, das heißt einen fremden Ursprung mit Skriptrechten auf einer Seite, die nur
  synthetische Daten zeigt.
- Neun ausgehende Ziele statt sieben. Die zwei neuen stehen im Bundle, erscheinen aber nur in
  der Demo.
- `test/invarianten/inv-11.test.ts` prüft, dass sich die CSP der Demo nur in diesen zwei
  Richtlinien unterscheidet und dass das Snippet ohne Inline-Skript auskommt.
- Ändert Plausible das Snippet, sind `PLAUSIBLE_SKRIPT` und die Warteschlange in
  `start/demoExport.ts` nachzuziehen.
