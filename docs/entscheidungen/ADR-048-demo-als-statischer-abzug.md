# ADR-048: Demo als statischer Abzug

## Kontext

Das öffentliche Repository soll eine Demo zum Ausprobieren verlinken. `npm run demo` zeigt
schon ein synthetisches Depot aus `test/e2e/seed.ts` mit festem `heute`. Läuft das als
öffentlicher Server, wären zwei Invarianten zu brechen: INV-07 (nur `127.0.0.1`) und die
Host-Prüfung in `server/sicherheit.ts`. Ein Container auf Cloudflare kostet außerdem 5 $ im
Monat und hat einen Kaltstart.

## Entscheidung

**Die Demo ist ein statischer Abzug des Demo-Servers, ausgeliefert von einem Worker, der nur liest.**

- **Abzug:** `npm run demo:export` baut die Oberfläche und holt jede Antwort per
  `app.inject()` aus `baueServer({ demoModus: true })`, ohne Port. Ziel ist `.demo-export/`
  (ignoriert). Die Seite trägt den Token-Platzhalter, „Aktualisieren“ und die Anmeldung
  bleiben gesperrt.
- **Endliche Antwortmenge:** Depot und `heute` stehen fest. `shared/demoAbzug.ts` listet jede
  Anfrage, die die Oberfläche stellen kann, und bildet sie auf einen Dateipfad ab. Ein Test
  prüft die Liste gegen die registrierten GET-Routen und lässt jede Anfrage vom echten Server
  beantworten.
- **Worker (`demo-worker/`):** Workers Static Assets mit `run_worker_first`. Nur GET und HEAD,
  sonst 405. `/api/*` geht über `abzugPfad`; was nicht im Abzug liegt, wird 404, ohne dass
  ein Asset gelesen wird. Jede Antwort trägt `KOPFZEILEN` aus `server/kopfzeilen.ts`, also
  dieselbe CSP wie lokal. Dafür kommen die Kopfzeilen ohne Node-Import aus einer eigenen Datei.
- **Daten:** ausschließlich synthetisch. Kein echtes Depot gelangt in den Abzug, denn der
  Export öffnet nie das Datenverzeichnis.
- **INV-11:** gilt auch für die Demo. Cloudflare Web Analytics bleibt aus.
- **Deploy:** von Hand mit `npx wrangler@<fest> deploy`. Im Repository liegt dafür kein
  Secret, und `wrangler` ist keine Abhängigkeit.

## Verworfene Alternativen

- **Server im Container:** Er braucht eine Ausnahme von INV-07, eine konfigurierbare
  Host-Allowlist und stillgelegte mutierende Routen. Er kostet laufend Geld. Er bleibt der
  Rückfall, falls die Demo je rechnen oder schreiben muss.
- **`_headers`-Datei statt Worker für die Kopfzeilen:** Sie gilt nicht für die Antworten,
  die der Worker selbst baut (405, 404). Die Kopfzeilen stünden damit an zwei Stellen.
- **Abzug über einen lauschenden Server und `fetch`:** Das bringt nichts gegenüber `inject`
  und öffnet einen Port.

## Folgen

- Eine neue lesende Route oder ein neuer Parameterwert braucht einen Eintrag in
  `shared/demoAbzug.ts`. Sonst wird `test/start/demoAbzug.test.ts` rot.
- INV-07 und INV-08 bleiben unverändert. Öffentlich läuft nur Code, der aus Dateien liest.
- Die Demo zeigt den Stand des letzten Exports. Neu exportiert und deployt wird bei Bedarf,
  etwa mit einem Release.
