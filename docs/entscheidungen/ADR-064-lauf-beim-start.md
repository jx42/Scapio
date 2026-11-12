# ADR-064: Ein Lauf beim Start, relative Angabe im Kopf

Nachtrag zu [ADR-013](ADR-013-update-nur-auf-knopfdruck.md) und
[ADR-039](ADR-039-server-vor-dem-bau.md).

## Kontext

`npm start` holte bisher nur bei leerer Datenbank. Danach brachte erst der Knopf „Aktualisieren“
neue Zahlen, und wer Scapio öffnete, sah zuerst den Stand vom letzten Mal. Der Kopf zeigte den
Zeitpunkt als `Stand 12.11.2026, 08:14`; wie alt das ist, musste man selbst ausrechnen.

## Entscheidung

- **Der Doppelklick auf `Start` ist der Anstoß.** `npm start` stößt einen Lauf an, wenn der letzte
  erfolgreiche mindestens **15 Minuten** zurückliegt (`STARTLAUF_ABSTAND_MS`). Es bleibt bei
  einem Lauf: kein Timer, kein Dienst, kein zweiter Lauf, solange der Server läuft. Die Grenze
  aus [ADR-013](ADR-013-update-nur-auf-knopfdruck.md), angestoßen statt von selbst, gilt also weiter.
- **Der Mindestabstand** fängt Neustarts ab: Fenster zu und wieder auf, zwei Klicks nach einem
  Absturz. Ohne ihn löste jeder Start einen vollen Lauf gegen den MCP aus.
- **`npm run dev` holt nur bei leerer Datenbank** (`--ohne-startlauf`). `node --watch` startet
  den Server bei jedem Speichern neu, sonst gäbe es einen Lauf pro gespeicherter Datei.
- **Der Lauf wird angelegt, bevor sich der Browser öffnet.** So sieht die Seite schon beim ersten
  Abruf von `/api/lauf` den laufenden Lauf und übernimmt ihn ([ADR-039](ADR-039-server-vor-dem-bau.md)).
- **Der Start wartet nicht auf den Lauf und scheitert nicht an ihm.** Offline oder bei
  abgelaufener Anmeldung zeigt die Seite die alten Zahlen, die Hinweise stehen in der Alert-Reihe.
  Eine Anmeldung öffnet sich nie von selbst.
- **Ein übernommener Lauf endet still.** Es gibt keinen Toast, den Erfolg zeigt die Kopfzeile
  („Gerade aktualisiert“), Warnungen und Fehler zeigt die Alert-Reihe. Nach einem Klick auf den
  Knopf bleibt der Toast.
- **Die Hinweisseite ohne Bau** sagt „Daten werden abgerufen“ nur beim ersten Lauf. Bei
  vorhandenen Daten wartet die Seite auf den Bau, nicht auf den Lauf.
- **Der Kopf zeigt den Abstand:** „Gerade aktualisiert“, „Vor 12 Minuten aktualisiert“, „Vor
  5 Stunden aktualisiert“, „Gestern aktualisiert“, „Vor 3 Tagen aktualisiert“, ab 7 Tagen
  „Aktualisiert am 05.11.2026“. Ab einem Tag werden Kalendertage in Europe/Berlin gezählt, keine
  24-Stunden-Blöcke: Freitag 18 Uhr ist am Montag um 9 Uhr „Vor 3 Tagen“. Die Angabe zählt
  minütlich weiter, aber nur, solange der Tab sichtbar ist. Der genaue Zeitpunkt steht in
  `<time dateTime>`.

## Verworfene Alternativen

- **Eine Library** (`@github/relative-time-element`, `date-fns`, `dayjs`, `timeago.js`).
  `Intl.RelativeTimeFormat` liefert die deutschen Formen ohne neue Abhängigkeit. Die Schwellen
  hätten wir ohnehin selbst festgelegt. Das Web-Component setzt zudem `title=` und versteckt den
  Text im Shadow DOM.
- **`numeric: 'auto'`.** Es sagt „vorgestern“ statt „vor 2 Tagen“.
- **Abschaltbar in `einstellungen.json`.** Erst, wenn jemand danach fragt.
- **Regelmäßig holen, solange das Fenster offen ist.** Das wäre ein Hintergrundprozess mit
  Startknopf, und zwischen zwei Läufen änderte sich doch eine Zahl.

## Folgen

- Jeder Start nach mehr als 15 Minuten ist eine Netzoperation gegen den MCP, lesend wie jeder
  Lauf [INV-01]. Es gibt keine neue Route [INV-08].
- Der erste Blick nach dem Start zeigt noch die alten Zahlen. Nach dem Lauf holt die Seite die
  neuen Zahlen, ohne Toast.
