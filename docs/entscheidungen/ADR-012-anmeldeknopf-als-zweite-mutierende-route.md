# ADR-012: Der Anmeldeknopf als zweite mutierende Route

## Kontext

[ADR-010](ADR-010-direkte-mcp-anmeldung-ohne-claude-code.md) legte fest: „Einziger
interaktiver Einstieg ist `npm run mcp-login`." Der Nachtrag dort erlaubte zusätzlich, dass
`Start.command` denselben Einstieg beim allerersten Start auslöst, wenn noch keine
`token.json` existiert. Beides deckt den Erstkontakt ab — nicht den Normalfall danach.

Der Normalfall danach ist: die Anmeldung ist **weg**, obwohl sie einmal da war. Dafür gibt es
zwei Ursachen, die von außen gleich aussehen und beide nur durch eine neue Browser-Anmeldung
zu beheben sind:

- Der Refresh-Token wurde widerrufen oder abgelehnt — `zugriffstoken()` wirft
  `McpFehler('E_MCP_ANMELDUNG', …)`.
- Der MCP-Zugang ist im Scalable-Capital-Konto gar nicht (mehr) freigeschaltet — die
  Gegenstelle antwortet mit `401` oder `403`.

Der zweite Fall war bis hierher schlecht sichtbar. `jsonRpcAufruf` behandelte `401`/`403` wie
jeden anderen schlechten Status: ein nacktes `Error`, das über `codeVon()` als `E_UNBEKANNT`
in der Lauftabelle landete — ein Code, zu dem im Runbook nichts steht. Schlimmer noch: der
Aufruf lief in die Wiederholungsschleife von `mcpAufrufRoh` und danach in den Notbehelf aus
`.cache/`. Der Lauf meldete dann „Erfolg" auf Altdaten, während die Anmeldung in Wahrheit
fällig war.

Und selbst wenn der Code sauber ankam, endete die Oberfläche in einer Sackgasse. Sie zeigte
`Zuletzt gescheitert: Siehe docs/RUNBOOK.md zum Code.` — ein Satz, der voraussetzt, dass
jemand ein Terminal öffnet, das Projektverzeichnis findet und `npm run mcp-login` kennt.
Genau die Person, für die `Start.command` gebaut wurde, kann das nicht.

Der naheliegende Ausweg — ein Knopf in der Oberfläche — kollidiert frontal mit **INV-08**
(„Genau **eine** mutierende Route: `POST /api/refresh`, ohne Parameter") und mit
`server/CLAUDE.md` („Nie hinzufügen: eine zweite schreibende Route").

## Entscheidung

INV-08 wird umformuliert auf **genau zwei mutierende Routen, beide ohne Parameter**:
`POST /api/refresh` und `POST /api/mcp-anmeldung`. Die Liste ist abgeschlossen; eine dritte
braucht eine eigene ADR.

Warum die Invariante das aushält, ohne ihren Sinn zu verlieren: INV-08 schützt zwei Dinge —
dass keine Eingabe von außen einen Lauf steuern kann, und dass es keine schreibende Wirkung
Richtung Depot oder Datenbank über die API gibt. Beides bleibt.

- Die neue Route nimmt **keinerlei Eingabe** entgegen. `sicherheit.ts` weist Rumpf und
  Query-Parameter schon vor dem Handler mit `400 E_RUMPF` ab, Token und Origin/Host werden
  wie bei `/api/refresh` geprüft. Der Handler hat keine Parameter, die er auswerten könnte.
- Sie **schreibt nichts in die Datenbank**. Sie berührt genau eine Datei außerhalb davon:
  `<datenpfad>/mcp/token.json`, mit denselben Rechten wie bisher.
- Sie ruft **kein MCP-Tool** auf, weder lesend noch schreibend. INV-01 ist unberührt: die
  Route macht OAuth, nicht JSON-RPC.

Die Route arbeitet wie `/api/refresh`: `POST` startet und antwortet sofort mit `202`, weil
der Ablauf auf einen Menschen im Browser wartet und bis zu fünf Minuten offen bleiben kann.
Den Ausgang holt sich die Oberfläche per `GET` auf dieselbe Adresse, alle 1,5 s, so wie sie
den Lauf über `/api/lauf` verfolgt. Ein zweiter `POST`, während einer läuft, bekommt
`409 E_SPERRE` — zwei offene Anmeldungen hießen zwei Browserfenster und zwei Listener auf
demselben Port `8732`, der zweite scheiterte ohnehin. Anders als beim Lauf ist das keine
Datei-Sperre, sondern ein Flag an der Serverinstanz: es gibt nichts zu schützen, was einen
Neustart überdauert.

Das lesende `GET /api/mcp-anmeldung` beantwortet nur, **ob** eine Anmeldung existiert
(`existsSync` auf die Tokendatei — kein Netzwerkzugriff, kein Lesen des Tokens), ob gerade
eine läuft, und mit welchem **eigenen** Code die letzte gescheitert ist. Nie die Meldung der
Gegenstelle: wie bei `lauf.fehlerText` geht nur Code plus ein eigener Satz hinaus.

Drei kleinere Festlegungen fallen mit:

- **`E_MCP_ANMELDUNG` bei `401`/`403`.** `jsonRpcAufruf` klassifiziert diese beiden Status
  jetzt selbst, statt sie in den allgemeinen Statusfehler laufen zu lassen. Ein abgelehnter
  Zugriff ist kein transienter Fehler.
- **Kein Notbehelf nach einer abgelehnten Anmeldung.** `mcpAufrufRoh` reicht
  `E_MCP_ANMELDUNG` sofort durch, ohne Wiederholung und ohne `.cache/`-Rückfall. Sonst liefe
  der Ingest still auf Altdaten weiter, während die Oberfläche nie erführe, dass eine
  Anmeldung fällig ist — genau der Fall aus dem Kontext.
- **`mcpTokenPfad` steht in `shared/konfiguration.ts`.** Der Server muss wissen, ob eine Anmeldung
  existiert, ohne dafür die ganze Ingest-Kette samt zod zu laden. `ingest/mcpAnmeldung.ts`
  benutzt dieselbe Funktion, damit es nur einen Ort für den Dateinamen gibt. Das eigentliche
  Anmeldemodul lädt die Route erst im Handler per `await import`, wie `refresh.ts` es mit
  `ingest/lauf.ts` tut.

Bewusst **nicht** gewählt:

- **Die Anmeldung an `/api/refresh` anhängen** (Route öffnet den Browser, wenn der Token
  fehlt). Das hätte INV-08 numerisch gerettet und inhaltlich ausgehöhlt: ein Lauf, der
  ungefragt ein Browserfenster aufmacht, ist etwas anderes als ein Lauf. Der Nutzer soll
  entscheiden, wann er sich anmeldet.
- **Den `GET` als Auslöser benutzen** (Anmeldung startet beim Abfragen des Zustands). Hätte
  gar keine zweite mutierende Route gebraucht — und dafür eine lesende Route mit Nebenwirkung
  eingeführt, was schlechter ist als eine ehrliche zweite `POST`-Route.
- **Die Antwort offen halten**, bis die Anmeldung durch ist. Fünf Minuten hängende
  HTTP-Anfrage, an der jeder Proxy und jedes Zeitlimit scheitert; `202` plus Abfrage ist das
  Muster, das der Lauf schon benutzt.

## Folgen

- Eine abgelaufene oder nicht freigeschaltete Anmeldung ist jetzt aus der Oberfläche heraus
  zu beheben. Der Text nennt beide Ursachen und die Stelle im Scalable-Konto, weil von außen
  nicht zu unterscheiden ist, welche der beiden vorliegt.
- `GET /api/lauf` wird beim Laden der Seite einmal abgefragt statt erst nach einem Klick.
  Sonst wäre ein gescheiterter Lauf nach dem Neuladen unsichtbar — und mit ihm der Hinweis,
  dass eine Anmeldung fällig ist. Das Abfrageintervall bleibt an den laufenden Lauf gebunden.
- Der Server kann jetzt einen Browser öffnen (mittelbar, über `ingest/mcpAnmeldung.ts`).
  `docs/SICHERHEIT.md` hielt bis hierher fest, `execFile`/`open` komme nur in der manuellen
  `npm run mcp-login` vor; das ist korrigiert. Die Grenze bleibt eng: die Route öffnet
  ausschließlich die fest im Code stehende Autorisierungsadresse unter
  `https://mcp.scalable.capital`, aus keiner Eingabe zusammengesetzt.
- Ein Angreifer, der Token und Origin-Prüfung überwände, könnte ein Browserfenster öffnen —
  aber keine Anmeldung abschließen, weil dafür die Zugangsdaten bei Scalable Capital nötig
  sind, und keine Daten lesen. Das ist eine Belästigung, kein Datenabfluss, und setzt
  ohnehin voraus, dass der Angreifer bereits lokalen Zugriff auf `127.0.0.1` und das Token
  aus dem HTML hat.
- **Offen geblieben:** antwortet der MCP mit `200` und `isError: true` statt mit `401`/`403`,
  liefert `extrahiereInhalt` weiterhin `null`, und der Aufruf landet im Notbehelf. Die
  Fehlermeldung im `content[]`-Block ist Fremdtext, den `ingest/` nicht auswerten darf
  (`ingest/CLAUDE.md`), deshalb wird sie hier nicht auf Anmeldungsprobleme abgeklopft. Ob
  der Scalable-MCP diesen Weg überhaupt nimmt, ist unbekannt — solange es keinen belegten
  Fall gibt, bleibt das so.
