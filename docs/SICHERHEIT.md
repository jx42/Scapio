# Sicherheit

## Bedrohungsmodell

Diese Anwendung läuft ausschließlich lokal, ohne Konto, ohne Cloud-Backend. Die Frage, die
das Modell beantwortet, ist nicht „wie schützt man einen Server im Internet", sondern:
**was bräuchte ein Angreifer, der weder das Passwort des Benutzers noch physischen Zugriff
auf den Rechner hat?** Zwei Angriffsklassen bleiben unter dieser Voraussetzung übrig:

1. **Eine fremde Webseite im selben Browser.** `127.0.0.1` ist keine Sicherheitsgrenze —
   jede Seite, die im Browser dieses Rechners offen ist, kann Anfragen an
   `http://127.0.0.1:4732` schicken. Dagegen richten sich Origin-/Host-Prüfung, das
   Sitzungstoken und das Fehlen jedes CORS-Headers (`server/sicherheit.ts`).
2. **Fremder, nicht vertrauenswürdiger Text, der über die eigene Datenkette hereinkommt.**
   Verwendungszwecke, Wertpapiernamen und Holdings-Felder stammen von der Bank, von den Fondsanbietern,
   letztlich von jedem, der eine Überweisung an das Depot schickt. Dagegen richten sich
   INV-06 (Fremdtext nie als HTML, nie in `href`) und der Umstand, dass der Ingest fremden
   Text nie durch ein Modell interpretieren lässt — seit [ADR-010](entscheidungen/ADR-010-direkte-mcp-anmeldung-ohne-claude-code.md)
   gibt es keines mehr im Datenpfad, nur noch JSON-RPC-Struktur, die zod prüft [INV-12].

> **Was diese Anwendung nicht leistet:** Gegen Schadsoftware, die bereits unter dem
> eigenen Benutzerkonto läuft, hilft nichts hier — die liest die Datenbank so oder so.
> Das ist keine Lücke dieser Anwendung, sondern die Grenze jeder lokalen Anwendung.

## Befundtabelle

Jeder Befund aus der ursprünglichen Sicherheitsprüfung, mit dem Test, der ihn offen hält.

| Befund | Schwere | Gegenmaßnahme | Test |
|---|---|---|---|
| Parallele Läufer hinter `/api/refresh` | mittel | Sperre gegen Doppelläufe; seit [ADR-010](entscheidungen/ADR-010-direkte-mcp-anmeldung-ohne-claude-code.md) ruft der Ingest selbst keinen Kindprozess mehr auf — `execFile` erscheint im Datenpfad nirgends, nur noch beim Öffnen des Browsers für die Anmeldung, nie in `/api/refresh` | `test/api/sicherheit.test.ts` („Sperre gegen doppelten Lauf“) |
| `POST /api/mcp-anmeldung` kann den Browser öffnen — der Server löst damit etwas außerhalb seines Prozesses aus [ADR-012] | niedrig | Die geöffnete Adresse ist die fest im Code stehende Autorisierungsadresse unter `https://mcp.scalable.capital`, aus keiner Eingabe zusammengesetzt; die Route nimmt weder Rumpf noch Query entgegen (`400 E_RUMPF` vor dem Handler) und verlangt Token und Origin/Host wie `/api/refresh`; ein zweiter Versuch bekommt `409`. Wer Token und Herkunftsprüfung überwände, bekäme ein Browserfenster, aber keine Anmeldung — die verlangt die Zugangsdaten bei Scalable Capital | `test/api/mcpAnmeldung.test.ts`, `test/invarianten/inv-08.test.ts` |
| Der Zustand der Anmeldung könnte die Meldung der Gegenstelle nach außen tragen | niedrig | `GET /api/mcp-anmeldung` liefert nur den eigenen Code (`E_MCP_ANMELDUNG`, sonst `E_UNBEKANNT`) und einen festen eigenen Satz; „angemeldet" ist ein `existsSync` auf die Tokendatei, der Tokenwert wird nie gelesen | `test/api/mcpAnmeldung.test.ts` („nie die fremde Meldung“) |
| Localhost ist keine Sicherheitsgrenze | mittel | Origin-/Host-Allowlist auf **jeder** Route, nicht nur `/api/refresh`; `Origin: null` wird abgelehnt | `test/api/sicherheit.test.ts` (§9) |
| `~/Documents` wird ggf. in iCloud gespiegelt, `%APPDATA%` ggf. über das Netz | mittel | Datenbank liegt unter `~/Library/Application Support/scapio/` bzw. `%LOCALAPPDATA%\scapio\` — außerhalb von `~/Documents`, außerhalb des Roaming-Profils und außerhalb von Git | `test/plattform.test.ts` (prüft, dass die Windows-Vorgabe `LOCALAPPDATA` nimmt und nicht `APPDATA`), `docs/RUNBOOK.md` „Schema geändert“, `shared/konfiguration.ts` Vorgabe |
| Holdings-Abruf bei den Fondsanbietern: unbegrenzte Adresse, Größe, Inhalt | mittel | nur `https`, Host-Allowlist, Zeitlimit, Größenlimit, echter CSV-Parser bzw. zod-geprüftes JSON | `test/ingest/netz.test.ts` |
| Native Abhängigkeit für SQLite (Lieferkette, Compiler) | niedrig | `node:sqlite` statt `better-sqlite3` — keine native Abhängigkeit, `npm ci --ignore-scripts` funktioniert | siehe [ADR-002](entscheidungen/ADR-002-node-sqlite-statt-better-sqlite3.md) |
| Der Klick hat keinen Herkunftsnachweis (jedes lokale Programm kann Header fälschen) | mittel | Sitzungstoken in der ausgelieferten `index.html`, verlangt als `X-Portfolio-Token`; kein Cookie, keine Persistenz | `test/api/sicherheit.test.ts` (Token-Tests) |
| Weiterleitung auf private Adressen (`127.0.0.1`, `169.254.169.254`, `::1`) | mittel | `redirect: 'manual'`, max. zwei Sprünge, jedes Ziel erneut gegen Allowlist und private IP-Bereiche geprüft | `test/ingest/netz.test.ts` (`istPrivateAdresse`, `holeText`) |
| Die Datenbank hat keine Sicherung | mittel | Sicherung über die SQLite-Backup-API vor jeder Migration, beim Start nach sieben Tagen ohne Sicherung [ADR-045] und per `npm run backup`; je Anlass bleiben die letzten fünf liegen, zusammen also bis zu fünfzehn | `test/db/verbindung.test.ts`, `test/db/migration.test.ts` |
| Refresh-Token (`offline_access`, nicht ablaufend) liegt dauerhaft auf der Platte | mittel | `0700`/`0600` unter `<datenverzeichnis>/mcp/`, außerhalb `~/Documents`/iCloud (wie die Datenbank) und außerhalb der Sicherung (`npm run backup` kopiert gezielt nur die SQLite-Datei, nie ein Verzeichnis); Rechte werden bei jedem Lesen erneut durchgesetzt, nicht nur beim Schreiben (unter Windows wirkungslos, siehe Restrisiko 2); Tokenwert erscheint nie in einer geworfenen Fehlermeldung oder Konsolenausgabe | `test/ingest/mcpAnmeldung.test.ts` (0600-Prüfung auf `client.json`/`token.json`, Abschnitt „Geheimnisschutz“ gegen Konsole/Fehlermeldung) |
| Kein zweiter, prozessunabhängiger Schutz gegen schreibende Tool-Aufrufe mehr, seit der Claude-Code-Kindprozess mit `--allowedTools` wegfällt [ADR-010] | mittel | Laufzeitprüfung `LESENDE_TOOLS.includes(tool)` unmittelbar vor jedem `tools/call`, als allererste Anweisung in `mcpAufrufRoh`, zusätzlich zum Typsystem | `test/invarianten/inv-01.test.ts` |
| Automatisch befolgte Umleitung könnte den `Authorization`-Kopf an einen fremden Host schicken | niedrig | `redirect: 'manual'` bei allen `fetch`-Aufrufen gegen `/token`, `/authorize` und `/mcp` — dieselbe Haltung, die `ingest/netz.ts` für CSV/VPI schon durchsetzt | `test/ingest/mcpAnmeldung.test.ts` (3xx bei `/register` und beim stillen Refresh), `test/ingest/mcp.test.ts` (3xx bei `/mcp`) |
| ISIN-Link zu onvista und feste Footer-Links zu EZB/Eurostat/Scalable Capital/Repository verlassen INV-06/INV-11 wörtlich [ADR-021, ADR-022, ADR-028, ADR-046] | niedrig | `onvistaLink()` prüft das geschlossene ISIN-Muster ein zweites Mal lokal, bevor ein `href` entsteht; alle sechs Ziele als geschlossene Liste, `target="_blank"` mit `rel="noopener noreferrer"` gegen Reverse-Tabnabbing und Referrer-Leck; kein automatischer Netzverkehr, nur ein bewusster Klick | `test/ui/AufteilungKachel.test.tsx` („Link zu onvista … Cash nicht“), `test/invarianten/inv-11.test.ts` (`ERLAUBTE_AUSGEHENDE_LINKS`) |

## Kopfzeilen und Herkunftsprüfung im Detail

Ein einziges `onRequest`-Plugin (`server/sicherheit.ts`) setzt auf **jeder** Antwort sieben
Kopfzeilen, bevor irgendeine Prüfung greift — auch auf einer `403`-Antwort:

```
Content-Security-Policy: default-src 'self'; script-src 'self';
  style-src 'self' 'sha256-47DEQ…' 'sha256-StEaX…'; style-src-attr 'unsafe-inline'; img-src 'self' data:; font-src 'self';
  connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none';
  form-action 'none'
X-Content-Type-Options: nosniff
Cross-Origin-Resource-Policy: same-origin
Cross-Origin-Opener-Policy: same-origin
Referrer-Policy: no-referrer
Permissions-Policy: geolocation=(), camera=(), microphone=()
Cache-Control: no-store
```

Zwei Lockerungen, beide bewusst: `style-src-attr 'unsafe-inline'`, weil Recharts
`style`-Attribute direkt auf seine SVG-Knoten setzt, und zwei `sha256`-Hashes in `style-src`
für die beiden `<style>`-Blöcke, die sonner zur Laufzeit einfügt (Neuberechnung im Kopf von
`CSP` in `server/kopfzeilen.ts`). `script-src` bleibt unangetastet. `Cache-Control: no-store` steht dort, weil der Sitzungsschlüssel in
der ausgelieferten `index.html` steckt — nichts davon darf im Cache landen.

**Die Hinweisseite** (`server/server.ts`, `hinweisseiteCsp`), die erscheint, solange kein
gebautes `dist/` da ist, bekommt eine abgeleitete CSP: `script-src 'nonce-…'` mit frischem
Nonce je Antwort für ihr eines Neulade-Skript, `style-src 'unsafe-inline'` für ihr eigenes
`<style>`, `font-src data:` für die eingebettete Schrift. Die Seite trägt keinen Fremdtext und
keinen Sitzungsschlüssel.

**Statische Auslieferung.** `@fastify/static` liefert nur `dist/assets/` unter `/assets/` aus,
Punktdateien ignoriert (`dotfiles: 'ignore'`). `index.html` kommt ausschließlich über die
eigene Seiten-Route — früher lag `dist/` ganz unter `/`, und `/INDEX.HTML` umging die Route auf
einem Dateisystem ohne Groß-/Kleinschreibung. Ein abgelehnter Pfad (Traversal, `%5c`, doppelter
Schrägstrich) ergibt `404 E_NICHT_GEFUNDEN`, nie `403` oder `500` (`server/fehler.ts`).
Geprüft in `test/api/sicherheit.test.ts` („Statische Auslieferung“).

**Die eine Ausnahme von `no-store`.** Eine lesende Anfrage auf eine inhaltsadressierte Datei
(`/assets/<name>-<8 Zeichen Hash>.<endung>`, so wie Vite sie schreibt) bekommt stattdessen:

```
Cache-Control: public, max-age=31536000, immutable
```

Das ist keine Abwägung, sondern eine Eigenschaft dieser Adressen: Der Hash steht für den
Inhalt — ändert sich eine Zeile, ändert sich der Dateiname, und die alte Adresse wird nie
wieder angefragt. Unter `/assets/` liegen ausschließlich gebaute Programmdateien; keine
Depotzahl, kein Sitzungsschlüssel. Der steckt in der `index.html`, und die wird über eine
eigene Route ausgeliefert und bleibt `no-store`. Die Entscheidung fällt in
`server/sicherheit.ts` (`istUnveraenderlich`) — an derselben Stelle wie alle anderen
Kopfzeilen, nicht in einer Route. Damit sie dort fallen *kann*, ist `@fastify/static` mit
`cacheControl: false` registriert: das Plugin setzt sonst beim Ausliefern von sich aus
`public, max-age=0` und überschreibt damit sowohl `no-store` als auch `immutable`. Genau das
prüft `test/api/sicherheit.test.ts` („Cache-Control“) gegen ein echtes, kleines `dist/`.

Die Origin-Prüfung gilt streng nur auf `/api/*`: entweder passt `Origin` exakt zu
`http://127.0.0.1:<port>` oder `http://localhost:<port>` (dieselben zwei Hosts wie unten), oder — fehlt der Kopf ganz, wie bei einer normalen
Same-Origin-Navigation oder einem `fetch` ohne Kopf — muss `Sec-Fetch-Site: same-origin`
belegen, dass die Anfrage tatsächlich aus der eigenen Seite kommt. `Sec-Fetch-*` setzt der
Browser selbst; Seitencode kann ihn nicht fälschen. Fehlen beide (curl, ein fremdes Skript),
oder steht `Origin: null`, ist die Antwort `403`. Für die Auslieferung der Seite selbst genügt
die `Host`-Prüfung (`127.0.0.1:<port>` oder `localhost:<port>`, wörtlich) — sonst käme die
Seite nie durch, denn bei einer Navigation sendet der Browser gar keinen `Origin`.

## Bewusst getragene Restrisiken

Drei Dinge sind geprüft, benannt und **nicht** behoben. Sie stehen hier, damit sie nicht
später als Fund auftauchen, den niemand kannte.

**1. Zwischen DNS-Auflösung und Verbindung liegt ein Spalt (`ingest/netz.ts`).**
`pruefeAdresse()` löst den Hostnamen auf und lehnt ab, sobald auch nur eine der zurückgegebenen
Adressen privat ist. Danach verbindet sich `fetch` — und löst dabei selbst noch einmal auf. Ein
DNS-Server, der beim zweiten Mal etwas anderes antwortet, könnte den Abruf also doch auf eine
interne Adresse lenken (klassisches Time-of-check/time-of-use, hier als ausgehendes
DNS-Rebinding). Getragen, nicht behoben. Die Allowlist nennt **fünf** Hosts —
`www.ishares.com`, `etf.dws.com`, `www.amundietf.de`, `ec.europa.eu`,
`data-api.ecb.europa.eu`. Drei Gründe tragen die Abwägung: Erstens sind alle fünf Hosts große, etablierte Institutionen mit stabiler
eigener Infrastruktur — BlackRock/iShares, DWS/Xtrackers, Amundi, die Europäische Kommission
und die EZB —, keine kurzlebigen Drittanbieter; der Angreifer müsste also bereits die
DNS-Antworten für eine dieser konkreten Domains kontrollieren, nicht für irgendeine aus einer
langen, wechselnden Liste. Zweitens ist der Abruf rein lesend, das Ergebnis geht durch zod
[INV-12], und was hinter einer internen Adresse liegt, erreicht der Angreifer damit nicht
*zurück*. Drittens wäre die Abhilfe, die geprüfte IP festzunageln und die Verbindung selbst
dorthin aufzubauen (eigener `lookup`, Host-Kopf und TLS-Servername von Hand gesetzt) —
deutlich mehr eigener Netzwerkcode als der, den die Prüfung schützt.

Die Vorgabe der Liste steht in `shared/hosts.ts` (`ANBIETER_HOSTS` je Fondsanbieter, dazu
`STATISTIK_HOSTS`); `shared/konfiguration.ts` leitet `erlaubteHosts` von dort ab, ein neuer Anbieter
trägt seinen Host dort ein. `config.json` kann die Liste nur einschränken — ein Host, der
nicht in `shared/hosts.ts` steht, lässt die Konfiguration scheitern (`test/hosts.test.ts`). **Wenn die
Liste weiter wächst, frei konfigurierbar wird, oder einer der fünf Hosts kein großes, stabiles
Institut mehr ist, kippt diese Abwägung**: dann gehört das Festnageln der geprüften Adresse
nachgezogen.

**2. `0700`/`0600` sind POSIX-Rechte und wirken unter Windows nicht.**
Datenverzeichnis, Datenbank samt `-wal`/`-shm`, Sicherungen (erst als leere `0600`-Datei angelegt, dann gefüllt und umbenannt), `lauf.log`, die OAuth-Token unter `<datenverzeichnis>/mcp/` und
die Sperrdatei werden mit `mode`/`chmodSync` geschützt. NTFS kennt dieses Modell nicht: Node
setzt dort über `mode` praktisch nur das Nur-Lesen-Attribut, keinen Schutz vor anderen
Benutzerkonten desselben Rechners. Seit es den Windows-Einstieg gibt (`Start.bat`), ist das
keine Feststellung mehr, sondern eine benannte Lücke: **Unter Windows schützt die Anwendung ihre
Daten und ihren Refresh-Token nicht selbst.** Was sie dort schützt, sind die geerbten Rechte von
`%LOCALAPPDATA%` — ein Ort, den Windows standardmäßig nur dem eigenen Benutzerkonto und
Administratoren öffnet. Auf einem Rechner mit einem Benutzer, dem Normalfall dieser Anwendung,
ist der Unterschied gering; auf einem geteilten Rechner mit mehreren lokalen Konten ist er real.

Bewusst **nicht** behoben: Echte Parität bräuchte ACL-Aufrufe über `icacls`, also einen neuen
Kindprozess mit eigener Angriffsfläche und eigenem Argument-Parsing — genau das, was
[ADR-010](entscheidungen/ADR-010-direkte-mcp-anmeldung-ohne-claude-code.md) beim `claude`-Binär
abgebaut hat, und für ein Programm, dessen Verteidigung darin besteht, wenig zu tun, ein
schlechter Tausch. Die Lücke wird benannt, nicht mit einem Kindprozess zugedeckt. Die Tests
sagen dasselbe: `test/dateirechte.ts` sichert die Bits auf POSIX zu und übergeht sie unter
Windows — mit der Begründung im Dateikopf, damit niemand sie später für vergessen hält.

**Wenn die Anwendung jemals auf einem geteilten Windows-Rechner laufen soll, kippt diese
Abwägung**: dann gehört entweder `icacls` nachgezogen oder der Windows-Einstieg zurückgezogen.

**3. Mit `top25` erfahren die Fondsanbieter, welche ETFs im Depot liegen.**
Ist die Kachel eingeschaltet ([ADR-038](entscheidungen/ADR-038-top25-nur-auf-wunsch.md)), fragt
der Ingest bei iShares, Xtrackers und Amundi die Bestandsliste je gehaltenem Fonds ab: die ISIN
steht im Pfad (`ingest/quellen/xtrackers.ts`), im Rumpf (`amundi.ts`, `productIds`) oder in der
Query (`ishares.ts`, `portfolioId`). Zusammen mit IP-Adresse und Abrufzeit ergibt das beim Anbieter
die Liste der gehaltenen ETFs dieses Anschlusses — keine Mengen, keine Beträge, kein Name. Die
Kataloge, Eurostat und die EZB werden ohne Depotbezug abgefragt und verraten nichts.

Getragen, weil ohne diese Abrufe die Kachel nicht entsteht und der Schalter ab Werk aus ist:
wer ihn setzt, liest den Satz dazu in der Vorlage `docs/einstellungen.example.json` und in der
README. Bewusst **nicht** behoben durch Abruf aller Fonds eines Anbieters (Größenordnung
Tausende Abrufe je Lauf) oder einen Mittler (neue Gegenstelle). **Wenn ein Abruf jemals Mengen
oder Beträge tragen soll, kippt diese Abwägung.**

## Was schon vorausgesetzt gilt und weiter greift

- Nur lesende MCP-Tools, als Allowlist pro Aufruf — keine Wildcard, Laufzeitprüfung
  `LESENDE_TOOLS.includes(tool)` vor jedem Aufruf [INV-01].
- Bindung ausschließlich an `127.0.0.1`, nie `0.0.0.0` [INV-07].
- Keine externen Ressourcen im Frontend, strenge CSP mit `default-src 'self'` [INV-11].
- Keine Zugangsdaten in der Anwendung — der Ingest meldet sich selbst per OAuth/PKCE am
  Scalable-MCP an, Token liegen unter `<datenverzeichnis>/mcp/` mit denselben Dateirechten wie
  die Datenbank [ADR-010].
- Vorbereitete Statements für jeden Datenbankzugriff; Fehlermeldungen an den Browser
  enthalten weder Stacktrace noch SQL noch Dateipfad.
- Verzeichnis `0700`, Dateien `0600` im Datenverzeichnis — POSIX; unter Windows wirkungslos,
  siehe Restrisiko 2 oben.

## Prüfliste vor Übergabe

Technische Hälfte deckt `npm run check` ab, der Rest wird gelesen und von Hand geprüft:

- [ ] `npm run check` grün, `npm run test:tz` grün, Zweigabdeckung `core/` > 95 %
- [ ] alle zwölf Invarianten haben einen Test, und jeder ist grün
- [ ] jede Zeile der Befundtabelle oben hat einen Test, der sie offen hält
- [ ] frische Installation: `git clone` → `npm ci --ignore-scripts` → Doppelklick → Dashboard,
      einmal auf macOS (`Start.command`) und einmal auf Windows (`Start.bat`)
- [ ] Ingest zweimal hintereinander: identischer Inhalts-Hash, null neu berechnete Tage
- [ ] Ingest während des Laufs abgewürgt: Datenbank weiterhin gültig, Sperre wird übernommen
- [ ] Drift-Stufen einmal künstlich ausgelöst und in der Oberfläche gesehen
- [ ] Dashboard einmal vollständig mit der Tastatur bedient, ohne Maus
- [ ] Datenbank liegt außerhalb von `~/Documents` (Windows: außerhalb des Projektordners und
      nicht unter `%APPDATA%`), Rechte `0700`/`0600` auf POSIX, `sicherung/` gefüllt
- [ ] `npm run audit` ohne Fund der Stufe `high` oder höher (braucht Netz, deshalb nicht in `check`)
- [ ] `docs/` vollständig, ADRs geschrieben, `README.md` von einem Menschen gelesen
