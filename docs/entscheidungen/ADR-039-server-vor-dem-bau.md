# ADR-039: Server vor dem Bau, Browser sofort, Fortschritt auf der Anmeldeseite

## Kontext

Beim ersten Start meldet sich `Start` am MCP an. Die Seite „Anmeldung abgeschlossen“
auf Port 8732 sagte „Dieses Fenster kann geschlossen werden.“ Danach baute `npm start` die
Oberfläche, holte einmalig die Daten und öffnete erst dann den Browser. Das dauerte oft über
eine Minute. In dieser Zeit stand der Nutzer vor einer fertigen Seite, ohne Hinweis, dass
noch etwas kommt. Das Terminal lag im Hintergrund.

## Entscheidung

- **Der Server startet vor dem Bau.** Solange `dist/index.html` fehlt, zeigt er die
  vorhandene Seite „Scapio wird gebaut…“, die sich alle drei Sekunden neu lädt. Die Route für
  `assets/` wird immer registriert, auch ohne `dist/`. Ein veraltetes `dist/` wird vor dem
  Serverstart gelöscht, damit nie die alte Oberfläche gegen die neue API läuft.
- **Gebaut wird nach `.start/bau`, dann umbenannt nach `dist/`.** Vite schreibt seine Dateien
  in keiner festen Reihenfolge. Ein laufender Server sähe sonst eine `index.html`, deren
  Assets noch fehlen.
- **Der Browser öffnet sich direkt nach dem Serverstart.** Bau und erster Ingest laufen
  danach nebeneinander. Scheitert der Bau, endet der Prozess mit Fehler, damit das
  Startfenster ihn stehen lässt.
- **Die Oberfläche übernimmt einen Lauf, der beim Laden schon unterwegs ist.** Sie zeigt den
  Knopf mit Spinner und lädt alle Daten nach dessen Ende neu, wie nach einem Klick.
- **Läuft der erste Lauf, sagt die Bau-Seite das statt „Scapio wird gebaut…“.** Sie zeigt
  „Anmeldung abgeschlossen“, dass die Daten abgerufen werden, und den Schritt aus
  `lauf.schritt`. Der Lauf dauert länger als der Bau; sonst stünde minutenlang „wird gebaut“
  da, ohne dass erkennbar ist, was passiert.
- **Die Anmeldeseite zeigt einen unbestimmten Fortschrittsbalken** und „Scapio startet jetzt
  und öffnet sich gleich in einem neuen Tab“, nur wenn `mcp-login --nur-wenn-noetig` sie
  zeigt, also wenn das Dashboard gleich folgt, und nur ohne Fehler.

## Verworfene Alternativen

- **Ein Knopf „Zu Scapio“ auf der Anmeldeseite.** Er lädt zum Klicken ein, obwohl ohnehin
  gleich ein Tab kommt; danach sind zwei Tabs offen. Mit der alten Startreihenfolge führte er
  außerdem auf eine Fehlerseite, weil Port 4732 während des Baus nicht lauscht.
- **Die Anmeldeseite fragt per `fetch`, ob das Dashboard schon antwortet.** Der Server setzt
  `Cross-Origin-Resource-Policy: same-origin`, und CORS-Header kommen nicht hinzu
  (AGENTS.md).
- **Ein Wartebildschirm im Prozess der Anmeldung.** Dann gäbe es zwei Server mit zwei
  Seiten für denselben Start.

## Nachtrag: Nachfragen statt Neuladen

Die Hinweisseite lädt sich nicht mehr alle drei Sekunden neu. Ihr Skript fragt stattdessen `/`
ab und lädt erst, wenn dort die gebaute Oberfläche oder ein anderer Zustand steht; ein neuer
Schritt desselben Laufs ersetzt nur den Inhalt der Live-Region. Zoom, Leseposition und
Screenreader bleiben so stehen (WCAG 2.2.1).
