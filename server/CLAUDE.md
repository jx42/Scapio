# Server

Fastify auf 127.0.0.1, liefert API und gebaute Oberfläche aus demselben Prozess.

## Regeln
- Bindung ausschließlich `127.0.0.1`. Nie `0.0.0.0`, nie konfigurierbar. [INV-07]
- Genau ZWEI mutierende Routen: `POST /api/refresh` und `POST /api/mcp-anmeldung`, beide
  ohne Parameter, beide mit Token. Der Inventurtest hält das fest. [INV-08, ADR-012]
- Header und Origin/Host-Prüfung stehen im Plugin `sicherheit.ts`, die Header selbst in
  `kopfzeilen.ts`. Keine Route entscheidet selbst.
- `style-src-attr 'unsafe-inline'` in der CSP ist ABSICHT: Recharts setzt style-Attribute.
  Nicht entfernen, ohne die Charts zu prüfen. `script-src` bleibt unangetastet.
- Zwei `sha256-…` in `style-src` sind ebenfalls ABSICHT: `sonner` speist sein Grundgerüst
  per `<style>` ein, unabhängig davon ob `<Toaster>` gerendert wird. Begründung und
  Neuberechnung bei einem `sonner`-Update stehen bei `CSP` in `kopfzeilen.ts`.
- Fehler an den Browser: Code + ein Satz. Nie Stacktrace, nie SQL, nie Pfade.

## Nie hinzufügen
CORS-Header und eine dritte schreibende Route stehen schon in AGENTS.md, „Was hier nie
hinzukommt" — hier nur, was dort nicht steht:

- Parameter an `/api/refresh` oder `/api/mcp-anmeldung`
