# ADR-018: Fondskataloge statt Einzelabfrage, `funds.json` bleibt als Vorrang

> **Teilweise abgelöst:** iShares hat keinen Katalog mehr; iShares-Fonds kommen über
> `funds.json` mit `produktId`, die Bestandteile per `get-product-data` —
> [ADR-027](ADR-027-ishares-holdings-per-get-product-data.md). Für Xtrackers und Amundi gilt
> diese ADR unverändert.

## Kontext

Die Top-25-Kachel zeigt den Blick durch die gehaltenen ETFs auf die tatsächlich gehaltenen
Unternehmen (Look-Through). Bis hierher stand dafür `ingest/funds.json`: von Hand ein
Eintrag je gehaltenem Fonds, mit Anbieter, ISIN und — bei iShares — der Holdings-Adresse
selbst. Jeder neu gekaufte ETF musste dort nachgetragen werden, sonst fehlte er im
Look-Through, ohne dass das sichtbar gewesen wäre.

Das lässt sich für die drei tatsächlich verbreiteten Anbieter im Depot — iShares, Xtrackers,
Amundi — vermeiden: alle drei veröffentlichen einen Produktkatalog, der ISIN auf Anbieter und
(bei iShares) auf die Produkt-ID abbildet. Eine gehaltene ISIN lässt sich also gegen diese
Kataloge auflösen, statt sie von Hand einzutragen.

Zwei Wege standen zur Wahl: **Durchprobieren** (jede gehaltene ISIN gegen jeden Anbieter als
Einzelabruf versuchen) oder **Katalog** (je Anbieter einmal die ganze Produktliste holen, dann
lokal nachschlagen). Durchprobieren bräuchte pro gehaltener ISIN bis zu drei Abrufe, bei jedem
Lauf, ohne Fortschritt zu cachen — und iShares' Ajax-Endpunkt nimmt keine beliebige ISIN
entgegen, sondern verlangt die intern vergebene `portfolioId`, die aus der ISIN allein nicht
folgt. Ein Katalog macht das zu einem Abruf je Anbieter, unabhängig von der Zahl der gehaltenen
Fonds, mit einem Ergebnis, das sich cachen lässt (Migration 005,
[`fonds_aufloesung`](../DATENMODELL.md#fonds_aufloesung)).

## Entscheidung: Katalog statt Einzelabfrage

`ingest/anbieter.ts` bündelt für jeden der drei Anbieter `katalog` (ganze Produktliste, ein
Abruf) und `bestandteile` (Positionen eines einzelnen Fonds) hinter einer gemeinsamen Form
(`Anbieter`-Typ). `ingest/ernte.ts` iteriert `ANBIETER` statt drei Anbieter-Zweige im Code zu
führen — ein vierter Anbieter ist eine neue Datei unter `ingest/quellen/` plus ein Eintrag in
dieser Liste und einer in `ANBIETER_HOSTS` (`shared/hosts.ts`, Vorgabe der Host-Allowlist), keine
Änderung an `ernte.ts`.

Der Katalogabruf läuft nicht bei jedem Lauf: `fonds_aufloesung.geprueft_am` trägt den
Kalendertag des letzten Abrufs, `konfiguration.fondsKatalogFrischeTage` bestimmt, wie lange ein
Eintrag gilt (§ Konfiguration, nicht Code — Werte zwischen drei und sieben Tagen sind
plausibel). Nur eine abgelaufene oder fehlende ISIN löst einen neuen Katalogabruf aus; eine
frische Zeile wird direkt aus `fonds_aufloesung` gelesen.

### Warum die Xtrackers-Sitemap eine legitime Quelle ist

Xtrackers hat keinen dokumentierten Produktkatalog-Endpunkt, aber jede Fondsseite trägt ihre
ISIN im Pfad (`/de-de/<ISIN>-<slug>/`), und die öffentliche Sitemap
(`https://etf.dws.com/de-de/sitemap.xml`) listet alle Fondsseiten in einem Abruf. Das ist eine
für genau diesen Zweck veröffentlichte, für jeden Besucher erreichbare Adresse — kein
interner Endpunkt, kein geborgter Header, nichts, was nur im ausgelieferten JavaScript der
Seite steht. Gelesen wird kein XML-Parser, sondern ein Muster auf `<loc>`-Inhalte
(`EINTRAG_MUSTER` in `ingest/quellen/xtrackers.ts`) mit fester Obergrenze
(`GRENZE.xtrackersSitemapEintraege`) — der Rest des Dokuments (andere Sprachvarianten,
Nicht-Fondsseiten) bleibt unangesehen. Amundi liefert seinen Katalog dagegen direkt als JSON
über denselben Endpunkt wie die Bestandteile (`productIds: []` fragt alle Produkte ab).

### Warum `funds.json` bleibt

Drei Fälle bleiben, die ein Katalog nicht abdeckt:

- Ein Anbieter außerhalb der drei unterstützten (siehe unten, „Weitere Anbieter").
- iShares, seit dem Wegfall des Katalogs ([ADR-027](ADR-027-ishares-holdings-per-get-product-data.md)).
- Der Sonderfall, in dem jemand die automatische Auflösung bewusst umgehen will.

`ingest/ernte.ts` liest `funds.json` deshalb weiterhin, **vor** der automatischen Auflösung, und
schließt jede dort eingetragene ISIN von ihr aus (`ernteManuelleFonds`) — ein
manueller Eintrag hat Vorrang, nie einen Konflikt mit dem, was der Katalog gefunden hätte.
`funds.example.json` und die README sind entsprechend auf „optional, nur für den Rest" statt
„Pflichtpflege" umgestellt: die Datei ist der Fallback, nicht mehr der einzige Weg.

## INV-12 im Grenzfall: Struktur streng, Zellen einzeln

INV-12 verlangt `.strict()` für jede fremde Antwort. Für Kataloge, von denen je Produkt nur
ein Feld gebraucht wird, lässt sich das nicht wörtlich anwenden — Dutzende unbekannte Felder
`.strict()` zu prüfen bringt nichts, wenn kein Vertrag über deren Namen besteht.

Die Auflösung:

- **Amundi-Katalog (`AmundiKatalogAntwort`)**: Produktzahl über
  `GRENZE.amundiKatalogProdukte` begrenzt, die übrigen Felder bleiben offen. Der einzige
  gelesene Wert, `productId` (die ISIN), wird gegen `ISIN_MUSTER` geprüft, bevor er die
  Datenbank erreicht (`ingest/quellen/amundi.ts`).
- **Xtrackers-Sitemap**: kein XML-Parser, sondern `EINTRAG_MUSTER` — ein Regex auf
  `<loc>`-Inhalte, die exakt auf `/de-de/<ISIN>-<slug>/` passen — mit fester Obergrenze
  (`GRENZE.xtrackersSitemapEintraege`). Jeder Treffer läuft anschließend durch `Isin`
  (`ingest/schema/grundlagen.ts`), bevor er in den Katalog kommt.

Der Vertrag ist damit nicht „die ganze Antwort ist bekannt", sondern „die Struktur hat eine
Obergrenze, und alles, was die Datenbank erreicht, ist einzeln geprüft" — dieselbe Substanz wie
INV-12 verlangt, angewendet auf eine Form, für die `.strict()` wörtlich keinen Sinn ergibt.

## Weitere Anbieter: nur drei, bewusst

Der Bauplan hat siebzehn weitere ETF-Häuser geprüft. Nur drei sind im Depot vertreten und
wurden umgesetzt; der Rest bleibt aus, bis er gebraucht wird:

- **Geborgte Kennungen (Vanguard, HSBC): nein.** Beide verlangen einen Header oder ein Token,
  das nur im ausgelieferten JavaScript der jeweiligen Seite steht und nirgends dokumentiert
  ist. Keine Invariante verbietet das ausdrücklich, aber es widerspricht dem, was der übrige
  Ingest tut — nur veröffentlichte Adressen ansprechen. Beide Häuser bleiben beim Restfall
  (`durchsicht: 'unbekannt'`).
- **Erklärungen abgeben (First Trust): nein.** First Trust gibt die Bestandteile erst frei,
  nachdem per POST Land und Anlegertyp erklärt wurden, und für Deutschland bleibt dort nur
  „professioneller Anleger" — das ist eine Zusicherung über den Nutzer, keine technische Hürde.
  First Trust bleibt deshalb in `Anbietername` geführt (für einen künftigen `gesperrt`-Fall),
  aber ohne Katalog- oder Bestandteile-Implementierung — `ANBIETER` (`ingest/anbieter.ts`)
  enthält nur die drei umgesetzten Häuser.
- **OpenFIGI, Excel-Leser (State Street, BNP): offen, nicht Teil dieser Änderung.** Beide lösen
  ein Problem, das im aktuellen Depot nicht vorkommt (Fonds ohne erreichbaren Katalog bzw. ein
  XLSX-Format als Quelle) und werden nachgeholt, wenn ein gehaltener Fonds das tatsächlich
  braucht.

## Verworfene Alternative: der Dialog auch für unbekannte Anbieter

Die Detailansicht der fehlenden Fonds (dritter Untertitelteil der Top-25-Kachel, siehe
Schritt 6 im Bauplan) unterscheidet zwei Fälle: `gesperrt` (der Anbieter führt seinen Katalog,
zeigt die Bestandteile aber nicht) und `abrufGescheitert` (der letzte Abrufversuch ist
gescheitert, ein erneutes „Aktualisieren" hilft meistens). Erwogen wurde ein dritter Fall für
einen `funds.json`-Eintrag mit einem von den drei unterstützten Anbietern abweichenden Wert —
verworfen, weil `FundsDatei` (`ingest/schema/dateien.ts`) eine solche Datei bereits beim
Einlesen als Ganzes ablehnt (diskriminierte Union über exakt `ishares` | `xtrackers` |
`amundi`, `.strict()`, kein Teilimport). Ein vierter Dialog-Fall hätte einen zweiten, nachsichtigeren
Parser gebraucht, nur um einen Zustand zu erklären, der praktisch nie den Lauf erreicht — die
gültige Datei bleibt die einzige Voraussetzung, keine Fehlermeldung dafür im Dialog.

## Folgen

- Ein Depot aus reinen Xtrackers- und Amundi-Fonds braucht `ingest/funds.json` nicht mehr.
- Ein neu gekaufter Xtrackers- oder Amundi-Fonds erscheint im Look-Through, ohne dass
  jemand ihn einträgt — sichtbar am dritten Untertitelteil und am Dialog, solange die
  Bestandteile noch fehlen, und an den entsprechenden Laufhinweisen in `/api/lauf`, wenn ein
  Abruf scheitert.
- Ein vierter Anbieter ist eine neue Datei unter `ingest/quellen/` plus ein Eintrag in
  `ANBIETER` — keine Änderung an `ingest/ernte.ts`.
- Neue Obergrenzen in `GRENZE`: `xtrackersSitemapEintraege`, `amundiZeilen`,
  `amundiKatalogProdukte`.
- Eine neue Migration (005) und Repository-Schicht (`db/repository/fondsAufloesung.ts`), siehe
  [`docs/DATENMODELL.md`](../DATENMODELL.md#fonds_aufloesung).
