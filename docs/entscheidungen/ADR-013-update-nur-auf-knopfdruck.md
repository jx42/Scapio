# ADR-013: Ein Update-Befehl, der nur auf Knopfdruck läuft

> **Teilweise abgelöst durch [ADR-037](ADR-037-eigene-dateien-im-datenverzeichnis.md).** `funds.json`
> liegt jetzt im Datenverzeichnis, eigene Werte aus `config.json` stehen in `einstellungen.json`
> daneben; ein ZIP-Update verliert beides nicht mehr.

## Kontext

Das Aktualisieren stand bis hierher als zwei Sätze in der README: neueste Version holen
(`git pull` oder neues ZIP) und erneut auf `Start.command` doppelklicken. Migrationen
und Abhängigkeiten erledigt der Start tatsächlich von selbst — der Rest des Weges hat fünf
Stellen, an denen er stillschweigend etwas anderes tut, als der Nutzer annimmt:

1. **Das alte Dashboard läuft noch.** Der Port wird absichtlich nicht gewechselt, also
   endet der Start mit „Port belegt" — nach dem Pull, also im halb aktualisierten Zustand.
2. **`config.json` ist eingecheckt**, und Runbook wie README laden dazu ein, dort Port und
   `driftSchwellen` anzupassen. Wer das getan hat, bekommt von `git pull` ein „local
   changes would be overwritten" und kommt ohne Git-Kenntnisse nicht weiter. Beim ZIP-Weg
   wird die Datei stattdessen still auf die Vorgabe zurückgesetzt.
3. **`dist/` bleibt stehen und sieht jünger aus als die neuen Quellen.** GitHub-ZIPs tragen
   als Dateizeit den Commit-Zeitpunkt, nicht den Download-Zeitpunkt; wer die alte Version
   später gebaut hat, als der neue Commit datiert ist, hat ein `dist/index.html`, das neuer
   ist als jede entpackte Quelle. `bauIstAktuell` meldet „aktuell", und der neue Server
   liefert die alte Oberfläche aus — der Fehler ist von außen nicht zu sehen.
4. **`ingest/funds.json` liegt in `.gitignore`** und damit in keinem ZIP. Wer wie üblich in
   einen neuen Ordner entpackt, hat danach eine leere Top-25-Kachel, ohne dass irgendwo
   steht, warum.
5. **Ein Sprung von `KERN_VERSION` rechnete nichts neu.** Die Neuberechnung sitzt in
   `ingest/neuberechnung.ts` und lief nur innerhalb eines Laufs; `npm start` stößt einen
   Lauf ausschließlich bei leerer Transaktionstabelle an. Nach einem Update am Rechenkern
   sah der Nutzer also weiter die alten Zahlen — bis er von sich aus „Aktualisieren"
   drückte, wovon er nichts wissen konnte.

Der Kopf von `Start.command` hält zugleich fest: „Bewusst NICHT hier: `npm audit`, ein
Selbst-Update, ein Hintergrunddienst." Diese Entscheidung steht weiter — die Frage ist, ob
sie auch einen ausdrücklich angestoßenen Update-Befehl ausschließt.

## Entscheidung

Es gibt einen Update-Befehl, und er läuft **nur, wenn jemand ihn auslöst**:
`npm run update` (`start/update.ts`), für den Nutzer ohne Terminal als Doppelklick über
`Aktualisieren.command` bzw. `Aktualisieren.bat` daneben. Alle Türen führen in dasselbe
Skript.

Die Grenze verläuft nicht zwischen „Update" und „kein Update", sondern zwischen
**angestoßen** und **von selbst**:

- Der Start aktualisiert weiterhin nichts. `Start.command` bleibt, was es ist.
- Es gibt **keine Versionsprüfung** gegen irgendeine Gegenstelle, weder beim Start noch
  sonst. Die Anwendung fragt niemanden, ob es sie neuer gibt.
- Das Skript **lädt keinen Code**. Das tut `git`, mit der Gegenstelle, die der Nutzer
  selbst geklont hat. Neu in der Vertrauenskette ist damit nur ein Programm, das der
  Nutzer ohnehin benutzt hat, um an diesen Ordner zu kommen.

Das Skript erledigt die fünf Punkte oben der Reihe nach: Port prüfen und abbrechen, bevor
etwas passiert; kein Git-Checkout → sagen, was beim ZIP zu tun ist, und aufhören; eigene
Änderungen an nachverfolgten Dateien wegstashen und danach zurückspielen; `git pull
--ff-only`; `dist/` löschen, wenn sich der Stand wirklich bewegt hat; an
`Start.command` bzw. `Start.bat` übergeben.

Punkt 5 gehört **nicht** in dieses Skript, sondern in `start/start.ts`: Ist die kleinste
`kern_version` in `depot_tag` kleiner als `KERN_VERSION`, rechnet der Start die Historie
neu, bevor der Server hört. Das liest nur die Datenbank — kein MCP-Aufruf, kein Netz
[INV-01] — und wirkt auf jedem Weg, auch auf dem, der an diesem Skript vorbeigeht.

Bewusst **nicht** gewählt:

- **Das Update in `Start.command` beim Start.** Dann zöge jeder Doppelklick ungefragt
  fremden Code auf den Rechner, und der Start wäre eine Netzoperation. Genau das schließt
  der Kopf dieser Datei aus, und zu Recht.
- **Eine Versionsprüfung beim Start** („es gibt eine neue Fassung"). Sie wäre eine
  regelmäßige Verbindung nach außen, die die Anwendung sonst nirgends braucht, und sie
  meldete den Rechner bei jedem Start bei einer Gegenstelle an. Eine Anwendung, die
  ausdrücklich nichts von sich erzählt, fängt damit nicht bei ihrer eigenen Versionsnummer
  an.
- **`config.json` ins Datenverzeichnis verschieben**, damit ein Pull nie mit
  Nutzeränderungen kollidiert. Dort steht `erlaubteHosts` — die Liste der Adressen, die
  der Ingest überhaupt abrufen darf. Sie gehört in die Versionskontrolle und ins Review,
  nicht in eine Kopie im Datenverzeichnis, die nach einem Update stillschweigend die alte
  Fassung behielte. Der Stash-Umweg ist der kleinere Preis.
- **Eine Versionsmarke statt `dist/` zu löschen** (`dist/.bau-stand` mit dem Commit-Hash,
  gegen den `bauIstAktuell` zusätzlich prüft). Mehr Mechanik für dasselbe Ergebnis, und
  für den ZIP-Weg hülfe sie ohnehin nur, wenn dort jemand das Skript benutzt — was er
  gerade nicht kann.
- **Das ZIP zum Update-Weg ausbauen** (Archiv herunterladen, entpacken, Dateien
  übernehmen). Das wäre ein Selbst-Updater mit allem, was daran hängt: Prüfsumme, Herkunft,
  Rechte, ein halb überschriebener Ordner bei Abbruch. Für die Erstinstallation bleibt das
  ZIP der einfachste Weg; für Updates empfiehlt die README ab hier den Klon. (Seit
  [ADR-035](ADR-035-zip-als-standardweg-der-installation.md) ist das ZIP der Standardweg und der
  Klon die Alternative.) Seit [ADR-037](ADR-037-eigene-dateien-im-datenverzeichnis.md)
  liegen `funds.json` und die eigenen Einstellungen im Datenverzeichnis, und
  `Aktualisieren.*` öffnet beim ZIP den Download-Link — das Skript lädt weiterhin nichts selbst.

## Folgen

- Im Projektordner liegt eine zweite Launcher-Datei je System. Das ist der Preis dafür, dass
  der Nutzer ohne Terminal überhaupt aktualisieren kann — er hat genau zwei Dateien zum
  Doppelklicken, und ihre Namen sagen, was sie tun. Seit der Windows-Unterstützung sind es
  vier: `Start.command`/`Aktualisieren.command` für macOS,
  `Start.bat`/`Aktualisieren.bat` für Windows. Ein Windows-Nutzer mit Startknopf, aber
  ohne Update-Knopf hätte genau den handgeschriebenen Weg zurück, den dieses ADR abschafft.
  Die Paare sind bewusst verdoppelt statt ein gemeinsames Skript: keine Shell bedient beide
  Interpreter, und ein Node-Skript als Einstieg scheitert genau dann, wenn Node noch fehlt.
  Sie gehen deshalb dieselben Schritte in derselben Reihenfolge und sagen dieselben Sätze;
  die erlaubten Unterschiede stehen im Kopf der `.bat`-Dateien.
- `Aktualisieren.command` aktualisiert sich im Lauf selbst mit. Deshalb steht sein ganzer
  Ablauf in einer Funktion, die erst in der letzten Zeile gerufen wird: die Shell liest ein
  Skript sonst weiter, während es läuft, und ein Pull mitten hinein macht daraus
  Buchstabensalat. `Aktualisieren.bat` hat dasselbe Problem und braucht eine andere Lösung —
  cmd kennt keine vorab gelesene Funktion, sondern springt nach jedem Befehl an einen
  gemerkten Byte-Versatz in der Datei zurück. Deshalb kopiert es sich zuerst nach `%TEMP%`
  und läuft von dort weiter; die Datei, die der Pull anfasst, ist dann nicht mehr die
  laufende.
- Der ZIP-Weg bleibt für die Erstinstallation, ist aber kein empfohlener Update-Weg mehr.
  Die README nennt beim ZIP-Update jetzt ausdrücklich `ingest/funds.json`, `config.json`
  und die erneute Gatekeeper-Warnung — die drei Dinge, die dabei verloren gehen
  beziehungsweise wiederkommen.
- Jeder Start macht eine zusätzliche Abfrage (`SELECT MIN(kern_version) FROM depot_tag`).
  Das ist ein Index-Lauf über eine Spalte, keine messbare Zeit vor der ersten Zahl.
- An den zwölf Invarianten ändert sich nichts: keine neue Route, keine neue Gegenstelle,
  kein MCP-Aufruf, keine Datenbankschreibung außerhalb von `depot_tag` durch die
  vorgezogene Neuberechnung.
