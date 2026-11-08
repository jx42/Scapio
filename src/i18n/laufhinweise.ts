/* `de.laufhinweise`: Hinweise und Fehler aus dem letzten Lauf, eingehaengt in `de.ts`. */

import type { QuellenArt } from '../../shared/quellen.ts';
import { DATENORDNER, type CodeTexte } from './bausteine.ts';

export const laufhinweise = {
  titel: 'Hinweis aus dem letzten Lauf',
  /** Titel des Alerts fuer einen gescheiterten Lauf ohne eigenen Titel (kein Bestand/
   *  Kontostand, keine faellige Anmeldung — die haben ihre eigenen Alerts). */
  fehlerTitel: 'Der letzte Lauf ist gescheitert',
  /** Abhilfe bei Bestand und Kontostand aus einem Lauf, der den Code je Quelle noch nicht kannte. */
  erneutVersuchen: 'Drücke in einigen Sekunden erneut „Aktualisieren“.',
  /** Folge eines gescheiterten Laufs, steht vor dem Satz zum Code. */
  fehlerFolge: 'Es wurde nichts übernommen; alle Zahlen zeigen den Stand des vorigen Laufs.',
  /** sr-only-Beschriftung des X-Knopfs, der einen einzelnen Hinweis ausblendet. */
  ausblenden: 'Hinweis ausblenden',
  /** Der Code klein unter dem Satz — danach sucht das Runbook. */
  code: (code: string) => `Code ${code}`,
  /**
   * Eine gescheiterte Quelle (`quelleGescheitert`): Titel und Folge je Quellenart — der
   * Teil vor dem Doppelpunkt des Schluessels in `lauf.quellen`. `tun` ersetzt dort, wo die
   * Abhilfe an der Quelle haengt statt am Code, den Satz aus `quelleCode`.
   */
  quelle: {
    holdings: {
      titel: 'Der Bestand konnte nicht abgerufen werden',
      folge: 'Angezeigt wird der Bestand aus dem letzten erfolgreichen Abruf; die Selbstkontrolle ist ausgesetzt.',
    },
    cash: {
      titel: 'Der Kontostand konnte nicht abgerufen werden',
      folge: 'Angezeigt wird der Kontostand aus dem letzten erfolgreichen Abruf.',
    },
    kurse: {
      titel: 'Kurse nicht abgerufen',
      folge: (anzahl: number) =>
        anzahl === 1
          ? 'Für ein Wertpapier fehlen die neuesten Kurse. Es wird mit seinem letzten bekannten Kurs bewertet.'
          : `Für ${String(anzahl)} Wertpapiere fehlen die neuesten Kurse. Sie werden mit ihrem letzten bekannten Kurs bewertet.`,
    },
    sparplaene: {
      titel: 'Sparpläne nicht abgerufen',
      folge: 'Die Sparpläne zeigen den Stand des letzten erfolgreichen Abrufs.',
    },
    gesamtwert: {
      titel: 'Gegenprobe mit der Bank ausgefallen',
      folge:
        'Alle Zahlen auf dieser Seite sind aktuell. Nur der Abgleich mit der Depotübersicht von Scalable Capital fehlt diesmal.',
    },
    vpi: {
      titel: 'Inflationsdaten nicht abgerufen',
      folge: 'Die Realrendite rechnet mit dem Preisindex aus dem letzten erfolgreichen Abruf.',
    },
    'vpi-aktuell': {
      titel: 'Jüngste Inflationsmonate nicht abgerufen',
      folge: 'Die letzten Monate der Preisreihe bleiben leer; die Realrendite endet entsprechend früher.',
    },
    zins: {
      titel: 'Zinsdaten nicht abgerufen',
      folge: 'Die Sharpe-Ratio rechnet mit dem Zins aus dem letzten erfolgreichen Abruf.',
    },
    art: {
      titel: 'Wertpapierarten nicht abgerufen',
      folge: 'Neue Positionen zeigen in der Aufteilung „–“ statt Aktie, ETF oder Fonds. Alle Beträge sind davon unberührt.',
    },
    fonds: {
      titel: 'Die Fondsliste funds.json ist nicht lesbar',
      folge: 'Die dort eingetragenen Fonds werden mit dem letzten bekannten Stand ihrer Bestandteile durchleuchtet.',
      tun: `Prüfe die Datei funds.json ${DATENORDNER} — meist ist es ein Komma zu viel. Das Format zeigt ingest/funds.example.json im Scapio-Ordner.`,
    },
    fondsaufloesung: {
      titel: 'Fondsbestandteile nicht abgerufen',
      folge: 'Die Durchsicht durch die ETFs zeigt den Stand des letzten erfolgreichen Abrufs.',
    },
    fondskatalog: {
      titel: 'Fondsverzeichnis nicht abgerufen',
      folge: (anbieter: string) =>
        `Das Fondsverzeichnis von ${anbieter} fehlt. Bereits erkannte Fonds bleiben erkannt; neu gekaufte Fonds dieses Anbieters werden erst nach dem nächsten erfolgreichen Abruf durchleuchtet.`,
    },
    sonst: {
      titel: 'Eine Datenquelle wurde nicht abgerufen',
      folge: (quelle: string) => `Betroffen: ${quelle}. Die Zahlen daraus zeigen den Stand des letzten erfolgreichen Abrufs.`,
    },
  } satisfies Record<Exclude<QuellenArt, 'transaktionen'> | 'sonst', unknown>,
  /** Was bei einer gescheiterten Quelle passiert ist und was hilft — je Fehlercode. */
  quelleCode: {
    E_MCP_DROSSEL: {
      grund: 'Scalable Capital hat die Abfragen gebremst.',
      tun: 'Warte ein paar Minuten und drücke dann erneut „Aktualisieren“.',
    },
    E_MCP_ZEIT: {
      grund: 'Scalable Capital hat nicht rechtzeitig geantwortet.',
      tun: 'Drücke später erneut „Aktualisieren“.',
    },
    E_MCP_TRANSIENT: {
      grund: 'Scalable Capital war kurz nicht erreichbar.',
      tun: 'Drücke erneut „Aktualisieren“ — meist klappt es beim nächsten Versuch.',
    },
    E_MCP_ABGELEHNT: {
      grund: 'Scalable Capital hat die Abfrage auch beim zweiten Versuch abgelehnt.',
      tun:
        'Drücke später erneut „Aktualisieren“. Scheitert es bei jedem Abruf, hat sich vermutlich die Schnittstelle von Scalable Capital geändert: Hole dann mit Aktualisieren.command bzw. .bat die neueste Version von Scapio.',
    },
    E_WAEHRUNG: {
      grund: 'Die Antwort enthielt einen Betrag in einer anderen Währung als Euro. Scapio rechnet nur in Euro.',
      tun: 'Hole mit Aktualisieren.command bzw. .bat die neueste Version von Scapio. Bis dahin bleibt diese Quelle auf dem alten Stand.',
    },
    schnittstelle: {
      grund: 'Die Antwort hatte eine unerwartete Form. Vermutlich hat sich die Schnittstelle geändert.',
      tun: 'Hole mit Aktualisieren.command bzw. .bat die neueste Version von Scapio. Bis dahin bleibt diese Quelle auf dem alten Stand.',
    },
    netz: {
      grund: 'Die Webseite des Anbieters war nicht erreichbar oder hat unerwartet geantwortet.',
      tun: 'Prüfe die Internetverbindung und drücke später erneut „Aktualisieren“.',
    },
    sonst: {
      grund: 'Der Abruf ist an einer unerwarteten Stelle gescheitert.',
      tun: 'Drücke später erneut „Aktualisieren“. Bleibt die Meldung, steht der Grund in lauf.log im Datenverzeichnis von Scapio.',
    },
  } satisfies CodeTexte<{ readonly grund: string; readonly tun: string }> & Record<'schnittstelle' | 'netz' | 'sonst', unknown>,
  /** Titel je Hinweisart; fehlt einer, gilt `titel`. */
  artTitel: {
    mcpSitzungErneuert: 'Verbindung zu Scalable Capital erneuert',
    vpiNichtAngebunden: 'Inflationsdaten nicht abgerufen',
    vpiRandNichtAngebunden: 'Jüngste Inflationsmonate nicht abgerufen',
    vpiRandOhneBasis: 'Jüngste Inflationsmonate fehlen',
    zinsNichtAngebunden: 'Zinsdaten nicht abgerufen',
    fondsNichtAbrufbar: 'Fondsbestandteile nicht abgerufen',
    artNichtAbrufbar: 'Wertpapierart nicht abgerufen',
    storniert: 'Transaktionen als storniert vermerkt',
    kurslueckenJung: 'Neueste Kurse lückenhaft',
    selbstkontrolle: 'Abweichung zum gemeldeten Bestand',
    punkteZuFrueh: 'Einzelne Datenpunkte verworfen',
    punkteInZukunft: 'Einzelne Datenpunkte verworfen',
    summenAbweichung: 'Gesamtwert weicht von der Bank ab',
    tagessprung: 'Auffälliger Kurssprung',
    historienbeginn: 'Anfangsbestand fehlt',
    uebertragOhneWert: 'Übertrag ohne Wert',
    vpiSprung: 'Auffälliger Sprung im Preisindex',
    zeileOhneZeitstempel: 'Einzelne Buchungen verworfen',
    zeileOhneZweig: 'Einzelne Buchungen verworfen',
    unbekannteTypen: 'Unbekannte Buchungsarten',
    seedUebernommen: 'Anfangsbestand übernommen',
    kursfensterNichtAbrufbar: 'Kurse nicht abgerufen',
    kursfensterSchema: 'Kurse verworfen',
    kursfensterAndereIsin: 'Kurse verworfen',
    kurspunkteUngueltig: 'Einzelne Kurse verworfen',
    zinsLuecken: 'Lücken in den Zinsdaten',
    vpiLuecken: 'Lücken im Preisindex',
    vpiRandLuecken: 'Lücken im Preisindex',
    bestandteileSumme: 'Fondsbestandteile ungenau',
    transaktionenSeitenGrenze: 'Transaktionsliste nahe der Grenze',
  } as Readonly<Record<string, string>>,
  /** Was der Nutzer zu einem Hinweis tun kann — auch, wenn es nichts ist. */
  artTun: {
    text: 'Ein neuer Abruf über „Aktualisieren“ ersetzt diesen Hinweis.',
    mcpSitzungErneuert: 'Du musst nichts tun.',
    vpiNichtAngebunden:
      `Trage in einstellungen.json ${DATENORDNER} „inflationsquelle“: „eurostat“ ein, dann holt der nächste Abruf die Inflationsdaten wieder.`,
    vpiRandNichtAngebunden:
      `Trage in einstellungen.json ${DATENORDNER} „inflationsquelle“: „eurostat“ ein, dann holt der nächste Abruf die Inflationsdaten wieder.`,
    vpiRandOhneBasis: 'Drücke später erneut „Aktualisieren“; mit der Preisreihe kommen auch die jüngsten Monate.',
    zinsNichtAngebunden:
      `Trage in einstellungen.json ${DATENORDNER} „zinsquelle“: „ecb“ ein, dann holt der nächste Abruf die Zinsdaten wieder.`,
    fondsNichtAbrufbar:
      'Drücke später erneut „Aktualisieren“. Bleibt der Hinweis, hilft eine neue Version von Scapio (Aktualisieren.command bzw. .bat). Bis dahin ist die Durchsicht dieses Fonds nicht auf dem neuesten Stand.',
    artNichtAbrufbar: 'Drücke später erneut „Aktualisieren“. Bis dahin zeigt die Position „–“ als Art; Beträge sind davon unberührt.',
    storniert:
      'Meist hat die Bank eine Buchung zurückgenommen. Stimmt eine Zahl nicht, vergleiche die Umsätze mit den Abrechnungen der Bank.',
    kurslueckenJung:
      'Drücke später erneut „Aktualisieren“. Verschwindet der Hinweis nicht, liefert ein Papier dauerhaft keine Kurse mehr.',
    selbstkontrolle:
      'Hält die Abweichung über mehrere Abrufe an, vergleiche die Umsätze mit den Abrechnungen der Bank — meist fehlt eine Buchung oder ein Kurs.',
    punkteZuFrueh: 'Du musst nichts tun; die übrigen Daten sind übernommen.',
    punkteInZukunft: 'Du musst nichts tun; die übrigen Daten sind übernommen.',
    summenAbweichung:
      'Drücke später erneut „Aktualisieren“. Bleibt die Abweichung, fehlt meist eine Position oder der Kontostand auf einer der beiden Seiten.',
    tagessprung:
      'Ein Tagessprung ist oft echt — etwa eine Ausschüttung, ein Split oder eine geänderte Kursquelle — und wird deshalb nur markiert. Bei Zweifel hilft der Vergleich mit der Abrechnung der Bank.',
    historienbeginn:
      'Trage den Bestand vor dem ersten gelieferten Umsatz in seed.json im Datenordner ein (Vorlage: docs/seed.example.json im Scapio-Ordner). Bis dahin kann die Rendite der Frühzeit verzerrt sein.',
    uebertragOhneWert:
      'Du kannst nichts eintragen; Scapio schätzt den Wert nicht. Rendite und Gewinn dieser Position sind zu hoch, weil ihr ganzer Wert als Kursgewinn zählt.',
    vpiSprung: 'Meist ist das eine Revision der Statistik. Du musst nichts tun.',
    zeileOhneZeitstempel: 'Du musst nichts tun. Tritt der Hinweis bei jedem Abruf auf, hilft eine neue Version von Scapio (Aktualisieren.command bzw. .bat).',
    zeileOhneZweig: 'Du musst nichts tun. Tritt der Hinweis bei jedem Abruf auf, hilft eine neue Version von Scapio (Aktualisieren.command bzw. .bat).',
    unbekannteTypen: 'Hole mit Aktualisieren.command bzw. .bat die neueste Version von Scapio; sie kennt diese Buchungsarten vielleicht schon.',
    seedUebernommen: 'Du musst nichts tun.',
    kursfensterNichtAbrufbar: 'Drücke später erneut „Aktualisieren“. Bis dahin gilt für dieses Papier der letzte bekannte Kurs.',
    kursfensterSchema:
      'Drücke später erneut „Aktualisieren“. Bleibt der Hinweis, hilft eine neue Version von Scapio (Aktualisieren.command bzw. .bat).',
    kursfensterAndereIsin:
      'Drücke später erneut „Aktualisieren“. Bleibt der Hinweis, hilft eine neue Version von Scapio (Aktualisieren.command bzw. .bat).',
    kurspunkteUngueltig: 'Du musst nichts tun; die übrigen Kurse sind übernommen.',
    zinsLuecken: 'Du musst nichts tun.',
    vpiLuecken: 'Du musst nichts tun.',
    vpiRandLuecken: 'Du musst nichts tun.',
    bestandteileSumme: 'Du musst nichts tun; die Durchsicht dieses Fonds ist entsprechend ungenauer.',
    transaktionenSeitenGrenze:
      'Noch musst du nichts tun. Hole bald mit Aktualisieren.command bzw. .bat die neueste Version von Scapio; ist die Grenze erreicht, scheitert jeder Abruf, bis eine Version sie anhebt.',
    unbekannt: 'Hole mit Aktualisieren.command bzw. .bat die neueste Version von Scapio.',
  } as Readonly<Record<string, string>> & { readonly unbekannt: string },
  /** Ein Satz je Hinweisart (`hinweise.ts`); `lib/hinweisText.ts` formatiert die Werte. */
  art: {
    mcpSitzungErneuert: 'Die Verbindung zu Scalable Capital war abgelaufen und wurde neu aufgebaut.',
    vpiNichtAngebunden: (quelle: string) =>
      `Für die Inflation ist „${quelle}“ eingetragen, aber nur „eurostat“ wird abgerufen. Die Realrendite bleibt auf dem alten Stand.`,
    vpiRandNichtAngebunden: (quelle: string) =>
      `Für die Inflation ist „${quelle}“ eingetragen, aber nur „eurostat“ wird abgerufen. Die jüngsten Monate der Preisreihe bleiben leer.`,
    vpiRandOhneBasis:
      'Die amtliche Preisreihe fehlte in diesem Lauf. Ohne sie lassen sich die jüngsten Monate nicht ergänzen.',
    zinsNichtAngebunden: (quelle: string) =>
      `Für den Zins ist „${quelle}“ eingetragen, aber diese Quelle wird nicht abgerufen. Die Sharpe-Ratio bleibt auf dem alten Stand.`,
    fondsNichtAbrufbar: (anbieter: string, isin: string) =>
      `${anbieter} ${isin}: Die Bestandteile des Fonds waren nicht abrufbar. Es gilt der letzte bekannte Stand.`,
    artNichtAbrufbar: (isin: string) => `Die Wertpapierart für ${isin} war nicht abrufbar.`,
    storniert: (anzahl: string) =>
      `${anzahl} Transaktionen wurden von der Bank nicht mehr geliefert und als storniert vermerkt.`,
    kurslueckenJung: (tage: string, spanne: string) =>
      `${tage} der letzten ${spanne} Tage ohne vollständige Kurse — Kurve dort unterbrochen.`,
    selbstkontrolle: (abweichung: string) =>
      `Die Selbstkontrolle des Laufs fand eine Abweichung von ${abweichung} zum gemeldeten Bestand.`,
    punkteZuFrueh: (quelle: string, grenze: string) => `${quelle}: Punkte vor dem ${grenze} verworfen.`,
    punkteInZukunft: (quelle: string) => `${quelle}: Punkte mit Datum in der Zukunft verworfen.`,
    summenAbweichung: (groessenordnung: string) =>
      `Positionswerte + Verrechnungskonto weichen um mehr als 1 € vom Gesamtwert ab (Größenordnung ${groessenordnung}).`,
    zehnerpotenzEuro: (exponent: string) => `10^${exponent} €`,
    tagessprung: (bezeichnung: string, anzahl: string, zeitraum: string) =>
      `${bezeichnung}: ${anzahl} mit Tagessprung über 30 % ${zeitraum} als auffällig markiert.`,
    kurse: (anzahl: number, text: string) => (anzahl === 1 ? `${text} Kurs` : `${text} Kurse`),
    amTag: (tag: string) => `am ${tag}`,
    zwischen: (von: string, bis: string) => `zwischen ${von} und ${bis}`,
    historienbeginn: (ersterTransaktionsTag: string, ersterKaufTag: string) =>
      `Die Transaktionsliste beginnt am ${ersterTransaktionsTag}, ein Kauf ist aber schon am ${ersterKaufTag} bekannt. Ein Anfangsbestand in seed.json schließt die Lücke.`,
    uebertragOhneWert: (isin: string, tag: string) =>
      `${isin}: Der Übertrag ins Depot am ${tag} kam ohne Wert. Er zählt weder als Einzahlung noch als Einstand.`,
    vpiSprung: (anzahl: string, schwelle: string, monate: string) =>
      `Der Verbraucherpreisindex springt in ${anzahl} Monaten um mehr als ${schwelle} (${monate}).`,
    zeileOhneZeitstempel: (quelle: string) => `${quelle}: Zeile mit unlesbarem Zeitstempel verworfen.`,
    zeileOhneZweig: (quelle: string) => `${quelle}: Zeile ohne passenden Zweig verworfen.`,
    unbekannteTypen: (typen: string) =>
      `Unbekannte Transaktionstypen: ${typen}. Bis sie eingeordnet sind, zählen sie als Gewinn oder Verlust, nicht als Einzahlung.`,
    seedUebernommen: (zeilen: string) => `${zeilen} Zeilen Anfangsbestand aus seed.json übernommen.`,
    kursfensterNichtAbrufbar: (fenster: string, isin: string) =>
      `Kursfenster ${fenster} für ${isin} war nicht abrufbar.`,
    kursfensterSchema: (fenster: string, isin: string) =>
      `Kursfenster ${fenster} für ${isin} hatte eine unerwartete Form und wurde verworfen.`,
    kursfensterAndereIsin: (fenster: string, isin: string) =>
      `Kursfenster ${fenster}: Die Antwort betraf ein anderes Papier als ${isin} und wurde verworfen.`,
    kurspunkteUngueltig: (isin: string, anzahl: string) => `${isin}: ${anzahl} Kurse von null oder darunter verworfen.`,
    zinsLuecken: (tage: string) => `Zins: ${tage} Tage ohne Wert übersprungen.`,
    vpiLuecken: (monate: string) => `Preisindex: ${monate} Monate ohne Wert übersprungen.`,
    vpiRandLuecken: (monate: string) => `Preisindex, jüngste Monate: ${monate} Monate ohne Wert übersprungen.`,
    bestandteileSumme: (isin: string, prozent: string, positionen: string, ohneIsin: string) =>
      `Die Bestandteile von ${isin} summieren sich auf ${prozent} (${positionen} Positionen, ${ohneIsin} ohne ISIN).`,
    transaktionenSeitenGrenze: (seiten: string, hoechstens: string) =>
      `Die Transaktionsliste der Bank kam in ${seiten} Seiten; Scapio liest höchstens ${hoechstens}.`,
    unbekannt: (art: string) => `Hinweis „${art}“ aus einer neueren Version.`,
    quelleGescheitert: (quelle: string) => `${quelle} wurde nicht abgerufen.`,
  },
} as const;
