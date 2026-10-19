/*
 * Alle sichtbaren Texte an einer Stelle.
 *
 * Nicht wegen Mehrsprachigkeit — die kommt nie —, sondern weil sich Formulierungen
 * nur so einheitlich halten und einmal am Stueck lesen lassen. Kein sichtbarer Text
 * steht in einer Komponente, auch keine Einheit und kein "Laedt…". [P-06]
 *
 * Funktionen sind erlaubt, wo ein Satz einen Wert einbaut. Die Werte kommen fertig
 * formatiert aus `lib/format.ts` herein — hier wird nicht gerechnet und nicht gerundet.
 */

import type { LaufFehlerCode } from '../../shared/laufFehler.ts';
import type { LaufSchritt } from '#server/vertrag';

/** Prueft die Schluessel gegen die Codes; nachgeschlagen wird mit beliebigem String und Rueckfall auf `sonst`. */
type CodeTexte<T> = Partial<Record<LaufFehlerCode | 'E_SPERRE', T>>;

/** Bekannte Wertpapierarten der Bank (`securityType`); weitere Werte erscheinen unverändert. */
/** Wo `funds.json` und `einstellungen.json` liegen [ADR-037] — beide Plattformen, die Seite weiss nicht, welche. */
const DATENORDNER = 'im Datenordner von Scapio (macOS: ~/Library/Application Support/scapio, Windows: %LOCALAPPDATA%\\scapio)';

const ARTEN: Readonly<Partial<Record<string, string>>> = { STOCK: 'Aktie', ETF: 'ETF', FUND: 'Fonds', CRYPTO_ETP: 'Krypto' };

export const de = {
  seite: {
    titel: 'Scapio: Dein Scalable Capital Depot',
    titelDemoZusatz: ' (Demo)',
    demoBand: 'Hinweis zur Demo',
    demoBandText: 'Das ist die Demo von Scapio, mit erfundenen Daten. Die echte Anwendung läuft lokal auf deinem Rechner.',
    demoBandTextKurz: 'Scapio-Demo mit erfundenen Daten.',
    demoBandLink: 'Scapio auf GitHub',
    demoBandLinkKurz: 'GitHub',
    demoBandLinkOeffnen: 'Scapio auf GitHub öffnen, neuer Tab',
    skip: 'Direkt zu den Kacheln',
    haupt: 'Kacheln',
    standUnbekannt: 'noch kein abgeschlossener Lauf',
    willkommenTitel: 'Willkommen bei Scapio',
    willkommen:
      'Noch sind keine Daten da. „Aktualisieren“ holt Bestand, Umsätze und Kurse von Scalable Capital; der erste Abruf dauert etwas länger.',
    stand: (zeitpunkt: string) => `Stand ${zeitpunkt}`,
    fussVersion: (version: string) => `Version ${version.split('.').slice(0, 2).join('.')}`,
    fussReadme: 'Readme',
    fussReadmeOeffnen: 'Readme von Scapio auf GitHub öffnen, neuer Tab',
    fussVersionen: 'Versionen',
    fussVersionenOeffnen: 'Versionen von Scapio auf GitHub öffnen, neuer Tab',
    fussHinweis:
      'Kein Angebot von Scalable Capital und keine Anlageberatung. Maßgeblich sind allein die Abrechnungen der Bank.',
    fussQuellen: 'Quellen:',
    fussScalable: 'Scalable Capital (Kurse)',
    fussScalableOeffnen: 'Scalable Capital öffnen, neuer Tab',
    fussEurostat: 'Eurostat (Inflation)',
    fussEurostatOeffnen: 'Eurostat öffnen, neuer Tab',
    fussEzb: 'EZB (Zins)',
    fussEzbOeffnen: 'Statistical Data Warehouse der EZB öffnen, neuer Tab',
  },

  /** Zeichensetzung um fertige Werte — Bezeichnung mit Doppelpunkt, Nebenwert in Klammern. */
  satz: {
    beschriftung: (bezeichnung: string) => `${bezeichnung}:`,
    beschriftet: (bezeichnung: string, wert: string) => `${bezeichnung}: ${wert}`,
    inKlammern: (wert: string) => `(${wert})`,
    mitNebenwert: (hauptwert: string, nebenwert: string) => `${hauptwert} (${nebenwert})`,
  },

  pfeil: {
    auf: '',
    ab: '',
    neutral: '',
  },

  zustand: {
    laedt: 'Lädt…',
    laedtBeschreibung: 'Die Kachel holt ihre Daten.',
    leerBeschreibung: 'Erscheint nach dem ersten Abruf.',
    fehler: 'Diese Kachel konnte nicht geladen werden',
    fehlerUnbekannt: 'Der Grund ist unbekannt. Ein Neuladen der Seite hilft meist. Der Rest der Seite bleibt bedienbar.',
    abgestuerzt: 'Diese Kachel ist beim Zeichnen gescheitert.',
    abgestuerztHinweis:
      'Der Rest der Seite bleibt bedienbar. Ein Neuladen der Seite setzt die Kachel zurück.',
  },

  aktualisieren: {
    knopf: 'Aktualisieren',
    laeuft: 'Aktualisieren…',
    laeuftStatus: 'Die Daten werden aktualisiert.',
    laeuftSchrittStatus: (schritt: string) => `Die Daten werden aktualisiert: ${schritt}.`,
    schritte: {
      depot: 'Depot abrufen',
      kurse: 'Kurse abrufen',
      fonds: 'Wertpapiere einordnen',
      inflation: 'Inflation abrufen',
    } satisfies Record<LaufSchritt, string>,
    keinTokenTitel: 'Aktualisieren ist gesperrt',
    keinToken:
      'Kein Sitzungstoken gefunden. Die Seite wurde nicht vom lokalen Server ausgeliefert; Aktualisieren ist deshalb gesperrt. Öffne Scapio über Start.command bzw. .bat oder „npm start“.',
    /** Steht im Popover am gesperrten Knopf, nicht als staendig sichtbarer Text. */
    demo: 'Die Zahlen stammen aus einem synthetischen Depot und können nicht aktualisiert werden.',
    erfolgreich: 'Daten aktualisiert',
    teilweise: 'Daten aktualisiert, aber nicht vollständig',
    teilweiseBeschreibung: 'Nicht alle Daten konnten abgerufen werden. Was fehlt und was du tun kannst, steht oben auf der Seite.',
    gescheitert: 'Aktualisieren gescheitert',
    startGescheitert: 'Aktualisieren konnte nicht gestartet werden',
    anmeldungStartGescheitert: 'Die Anmeldung konnte nicht gestartet werden',
  },

  laufhinweise: {
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
    },
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
        `Unbekannte Transaktionstypen: ${typen}. Sie zählen nicht zur Rendite, bis sie eingeordnet sind.`,
      seedUebernommen: (zeilen: string) => `${zeilen} Zeilen Anfangsbestand aus seed.json übernommen.`,
      kursfensterNichtAbrufbar: (fenster: string, isin: string) =>
        `Kursfenster ${fenster} für ${isin} war nicht abrufbar.`,
      kursfensterSchema: (fenster: string, isin: string) =>
        `Kursfenster ${fenster} für ${isin} hatte eine unerwartete Form und wurde verworfen.`,
      kursfensterAndereIsin: (fenster: string, isin: string) =>
        `Kursfenster ${fenster}: Die Antwort betraf ein anderes Papier als ${isin} und wurde verworfen.`,
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
  },

  /** Ein Satz je Fehlercode eines Laufs; der Code steht klein darunter. Unbekannte Codes
   *  bekommen `sonst`. */
  laufFehler: {
    E_MCP_ANMELDUNG: 'Die Verbindung zu Scalable Capital ist abgelaufen oder fehlt. Melde dich oben über „Anmelden“ neu an.',
    E_MCP_DROSSEL: 'Scalable Capital bremst gerade die Abfragen. Versuche es in ein paar Minuten erneut.',
    E_MCP_ZEIT: 'Scalable Capital hat zu langsam geantwortet. Versuche es später erneut.',
    E_MCP_TRANSIENT: 'Scalable Capital war kurz nicht erreichbar. Versuche es erneut.',
    E_MCP_ABGELEHNT: 'Scalable Capital hat eine Abfrage wiederholt abgelehnt. Versuche es später erneut.',
    E_MCP_RPC:
      'Scalable Capital hat eine Abfrage abgelehnt. Vermutlich hat sich die Schnittstelle geändert. Hole mit Aktualisieren.command bzw. .bat die neueste Version von Scapio.',
    E_MCP_SEITEN:
      'Die Transaktionsliste war länger als erwartet und wurde nicht vollständig gelesen. Hole mit Aktualisieren.command bzw. .bat die neueste Version von Scapio.',
    E_MCP_UNVOLLSTAENDIG: 'Die Antwort von Scalable Capital war unvollständig. Versuche es erneut.',
    E_SCHEMA:
      'Eine Antwort von Scalable Capital hatte eine unerwartete Form. Vermutlich hat sich die Schnittstelle geändert. Hole mit Aktualisieren.command bzw. .bat die neueste Version von Scapio.',
    E_STORNO_BREMSE:
      'Die Bank lieferte deutlich weniger Transaktionen als bekannt. Zur Sicherheit wurde nichts übernommen. Versuche es später erneut.',
    E_SEED_KAPUTT: 'Die Datei seed.json im Datenordner ist kein gültiges JSON. Prüfe sie — meist ist es ein Komma zu viel.',
    E_DATEI_FREMD:
      'Eine Datei im Datenordner ist eine Verknüpfung oder gehört einem anderen Benutzer. Zur Sicherheit wurde sie nicht geöffnet — das Runbook beschreibt, wie du sie ersetzt.',
    E_PLAUSIBEL:
      'Die gelieferten Daten waren nicht plausibel und wurden nicht übernommen. Versuche es später erneut; bleibt die Meldung, nennt lauf.log im Datenverzeichnis die Prüfung, die angeschlagen hat.',
    E_SPERRE: 'Ein anderer Abruf lief noch. Warte, bis er fertig ist, und drücke dann erneut „Aktualisieren“.',
    E_ABGEBROCHEN: 'Der Abruf wurde abgebrochen. Drücke erneut „Aktualisieren“.',
    sonst:
      'Der Abruf ist an einer unerwarteten Stelle gescheitert. Versuche es erneut; bleibt die Meldung, steht der Grund in lauf.log im Datenverzeichnis von Scapio.',
  } satisfies CodeTexte<string> & { readonly sonst: string } as Readonly<Record<string, string>> & { readonly sonst: string },

  mcpAnmeldung: {
    /** Titel der Alert-Reihe zwischen Seitentitel und Kacheln — nie der Knopf selbst. */
    titel: 'Verbindung zu Scalable Capital',
    /** Der Text zu `E_MCP_ANMELDUNG` — abgelaufener Token oder nicht freigeschalteter Zugang. */
    noetig:
      'Die Verbindung zu Scalable Capital ist abgelaufen, oder der Zugang ist nicht freigeschaltet. Prüfe, ob in deinem Konto unter „Agentic Investing“ der MCP-Zugang aktiviert ist, und melde dich erneut an.',
    knopf: 'Anmelden',
    /** Beschriftung des Action-Buttons im Alert selbst; den Rahmen nennt der Alert-Titel. */
    anmeldenKnopf: 'Anmelden',
    laeuft: 'Anmeldung läuft…',
    laeuftBeschreibung:
      'Im Browser öffnet sich ein Fenster von Scalable Capital. Schließe die Anmeldung dort ab, dann drücke „Aktualisieren“.',
    erfolg: 'Anmeldung abgeschlossen. Drücke „Aktualisieren“, um die Daten zu holen.',
    /** Vor der allerersten Anmeldung: noch kein Token auf diesem Rechner. */
    ersteAnmeldung:
      'Scapio ist noch nicht mit deinem Depot bei Scalable Capital verbunden. Aktiviere zuerst in den Kontoeinstellungen unter „Agentic Investing“ den MCP-Zugang, dann melde dich an.',
    gescheitert: (code: string) => `Anmeldung gescheitert: ${de.mcpAnmeldung.fehler[code] ?? de.mcpAnmeldung.fehler.sonst}`,
    fehler: {
      E_MCP_ANMELDUNG: 'Scalable Capital hat die Anmeldung nicht bestätigt, oder sie wurde abgebrochen.',
      E_MCP_ZEIT: 'Die Anmeldung wurde nicht rechtzeitig abgeschlossen.',
      E_MCP_TRANSIENT: 'Scalable Capital war nicht erreichbar.',
      sonst: 'Die Anmeldung wurde nicht abgeschlossen.',
    } satisfies CodeTexte<string> & { readonly sonst: string } as Readonly<Record<string, string>> & { readonly sonst: string },
  },

  laufStatus: {
    laufend: 'läuft',
    erfolg: 'erfolgreich',
    teilweise: 'teilweise',
    fehler: 'gescheitert',
  },

  drift: {
    titelBanner: 'Die Selbstkontrolle meldet eine Abweichung',
    titelAbbruch: 'Die Rekonstruktion stimmt nicht mit dem gemeldeten Bestand überein',
    titelAusgesetzt: 'Die Selbstkontrolle war nicht möglich',
    banner: (abweichung: string) =>
      `Der aus den Umsätzen nachgerechnete Depotwert weicht um ${abweichung} vom Bestand ab, den die Bank meldet. Die Zahlen auf dieser Seite können daneben liegen. Drücke später erneut „Aktualisieren“; bleibt die Abweichung, vergleiche die Umsätze mit den Abrechnungen der Bank.`,
    abbruch: (abweichung: string) =>
      `Der aus den Umsätzen nachgerechnete Depotwert weicht um ${abweichung} vom Bestand ab, den die Bank meldet. Der Verlauf wird deshalb nicht gezeichnet, statt eine falsche Kurve zu zeigen. Drücke erneut „Aktualisieren“; bleibt die Abweichung, fehlt meist eine Buchung — vergleiche die Umsätze mit den Abrechnungen der Bank.`,
    ausgesetzt: (grund: string) =>
      `Die Bank hat beim letzten Abruf keinen Bestand gemeldet (${grund}). Angezeigt wird die letzte Rechnung, ohne Abgleich. Drücke später erneut „Aktualisieren“.`,
    ausgesetztOhneGrund:
      'Die Bank hat beim letzten Abruf keinen Bestand gemeldet. Angezeigt wird die letzte Rechnung, ohne Abgleich. Drücke später erneut „Aktualisieren“.',
    fussnote: (abweichung: string) =>
      `Kleine Abweichung zum gemeldeten Bestand: ${abweichung}. Das grobe Kursraster der Frühzeit erklärt sie in aller Regel.`,
    erklaerung:
      'Diese App rechnet den Depotwert selbst aus allen Käufen, Verkäufen und Erträgen nach und vergleicht ihn mit dem von der Bank gemeldeten Bestand. Weichen beide voneinander ab, macht sie das hier sichtbar, statt eine möglicherweise falsche Zahl stillschweigend anzuzeigen.',
    handlung:
      'Hält die Abweichung über mehrere Abrufe an, lohnt ein Vergleich der Umsätze mit den Abrechnungen der Bank — meist fehlt eine Buchung oder ein Kurs.',
    chartUnterdrueckt: 'Kein Verlauf gezeichnet',
  },

  xirr: {
    nichtBerechenbar: 'nicht berechenbar',
    kein_vorzeichenwechsel:
      'Nicht berechenbar: alle Zahlungen haben dasselbe Vorzeichen, es gibt keine Rendite zu lösen.',
    nicht_konvergiert:
      'Nicht berechenbar: das Verfahren hat für diese Zahlungsreihe keine eindeutige Lösung gefunden.',
    ausserhalb_bereich: 'Nicht berechenbar: die Rendite läge unter −99,99 % oder über 1.000 % im Jahr.',
    nicht_bestimmbar: 'Nicht berechenbar: alle Zahlungen fallen auf einen Tag, ohne Zeitraum gibt es keinen Jahreszins.',
    mehrdeutig:
      'Ein- und Auszahlungen wechseln sich mehrfach ab; für diese Zahlungsreihe gibt es mehr als eine rechnerisch richtige Rendite. Gezeigt ist eine davon.',
    zu_wenige_fluesse: 'Nicht berechenbar: dafür liegen zu wenige Zahlungen vor.',
  },

  verlauf: {
    titel: 'Verlauf',
    kursrasterInfo:
      'Je weiter die Kurshistorie von Scalable Capital zurückreicht, desto gröber ist sie: Für Zeiträume älter als etwa ein Jahr liefert die Schnittstelle nur monatliche Kurse, näher an heute zweitäglich bis täglich. Eine als auffällig markierte Kursbewegung in älteren Daten ist deshalb oft eine normale Bewegung über mehrere Wochen, kein echter Tagessprung.',
    ansicht: 'Ansicht',
    vermoegen: 'Vermögen',
    rendite: 'Rendite',
    zeitraum: 'Zeitraum',
    zeitraeume: {
      '1w': '1W',
      '1m': '1M',
      ytd: 'YTD',
      '1j': '1J',
      '3j': '3J',
      '5j': '5J',
      max: 'MAX',
    },
    zeitraumLang: {
      '1w': 'eine Woche',
      '1m': 'ein Monat',
      ytd: 'seit Jahresbeginn',
      '1j': 'ein Jahr',
      '3j': 'drei Jahre',
      '5j': 'fünf Jahre',
      max: 'gesamte Historie',
    },
    zeitraumFrei: (von: string, bis: string) => `vom ${von} bis ${bis}`,
    reglerBezeichnung: 'Zeitraum frei wählen',
    reglerBeginn: 'Beginn des Zeitraums',
    reglerEnde: 'Ende des Zeitraums',
    reglerDemo: 'In der Demo nicht verfügbar',
    depotwert: 'Depotwert',
    einzahlung: 'Eingezahltes Kapital',
    /**
     * Bewusst NICHT „Kursgewinn“ — diese Kachel rechnet Depotwert minus
     * eingezahltes Kapital und zählt damit das Verrechnungskonto, Erträge, Steuern und Gebühren mit.
     * Die gleichnamige Kennzahl in Kachel 3 lässt genau das weg und steht deshalb auf
     * einer anderen Zahl. [ADR-016]
     */
    gesamtgewinn: 'Gesamtgewinn',
    /** Kopfzeile über dem Chart, in beiden Modi; der Zeitraum steht in der Zeitraumwahl daneben. */
    gesamtgewinnDepot: 'Gesamtgewinn Depot',
    /** Kurzform in der Rendite-Ansicht, wo Prozent vor dem Betrag steht. */
    depot: 'Depot',
    erklaerungGesamtgewinnZeitraum:
      'Wie viel Gesamtgewinn im gewählten Zeitraum dazugekommen ist: der Gesamtgewinn am Ende des Zeitraums minus dem an seinem Anfang. Der Prozentwert setzt ihn ins Verhältnis zum gesamten eingezahlten Kapital am Ende des Zeitraums — nicht nur zu dem, was im Zeitraum dazukam. Mit Einzahlungen im Zeitraum fällt er deshalb anders aus als die Marktrendite (TWR) desselben Zeitraums. Chart und Tooltip zählen ebenfalls ab Beginn des Zeitraums, am letzten Tag stimmen sie mit dieser Zahl überein. Gesamtgewinn heißt dabei Depotwert minus eingezahltes Kapital, also inklusive Verrechnungskonto, Erträgen, Steuern und Gebühren — anders als der „Kursgewinn“ in der Karte oben, der nur die heute gehaltenen Wertpapiere mit dem investierten Kapital vergleicht.',
    erklaerungDifferenz:
      'Gesamtgewinn Depot minus Gewinn des Vergleichs im gewählten Zeitraum. Positiv heißt: Das Depot war besser als die Anlage in den Vergleich.',
    risikofreiKurz: '€STR',
    risikofreiOeffnen: 'Statistical Data Warehouse der EZB (€STR) öffnen, neuer Tab',
    erklaerungBenchmarkGewinn: (benchmark: string) =>
      `Was aus denselben Ein- und Auszahlungen geworden wäre, hättest du sie am selben Tag in ${benchmark} statt ins Depot investiert: der Gewinn dieses Vergleichsdepots im gewählten Zeitraum, bezogen auf dasselbe eingezahlte Kapital wie beim Depot. Chart und Tooltip zählen ab Beginn des Zeitraums, die Vergleichslinie startet dort beim Depotwert. Simuliert mit den Kursen des Vergleichs, ohne Steuern und Gebühren.`,
    chartVermoegen: (zeitraum: string, benchmark: string | null) =>
      `Flächenchart: Depotwert und eingezahltes Kapital${benchmark === null ? '' : ` im Vergleich zu ${benchmark}, beide am Beginn des Zeitraums auf denselben Depotwert gesetzt`}, ${zeitraum}.`,
    chartRendite: (zeitraum: string, benchmark: string | null) =>
      `Liniendiagramm: Gesamtgewinn in Prozent des eingezahlten Kapitals, gezählt ab Beginn des Zeitraums${benchmark === null ? '' : ` im Vergleich zu ${benchmark}`}, ${zeitraum}.`,
    tabelleVermoegen: 'Depotwert und eingezahltes Kapital',
    tabelleRendite: 'Gesamtgewinn in Prozent des eingezahlten Kapitals',
    /** Wie fein die verborgene Wertetabelle ist — sie wird bei langen Zeiträumen verdichtet, damit sie vorlesbar bleibt. */
    tabelleAufloesung: {
      taeglich: 'Eine Zeile je Tag.',
      woechentlich: 'Verdichtet: eine Zeile je Woche, dazu der erste Tag des Zeitraums.',
      monatlich: 'Verdichtet: eine Zeile je Monat (letzter Tag des Monats), dazu der erste und der letzte Tag des Zeitraums.',
    },
    spalteTag: 'Tag',
    spalteDepotwert: 'Depotwert',
    spalteEinzahlung: 'Eingezahltes Kapital',
    spalteRendite: 'Gesamtgewinn',
    spalteBenchmark: 'Vergleich',
    spalteVorgaenge: 'Vorgänge',
    vorgangZelle: (typ: string, wertpapier: string | undefined, betrag: string) =>
      wertpapier === undefined ? `${typ}: ${betrag}` : `${typ} · ${wertpapier}: ${betrag}`,
    keinZeitraum: 'Für diesen Zeitraum liegen keine Daten vor.',
    markenTyp: {
      sparplan: 'Sparplan-Kauf',
      kauf: 'Kauf',
      verkauf: 'Verkauf',
      ertrag: 'Ertrag',
    },
    benchmark: 'Vergleich',
    erklaerungBenchmark:
      'Wie sich dieselben Ein- und Auszahlungen entwickelt hätten, wenn sie am selben Tag in diesen ETF geflossen wären. Gerechnet wird mit dem Kurs des ETF, nicht mit dem Index selbst — laufende Kosten des Fonds sind also enthalten. Steuern, Ordergebühren und Spread sind es nicht.',
    linien: 'Einzahlungen',
    marken: 'Käufe, Verkäufe & Erträge',
    differenz: 'Differenz',
  },

  aufteilung: {
    titel: 'Aufteilung',
    gesamt: 'Gesamt',
    ring: 'Ringdiagramm der Positionen nach Wert',
    tabelle: 'Positionen nach Wert',
    spaltePosition: 'Position',
    spalteArt: 'Art',
    spalteAnteil: 'Anteil',
    spalteWert: 'Wert',
    spalteDetails: 'Details',
    /** Anzeigename je Wertpapierart der Bank; alles andere erscheint unverändert, ohne Art als Strich. */
    art: (art: string | null) => (art === null ? '–' : (ARTEN[art] ?? art)),
    cash: 'Bargeld (Verrechnungskonto)',
    artCash: 'Cash',
    leer: 'Keine Positionen im Bestand.',
    positionWaehlen: (name: string) => `Position ${name} hervorheben`,
    onvista: 'onvista',
    onvistaTitel: 'Details bei onvista',
    onvistaOeffnen: (name: string) => `${name} bei onvista öffnen, neuer Tab`,
  },

  kennzahlen: {
    titel: 'Kennzahlen',
    tabelle: 'Kennzahlen des Depots',
    spalteBezeichnung: 'Kennzahl',
    spalteWert: 'Wert',
    einstand: 'Investiertes Kapital',
    kursgewinn: 'Kursgewinn',
    richtungPfeil: { auf: '▲', ab: '▼' },
    richtungPositiv: 'positiv',
    richtungNegativ: 'negativ',
    realisiert: 'Realisierte Gewinne',
    zinsen: 'Zinsen und Erträge',
    steuern: 'Steuern',
    gebuehren: 'Gebühren',
    twr: 'Marktrendite (TWR) gesamt',
    twrProJahr: 'Marktrendite (TWR) p.a.',
    /** Kurzform fuer die Karte ueber dem Verlauf: die Langform passt dort samt Info-Knopf nicht in eine Zeile. */
    twrProJahrKurz: 'Marktrendite p.a.',
    xirr: 'Interner Zinsfuß (IZF)',
    inflation: 'Ø Inflation p.a.',
    real: 'Realrendite p.a.',
    realUeberTeuerung: 'Ersatzweise über die durchschnittliche Teuerung gerechnet: für die Zahlungsreihe fehlen Indexwerte.',
    inflationLaufendesJahr: (jahr: string, wert: string) => `${jahr} bisher ${wert}`,
    volatilitaet: 'Volatilität p.a.',
    maxDrawdown: 'Maximum Drawdown',
    maxDrawdownKurz: 'Max. Drawdown',
    sharpe: 'Sharpe-Ratio',
    sparrate: 'Ø eingezahltes Kapital pro Monat',
    sparrate12: (wert: string) => `letzte 12 Monate ${wert}`,
    mehrZeigen: 'Mehr zeigen',
    wenigerZeigen: 'Weniger zeigen',
    erklaerung: {
      einstand:
        'Was du für die heute gehaltenen Anteile bezahlt hast, auch Einstand genannt (Kaufpreis samt Kaufkosten). Berechnet nach dem FIFO-Prinzip (First In, First Out): Verkaufst du einen Teil einer Position, gelten dabei zuerst die am längsten gehaltenen Anteile als verkauft. Deshalb ist dieser Wert nicht dasselbe wie das eingezahlte Kapital — bereits verkaufte Anteile zählen nicht mehr mit, und Geld auf dem Verrechnungskonto ist noch nicht in Wertpapiere gekauft.',
      kursgewinn:
        'Der aktuelle Wert der gehaltenen Wertpapiere abzüglich des investierten Kapitals — wie viel deine noch gehaltenen Anteile heute mehr oder weniger wert sind, als du dafür bezahlt hast. Solange du nichts verkauft hast, ist das ein Buchgewinn oder -verlust: Geld, das du noch nicht realisiert hast. Der Prozentwert setzt den Kursgewinn ins Verhältnis zum investierten Kapital, ohne zu berücksichtigen, wie lange das Geld investiert war — anders als bei der Marktrendite (TWR) weiter unten. Nicht zu verwechseln mit dem „Gesamtgewinn“ über dem Verlauf: der rechnet den ganzen Depotwert gegen das eingezahlte Kapital und zählt deshalb auch das Verrechnungskonto, Erträge, Steuern und Gebühren mit.',
      realisiert:
        'Gewinne oder Verluste aus Anteilen, die tatsächlich verkauft wurden — im Unterschied zum Kursgewinn oben also bereits fest, nicht nur auf dem Papier. Abgerechnet nach FIFO: Beim Verkauf gelten die am längsten gehaltenen Anteile einer Position als verkauft, der Gewinn ergibt sich aus deren ursprünglichem Kaufpreis. Ein reiner Depotübertrag — dieselbe ISIN, dieselbe Menge, innerhalb von 30 Tagen hinaus- und wieder hereingebucht — zählt dabei nicht als Verkauf.',
      zinsen:
        'Alle Erträge, die gutgeschrieben wurden, ohne dass dafür etwas verkauft werden musste: Zinsen auf das Verrechnungskonto, Ausschüttungen von Fonds, Dividenden und Boni. Diese Beträge erhöhen den Depotwert, zählen aber nicht zum investierten Kapital — sie sind Ertrag, keine Einzahlung.',
      steuern:
        'Auf Erträge und Verkäufe einbehaltene Steuern — vor allem die jährliche Vorabpauschale auf thesaurierende Fonds —, saldiert mit späteren Erstattungen zu einem einzigen Betrag. Ein negativer Wert heißt: unterm Strich abgeführt.',
      gebuehren:
        'Gebühren, die als eigene Buchung abgerechnet wurden, etwa für ein Abo oder das Depot. Kaufkosten stehen hier nicht: sie stecken im Kaufpreis und damit im investierten Kapital.',
      gesamt: 'Wertpapiere plus Verrechnungskonto zum letzten bekannten Kurs.',
      twr: 'Die Marktrendite ist die zeitgewichtete Rendite (TWR, englisch Time-Weighted Return): sie misst, wie gut die Geldanlage selbst gelaufen ist — unabhängig davon, wann und wie viel du ein- oder ausgezahlt hast. Dafür wird die Anlagedauer an jeder Zahlung in Teilperioden zerlegt, die einzeln berechnet und verkettet werden. „Gesamt“ heißt: über die komplette Anlagedauer gerechnet, nicht auf ein Jahr umgelegt. Dadurch ist die Marktrendite direkt mit einem Index oder Fonds vergleichbar, der ebenfalls keine Ein- und Auszahlungen kennt — anders als der interne Zinsfuß weiter unten, der dein persönliches Timing mit einrechnet. Gemessen wird das ganze Depot einschließlich Guthaben auf dem Verrechnungskonto: Geld, das dort uninvestiert liegt, bremst die Marktrendite in einem steigenden Markt.',
      twrProJahr:
        'Die zeitgewichtete Marktrendite (TWR) von oben, auf ein Jahr umgerechnet, damit sie sich mit anderen Jahresrenditen vergleichen lässt. Bei einer Anlagedauer unter einem Jahr wird nicht hochgerechnet — eine kurze Phase aufs Jahr projiziert würde leicht ein falsches Bild ergeben. Der interne Zinsfuß weiter unten wird dagegen immer aufs Jahr gerechnet, auch bei kurzer Anlagedauer.',
      xirr: 'Der interne Zinsfuß (IZF, englisch XIRR, Extended Internal Rate of Return) ist die geldgewichtete Rendite pro Jahr: sie misst die tatsächliche Rendite auf dein eingezahltes Geld und rechnet mit ein, wann jede einzelne Ein- und Auszahlung stattfand. Das ist die für dich persönlich relevante Zahl — zwei Anleger im selben Fonds können unterschiedliche IZF-Werte haben, je nachdem, wann sie eingezahlt haben. Gerade wegen dieses Timings ist der IZF nicht direkt mit einem Index vergleichbar; dafür eignet sich die Marktrendite oben besser. Der IZF ist immer ein Jahreswert, auch bei einer Anlagedauer unter einem Jahr: dann ist er hochgerechnet und kann viel größer ausfallen als die Marktrendite „gesamt“ — ein Prozent in einem Monat ergibt rund 12,7 % p.a.',
      inflation:
        'Die durchschnittliche Teuerung pro Jahr, gemessen am Verbraucherpreisindex, über den gesamten Anlagezeitraum — vom ersten Zahlungsfluss (oder, falls die Indexreihe später beginnt, von ihrem ersten Monat) bis zum letzten Monat, für den bereits eine amtliche Zahl vorliegt. Also keine Momentaufnahme der aktuellen Inflation, sondern ein Durchschnittswert über die komplette Anlagedauer. Darunter zusätzlich die aktuelle Inflation des laufenden Jahres: der Durchschnitt der bisherigen Monate, jeweils gegen denselben Monat des Vorjahres gerechnet.',
      real: 'Was von der Rendite übrig bleibt, wenn man den Kaufkraftverlust durch Inflation abzieht — also was du wirklich mehr kaufen könntest, nicht nur mehr Euro auf dem Konto hast. Berechnet als interner Zinsfuß, also geldgewichtet, nachdem jede Ein- und Auszahlung mit dem Verbraucherpreisindex ihres Monats in Kaufkraft von heute umgerechnet wurde. So wirkt die Inflation genau auf das Geld, das zu der Zeit tatsächlich angelegt war. Wie der interne Zinsfuß ist sie immer ein Jahreswert, unter einem Jahr Anlagedauer also hochgerechnet.',
      volatilitaet:
        'Wie stark die Marktrendite (TWR) von Monat zu Monat schwankt, statistisch gemessen (Stichproben-Standardabweichung der monatlichen Rendite, mit × √12 auf ein Jahr hochgerechnet). Der laufende Monat zählt erst mit, wenn er vorbei ist. Eine hohe Volatilität bedeutet größere Ausschläge nach oben wie unten — nicht zwangsläufig einen Verlust, aber ein unruhigeres Auf und Ab.',
      maxDrawdown:
        'Der schmerzhafteste Einbruch in der Historie: der größte prozentuale Rückgang vom bisherigen Höchststand bis zum darauffolgenden Tiefpunkt, gemessen an der Marktrendite (TWR). Das gilt unabhängig davon, ob der Verlust längst wieder aufgeholt ist — die Kennzahl zeigt, wie tief es zwischenzeitlich schlimmstenfalls nach unten ging. Für Zeiträume, in denen nur Monatskurse vorliegen, kann der tatsächliche Tiefpunkt tiefer gewesen sein.',
      sharpe: (zinsSatz: string) =>
        `Setzt Rendite und Risiko ins Verhältnis: die Überschussrendite gegenüber dem risikofreien Zins (EZB €STR, im Betrachtungszeitraum durchschnittlich ${zinsSatz} p.a.), geteilt durch die Schwankung dieser Überschussrendite über die Monate, für die ein €STR vorliegt. Dieser Nenner kann daher etwas von der oben gezeigten Volatilität abweichen. Zur Einordnung: unter 0 schneidet die Anlage schlechter ab als der risikofreie Zins. Ein breiter Welt-Aktien-ETF erreicht langfristig etwa 0,3 bis 0,6; Werte über 1 halten selten über viele Jahre und deuten bei kurzer Anlagedauer eher auf eine gute Marktphase hin.`,
      sparrate:
        'Alle Ein- und Auszahlungen von außen — Überweisungen aufs Verrechnungskonto und Depotüberträge von einer anderen Bank, keine Umschichtungen innerhalb des Depots —, saldiert und geteilt durch die Anzahl Monate von der ersten Zahlung bis heute. Monate ohne Zahlung zählen mit null. Das ist etwas anderes als die „Ø Nettokäufe pro Monat“ in der Kachel „Käufe & Verkäufe“: dort geht es um tatsächliche Wertpapierkäufe und -verkäufe, hier um Geld, das von außen kommt oder geht, unabhängig davon, ob du davon Wertpapiere gekauft hast.',
    },
    twrProJahrZuKurz: 'Der Zeitraum ist kürzer als ein Jahr. Ein Jahreswert würde hochgerechnet und wäre irreführend — er wird deshalb nicht gezeigt.',
    maxDrawdownZuWenigDaten: 'Nicht berechenbar: dafür liegen zu wenige Tage mit Kursverlauf vor.',
    maxDrawdownZeitraum: (hoch: string, tief: string) => `${hoch} – ${tief}`,
    sublineProJahr: (wert: string) => `${wert} p.a.`,
    sublineReal: (wert: string) => `Realrendite ${wert}`,
    sublineTwrGesamt: (wert: string) => `Gesamt: ${wert}`,
    sublineXirr: (wert: string) => `IZF nominal: ${wert}`,
    ueberblick: 'Überblick',
    sharpeBewertung: {
      sehrSchlecht: 'Unter risikofrei (< 0)',
      solide: 'Üblich (0–0,6)',
      gut: 'Gut (0,6–1)',
      sehrGut: 'Selten (> 1)',
    },
    twrGrob: 'Teilperioden stammen teilweise aus einem Monatsraster; der Wert ist auf Nachkommastellen nicht belastbar.',
    inflationFehlt: 'Die Teuerung ist unbekannt: der Verbraucherpreisindex konnte nicht geladen werden.',
    realTeuerungBis: (monat: string) =>
      `Ø Teuerung bis ${monat}: für das laufende Jahr liegt noch keine Zahl vor.`,
    realBasis: (monat: string) => `Kaufkraft von ${monat}`,
    realFortgeschrieben: (anzahl: string) =>
      `Für ${anzahl} Monate lag kein Indexwert vor; der jeweils letzte bekannte wurde fortgeschrieben.`,
    anmerkungTeile: (teile: readonly string[]) => teile.join(' '),
    hinweise: 'Hinweise aus der Berechnung',
    detailsOeffnen: (bezeichnung: string) => `Transaktionen anzeigen: ${bezeichnung}`,
    detailsBeschreibung: (bezeichnung: string) => `Einzelne Buchungen zu „${bezeichnung}“.`,
    detailsSpalteDatum: 'Datum',
    detailsSpaltePosition: 'Position',
    detailsSpalteWofuer: 'Wofür',
    detailsSpalteBetrag: 'Betrag',
    detailsLeer: 'Keine Transaktionen in diesem Zeitraum.',
    realisierterVerkauf: 'Realisierter Verkauf',
    ertragsTyp: {
      INTEREST: 'Zinsen',
      TAX: 'Steuerabzug',
      FEE: 'Gebühr',
      TAX_RETURN: 'Steuererstattung',
      DIVIDEND: 'Dividende',
      DISTRIBUTION: 'Ausschüttung',
      BONUS: 'Bonus',
    },
    bezugVerrechnungskonto: 'Verrechnungskonto',
    /** Die Bank hat zu dieser Buchung kein Bezugswertpapier geliefert. */
    bezugUnbekannt: 'ohne Angabe',
  },

  top25: {
    titel: 'Top 25 Unternehmen',
    untertitel: (anteil: string, anzahl: string) => `${anteil} des Depots · Insgesamt ${anzahl} Unternehmen`,
    tabelle: (von: string, bis: string) => `Unternehmen ${von} bis ${bis} nach Exposure`,
    spalteRang: 'Rang',
    spalteName: 'Unternehmen',
    spalteExposure: 'Exposure',
    spalteAnteil: 'Depotanteil',
    spalteEtfs: 'Enthalten in',
    fondsListe: (namen: readonly string[]) => (namen.length === 0 ? '–' : namen.join(', ')),
    mehrZeigen: 'Mehr zeigen',
    wenigerZeigen: 'Weniger zeigen',
    leer: 'Es liegen keine Fondsbestandteile vor.',
    leerAnleitungTitel: 'So bekommst du diese Ansicht',
    leerAnleitungBeschreibung: 'Schritte, um die Fondsliste „funds.json“ anzulegen.',
    /** Steht bei `top25: false` unter den Kennzahlen; einschalten geht nur über die Datei [ADR-038]. */
    ausHinweis: 'Top 25 ist aus — so schaltest du sie ein',
    ausSchritte: [
      `„docs/einstellungen.example.json“ aus dem Scapio-Ordner als „einstellungen.json“ ${DATENORDNER} ablegen. Gibt es die Datei schon, darin die Zeile "top25": true eintragen.`,
      'Scapio neu starten (Start.command bzw. .bat), dann auf „Aktualisieren“ klicken.',
      'Die Anbieter iShares, Xtrackers und Amundi erfahren dann bei jedem Abruf, welche ihrer ETFs du hältst, nicht wie viel.',
    ],
    leerAnleitungSchritte: [
      `„ingest/funds.example.json“ aus dem Scapio-Ordner als „funds.json“ ${DATENORDNER} ablegen.`,
      'Für jeden gehaltenen ETF einen Eintrag mit der ISIN eintragen. Bei „xtrackers“ oder „amundi“ als Anbieter reicht das schon — die Adresse wird automatisch abgefragt.',
      'Bei „ishares“ zusätzlich die Produkt-ID eintragen: Produktseite des Fonds auf ishares.com öffnen → die Zahl hinter „/produkte/“ in der Adressleiste kopieren.',
      'Danach oben auf „Aktualisieren“ klicken.',
    ],

    fehlendeFondsUntertitel: (anzahl: string) => `Details von ${anzahl} Fonds konnten nicht abgerufen werden`,
    fehlendeFondsIsin: (isin: string) => `(${isin})`,
    fehlendeFondsTitel: 'Diese Fonds fehlen in der Auswertung',
    fehlendeFondsBeschreibung: 'Liste der Fonds ohne bekannte Bestandteile, mit Grund je Fonds.',
    fehlendeFondsEinleitung: (abdeckung: string) =>
      `${abdeckung} deines Depots sind aufgeschlüsselt. Bei den folgenden Fonds ist nicht bekannt, welche Unternehmen sie enthalten — sie zählen deshalb in der Top 25 nicht mit.`,
    fehlendeFondsGesperrt: (anbieter: string) =>
      `${anbieter} veröffentlicht nicht, welche Unternehmen im Fonds stecken. Daran lässt sich von hier aus nichts ändern.`,
    fehlendeFondsAbrufGescheitert:
      'Beim letzten Aktualisieren ließ sich die Liste der Unternehmen nicht laden. Meist klappt es beim nächsten „Aktualisieren“ wieder.',
    anbieterName: {
      ishares: 'iShares',
      xtrackers: 'Xtrackers',
      amundi: 'Amundi',
      firsttrust: 'First Trust',
      lgim: 'L&G',
    } as Record<string, string>,
    anbieterUnbekannt: 'Der Anbieter',
    fundsJsonAdressePlatzhalter: 'PRODUKT-ID',
    fundsJsonAnleitungTitel: 'Klappt es dauerhaft nicht? Dann den Fonds von Hand eintragen:',
    fundsJsonAnleitungSchritte: (mitIshares: boolean): readonly string[] => [
      'Beim Fonds oben auf „Eintrag kopieren“ klicken.',
      `Die Datei „funds.json“ ${DATENORDNER} öffnen. Gibt es sie noch nicht, „ingest/funds.example.json“ aus dem Scapio-Ordner dorthin kopieren und so umbenennen.`,
      'Den Eintrag in die Liste unter „fonds“ einfügen.',
      ...(mitIshares
        ? ['Bei iShares „PRODUKT-ID“ ersetzen: die Produktseite des Fonds auf ishares.com öffnen und die Zahl hinter „/produkte/“ aus der Adressleiste übernehmen.']
        : []),
      'Datei speichern und oben auf „Aktualisieren“ klicken.',
    ],
    fundsJsonKopierenKnopf: 'Eintrag kopieren',
    fundsJsonKopiert: 'In die Zwischenablage kopiert.',
  },

  fluesse: {
    titel: 'Käufe & Verkäufe',
    fenster: 'Zeitfenster',
    fensterKurz: { '3m': '3M', '6m': '6M', '12m': '1J', '36m': '3J', '60m': '5J', max: 'MAX' },
    fensterLang: {
      '3m': 'drei Monate',
      '6m': 'sechs Monate',
      '12m': '12 Monate',
      '36m': 'drei Jahre',
      '60m': 'fünf Jahre',
      max: 'gesamte Historie',
    },
    netto: 'Nettokäufe',
    schnitt: 'Ø Nettokäufe pro Monat',
    chart: (fenster: string) =>
      `Balkendiagramm der Nettokäufe von Wertpapieren je Monat, ${fenster}, mit Durchschnittslinie.`,
    tabelle: 'Nettokäufe je Monat',
    spalteMonat: 'Monat',
    spalteNetto: 'Nettokäufe',
    leer: 'Es sind keine Käufe oder Verkäufe bekannt.',
  },

  sparplaene: {
    titel: 'Sparpläne',
    tabelle: 'Aktive Sparpläne',
    spaltePlan: 'Plan',
    spalteBetrag: 'Betrag',
    summe: 'Summe',
    leer: 'Es sind keine Sparpläne aktiv.',
    amTag: (tag: string) => `am ${tag}`,
  },

  frequenz: {
    MONTHLY: 'monatlich',
    QUARTERLY: 'vierteljährlich',
    WEEKLY: 'wöchentlich',
    BIWEEKLY: 'zweiwöchentlich',
    YEARLY: 'jährlich',
  },

  dialog: {
    schliessen: 'Schließen',
  },

  fehler: {
    netz: 'Der lokale Server antwortet nicht.',
    netzHinweis: 'Scapio neu starten (Start.command bzw. .bat oder „npm start“), dann die Seite neu laden.',
    format: 'Die Antwort des Servers war nicht lesbar. Lade die Seite neu; bleibt der Fehler, starte Scapio neu.',
    unbekannt: 'Unbekannter Fehler.',
  },

  erklaerungOeffnen: 'Erklärung anzeigen',
} as const;
