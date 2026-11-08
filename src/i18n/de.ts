/*
 * Alle sichtbaren Texte an einer Stelle.
 *
 * Nicht wegen Mehrsprachigkeit — die kommt nie —, sondern weil sich Formulierungen
 * nur so einheitlich halten und einmal am Stueck lesen lassen. Kein sichtbarer Text
 * steht in einer Komponente, auch keine Einheit und kein "Laedt…". [P-06]
 *
 * Funktionen sind erlaubt, wo ein Satz einen Wert einbaut. Die Werte kommen fertig
 * formatiert aus `lib/format.ts` herein — hier wird nicht gerechnet und nicht gerundet.
 *
 * Die beiden laengsten Teilbaeume stehen daneben (`laufhinweise.ts`, `kennzahlen.ts`);
 * gelesen wird trotzdem nur `de`.
 */

import type { LaufSchritt } from '../../server/vertrag.ts';
import { landKuerzel } from '../lib/laender.ts';
import { DATENORDNER, type CodeTexte } from './bausteine.ts';
import { kennzahlen } from './kennzahlen.ts';
import { laufhinweise } from './laufhinweise.ts';

/** Angezeigter Name je Länderkürzel aus `lib/laender.ts`; Unbekanntes erscheint unverändert. */
const LAENDER: Readonly<Partial<Record<string, string>>> = {
  us: 'USA',
  gb: 'Großbritannien',
  jp: 'Japan',
  ca: 'Kanada',
  fr: 'Frankreich',
  de: 'Deutschland',
  ch: 'Schweiz',
  nl: 'Niederlande',
  au: 'Australien',
  cn: 'China',
  tw: 'Taiwan',
  in: 'Indien',
  kr: 'Südkorea',
  dk: 'Dänemark',
  se: 'Schweden',
  it: 'Italien',
  es: 'Spanien',
  ie: 'Irland',
  be: 'Belgien',
  fi: 'Finnland',
  no: 'Norwegen',
  at: 'Österreich',
  pt: 'Portugal',
  pl: 'Polen',
  lu: 'Luxemburg',
  il: 'Israel',
  hk: 'Hongkong',
  sg: 'Singapur',
  br: 'Brasilien',
  mx: 'Mexiko',
  za: 'Südafrika',
  sa: 'Saudi-Arabien',
  ae: 'Vereinigte Arabische Emirate',
  id: 'Indonesien',
  th: 'Thailand',
  my: 'Malaysia',
  nz: 'Neuseeland',
  ky: 'Kaimaninseln',
};

/** GICS-Sektoren der Fondsanbieter auf Deutsch; Unbekanntes erscheint unverändert. */
const SEKTOREN: Readonly<Partial<Record<string, string>>> = {
  'information technology': 'IT',
  financials: 'Finanzen',
  'health care': 'Gesundheit',
  'consumer discretionary': 'Zyklischer Konsum',
  'consumer staples': 'Basiskonsumgüter',
  communication: 'Kommunikation',
  'communication services': 'Kommunikation',
  industrials: 'Industrie',
  energy: 'Energie',
  materials: 'Rohstoffe',
  utilities: 'Versorger',
  'real estate': 'Immobilien',
  'cash and/or derivatives': 'Cash und Derivate',
};

/** Bekannte Wertpapierarten der Bank (`securityType`); weitere Werte erscheinen unverändert. */
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
    willkommenTitel: 'Willkommen bei Scapio',
    willkommen:
      'Noch sind keine Daten da. „Aktualisieren“ holt Bestand, Umsätze und Kurse von Scalable Capital; der erste Abruf dauert etwas länger.',
    stand: (zeitpunkt: string) => `Stand ${zeitpunkt}`,
    fussVersion: (version: string) => `Version ${version.split('.').slice(0, 2).join('.')}`,
    fussReadme: 'Readme',
    fussReadmeOeffnen: 'Readme von Scapio auf GitHub öffnen, neuer Tab',
    fussVersionen: 'Versionen',
    fussVersionenOeffnen: 'Versionen von Scapio auf GitHub öffnen, neuer Tab',
    fussLizenzen: 'Lizenzen',
    fussLizenzenOeffnen: 'Lizenzen der verwendeten Pakete öffnen, neuer Tab',
    fussHinweis:
      'Kein Angebot von Scalable Capital und keine Anlageberatung. Maßgeblich sind allein die Abrechnungen der Bank.',
    fussQuellen: 'Quellen:',
    fussScalable: 'Scalable Capital (Kurse)',
    fussScalableOeffnen: 'Scalable Capital öffnen, neuer Tab',
    fussEurostat: 'Eurostat (Inflation)',
    fussEurostatOeffnen: 'Jährliche Inflationsraten (HVPI) bei Eurostat öffnen, neuer Tab',
    fussEzb: 'EZB (Zins)',
    fussEzbOeffnen: '€STR-Zeitreihe im Datenportal der EZB öffnen, neuer Tab',
  },

  /** Zeichensetzung um fertige Werte — Bezeichnung mit Doppelpunkt, Nebenwert in Klammern. */
  satz: {
    beschriftung: (bezeichnung: string) => `${bezeichnung}:`,
    beschriftet: (bezeichnung: string, wert: string) => `${bezeichnung}: ${wert}`,
    inKlammern: (wert: string) => `(${wert})`,
    mitNebenwert: (hauptwert: string, nebenwert: string) => `${hauptwert} (${nebenwert})`,
    trenner: ' · ',
  },

  pfeil: {
    ab: '',
  },

  zustand: {
    laedt: 'Lädt…',
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

  laufhinweise,

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
    E_WAEHRUNG:
      'Scalable Capital hat einen Betrag in einer anderen Währung als Euro geliefert. Scapio rechnet nur in Euro und hat nichts übernommen. Hole mit Aktualisieren.command bzw. .bat die neueste Version von Scapio.',
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
      'Die Anmeldung bei Scalable Capital ist abgelaufen. Sie gilt aus Sicherheitsgründen nur eine Woche, danach musst du dich erneut anmelden. Klappt das nicht, prüfe, ob in deinem Konto unter „Agentic Investing“ der MCP-Zugang aktiviert ist.',
    /** Beschriftung des Action-Buttons im Alert selbst; den Rahmen nennt der Alert-Titel. */
    anmeldenKnopf: 'Anmelden',
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

  drift: {
    titelBanner: 'Die Selbstkontrolle meldet eine Abweichung',
    titelAbbruch: 'Die Rekonstruktion stimmt nicht mit dem gemeldeten Bestand überein',
    titelAusgesetzt: 'Die Selbstkontrolle war nicht möglich',
    /** Was die Live-Region des Banners ansagt: Titel und Satz in einem. */
    ansage: (titel: string, text: string) => `${titel}. ${text}`,
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
    nicht_eindeutig:
      'Nicht berechenbar: Ein- und Auszahlungen wechseln sich so ab, dass mehrere Renditen rechnerisch richtig sind und keine davon vorzuziehen ist.',
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
      '1m': '1M',
      ytd: 'YTD',
      '1j': '1J',
      '3j': '3J',
      '5j': '5J',
      max: 'MAX',
    },
    zeitraumEigen: 'Von–bis',
    zeitraumLang: {
      '1m': 'ein Monat',
      ytd: 'seit Jahresbeginn',
      '1j': 'ein Jahr',
      '3j': 'drei Jahre',
      '5j': 'fünf Jahre',
      max: 'gesamte Historie',
    },
    zeitraumFrei: (von: string, bis: string) => `vom ${von} bis ${bis}`,
    drawdownZeigen: 'Max. Drawdown im Verlauf zeigen',
    drawdownImChart: (wert: string, zeitraum: string) => ` Markiert: Max. Drawdown von ${wert}, ${zeitraum}.`,
    reglerBezeichnung: 'Zeitraum frei wählen',
    reglerBeginn: 'Beginn des Zeitraums',
    reglerEnde: 'Ende des Zeitraums',
    reglerDemo: 'In der Demo nicht verfügbar',
    depotwert: 'Depotwert',
    einzahlung: 'Eingezahltes Kapital',
    /** Kopfzeile über dem Chart, in beiden Modi; der Zeitraum steht in der Zeitraumwahl daneben. */
    gesamtgewinnDepot: 'Gesamtgewinn Depot',
    /** Kurzform in der Rendite-Ansicht, wo Prozent vor dem Betrag steht. */
    depot: 'Depot',
    erklaerungGesamtgewinnZeitraum:
      'Wie viel Gesamtgewinn im gewählten Zeitraum dazugekommen ist: der Gesamtgewinn am Ende des Zeitraums minus dem an seinem Anfang. Der Prozentwert setzt ihn ins Verhältnis zum gesamten eingezahlten Kapital am Ende des Zeitraums — nicht nur zu dem, was im Zeitraum dazukam. Mit Einzahlungen im Zeitraum fällt er deshalb anders aus als die Marktrendite (TWR) desselben Zeitraums. Chart und Tooltip zählen ebenfalls ab Beginn des Zeitraums, am letzten Tag stimmen sie mit dieser Zahl überein. Gesamtgewinn heißt dabei Depotwert minus eingezahltes Kapital, also inklusive Verrechnungskonto, Erträgen, Steuern und Gebühren — anders als der „Kursgewinn“ in der Karte oben, der nur die heute gehaltenen Wertpapiere mit dem investierten Kapital vergleicht.',
    erklaerungDifferenz:
      'Gesamtgewinn Depot minus Gewinn des Vergleichs im gewählten Zeitraum. Positiv heißt: Das Depot war besser als die Anlage in den Vergleich.',
    /** Hinter der Differenz-Badge: „↑ 474 € (2,26 %) mehr als MSCI ACWI“. */
    vergleichSatz: (differenz: number, benchmark: string) =>
      differenz > 0 ? `mehr als ${benchmark}` : differenz < 0 ? `weniger als ${benchmark}` : `genau wie ${benchmark}`,
    risikofreiKurz: '€STR',
    risikofreiOeffnen: '€STR-Zeitreihe im Datenportal der EZB öffnen, neuer Tab',
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
    spalteRendite: 'Gesamtgewinn in %',
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
    linien: 'Einzahlungen',
    marken: 'Käufe, Verkäufe & Erträge',
    differenz: 'Differenz',
    jahreReiter: 'Jahre',
    jahre: {
      tabelle: 'Jahresübersicht: Marktrendite, IZF, Inflation und Geldflüsse je Kalenderjahr',
      spalteJahr: 'Jahr',
      spalteRendite: 'Marktrendite (TWR)',
      spalteVergleich: (benchmark: string) => `Vergleich ${benchmark}`,
      spalteIzf: 'Interner Zinsfuß',
      spalteInflation: 'Inflation',
      spalteReal: 'Realrendite',
      spalteGewinn: 'Gesamtgewinn',
      spalteEinzahlung: 'Einzahlungen',
      spalteEndwert: 'Depotwert am Jahresende',
      ab: (tag: string) => `(ab ${tag})`,
      bis: (tag: string) => `(bis ${tag})`,
      abBis: (ab: string, bis: string) => `(${ab} bis ${bis})`,
      ohneRendite: 'Ohne Depotwert zu Beginn des Jahres lässt sich keine Rendite berechnen.',
      ohneVergleich: (benchmark: string) => `Für ${benchmark} gibt es in diesem Jahr keine Kurse.`,
      ohneInflation: 'Für dieses Jahr fehlt der Preisindex von Eurostat.',
      ohneIzf: 'Für diese Zahlungsreihe lässt sich kein interner Zinsfuß berechnen.',
      realOhneIzf: 'Ohne IZF keine Realrendite.',
      realOhneInflation: 'Ohne Inflation keine Realrendite.',
      /** Wofür eine Erklärung in der Tabelle gilt, für das aria-label des Info-Knopfs. */
      grundZu: (spalte: string, jahr: string) => `${spalte} ${jahr}`,
      inflationBis: (monat: string) => `Inflation bis ${monat}, neuere Monate sind noch nicht veröffentlicht.`,
      leer: 'Noch kein Kalenderjahr in der Historie.',
    },
  },

  aufteilung: {
    titel: 'Aufteilung',
    /** Reiter rechts oben, nur mit Look-Through (ADR-060). */
    ansicht: 'Ansicht',
    reiterAufteilung: 'Aufteilung',
    reiterAnalyse: 'Analyse',
    analyseTitel: 'Analyse',
    gesamt: 'Gesamt',
    ring: 'Ringdiagramm der Positionen nach Wert',
    tabelle: 'Positionen nach Wert',
    spaltePosition: 'Position',
    spalteArt: 'Art',
    spalteAnteil: 'Anteil',
    spalteWert: 'Wert',
    spalteGewinn: 'Kursgewinn',
    spalteDetails: 'Details',
    /** Anzeigename je Wertpapierart der Bank; alles andere erscheint unverändert, ohne Art als Strich. */
    art: (art: string | null) => (art === null ? '–' : (ARTEN[art] ?? art)),
    cash: 'Bargeld (Verrechnungskonto)',
    artCash: 'Cash',
    leer: 'Keine Positionen im Bestand.',
    hervorheben: (name: string) => `${name} hervorheben`,
    onvistaTitel: 'Details bei onvista',
    onvistaOeffnen: (name: string) => `${name} bei onvista öffnen, neuer Tab`,
  },

  rebalancing: {
    knopf: 'Rebalancing',
    titel: 'Rebalancing',
    beschreibung: 'Zielaufteilung eingeben und je Zeile den Betrag zum Ziel berechnen.',
    tabelle: 'Zielaufteilung und Betrag zum Ziel',
    spaltePosition: 'Position',
    spalteIstWert: 'Ist €',
    spalteIstAnteil: 'Ist %',
    spalteZiel: 'Ziel %',
    spalteAbweichung: 'Abweichung',
    spalteBetrag: 'Betrag zum Ziel',
    konto: 'Bargeld (Verrechnungskonto)',
    einbeziehen: (name: string) => `${name} in die Rechnung einbeziehen`,
    nichtsEinbezogen: 'Mindestens eine Zeile muss in die Rechnung eingehen.',
    istKurz: (wert: string, anteil: string) => `${wert} · ${anteil}`,
    zielFeld: (name: string) => `Zielanteil ${name} in Prozent`,
    feldUngueltig: 'Jeder Zielanteil ist eine Zahl von 0 bis 100 mit höchstens einer Nachkommastelle.',
    summe: 'Summe',
    summeFehlt: (differenz: string) => `Noch ${differenz} zu verteilen, bis die Summe 100 % ergibt.`,
    summeZuViel: (differenz: string) => `${differenz} zu viel verteilt, die Summe muss 100 % ergeben.`,
    berechnen: 'Berechnen',
    richtung: {
      kaufen: 'kaufen',
      verkaufen: 'verkaufen',
      aufsKonto: 'aufs Konto',
      vomKonto: 'vom Konto',
    },
    betrag: (wert: string, richtung: string) => `${wert} ${richtung}`,
    laedt: 'Wird berechnet …',
    ohneWert: 'Die einbezogenen Zeilen haben keinen Wert, es gibt nichts aufzuteilen.',
    driftBanner: 'Die Selbstkontrolle weicht ab: die Ist-Werte können ungenau sein.',
    driftAbbruch: 'Die Ist-Werte stimmen nicht mit der Bank überein, deshalb zeigt der Rechner kein Ergebnis.',
    gesperrt: 'In der öffentlichen Demo ist das Beispielziel fest.',
  },

  kennzahlen,

  top25: {
    laender: 'Länder',
    sektoren: 'Sektoren',
    unternehmen: 'Unternehmen',
    /** Feld der Treemap für das Depot ausserhalb der Top 25. */
    andere: 'Andere',
    andereHinweis: 'Alles außerhalb der Top 25, auch Cash und nicht durchschaute Positionen',
    andereAnzahl: (anzahl: string, mindestens: boolean) => `${mindestens ? 'mindestens ' : ''}${anzahl} Unternehmen`,
    andereWerte: (anteil: string, exposure: string) => `${anteil} · ${exposure}`,
    ringLaender: 'Ringdiagramm der Länder nach Exposure',
    ringSektoren: 'Ringdiagramm der Sektoren nach Exposure',
    tabelleLaender: 'Länder nach Exposure',
    tabelleSektoren: 'Sektoren nach Exposure',
    spalteLand: 'Land',
    spalteSektor: 'Sektor',
    /** `null` sammelt alles ausserhalb der grössten Gruppen und alles ohne Angabe. */
    land: (name: string | null) => (name === null ? 'Übrige' : (LAENDER[landKuerzel(name) ?? ''] ?? name)),
    sektor: (name: string | null) => (name === null ? 'Übrige' : (SEKTOREN[name.toLowerCase()] ?? name)),
    tabelle: (von: string, bis: string) => `Unternehmen ${von} bis ${bis} nach Exposure`,
    spalteRang: 'Rang',
    /** Sichtbarer Kopf der schmalen Rang-Spalte; vorgelesen wird `spalteRang`. */
    spalteRangKurz: '#',
    treemap: 'Treemap der 25 größten Unternehmen und des übrigen Depots nach Exposure, gefärbt nach Sektor',
    tabelleTreemap: 'Die 25 größten Unternehmen mit Sektor, dazu der Rest des Depots',
    treemapWerte: (anteil: string, exposure: string) => `${anteil} des Depots · ${exposure}`,
    spalteName: 'Unternehmen',
    spalteExposure: 'Exposure',
    spalteAnteil: 'Anteil',
    /** Woher das Exposure kommt; ein Eintrag mit der ISIN des Unternehmens ist die direkt gehaltene Aktie. */
    fondsListe: (ausFonds: readonly { readonly isin: string; readonly name?: string }[], unternehmenIsin: string) =>
      ausFonds.length === 0
        ? '–'
        : ausFonds.map((f) => (f.isin === unternehmenIsin ? 'Direktanlage' : (f.name ?? f.isin))).join(', '),
    /** Für Screenreader in der Zeile; sehend steht die Liste in der Hover-Karte. */
    fondsHinweis: (liste: string) => `, enthalten in ${liste}`,
    mehrZeigen: 'Mehr zeigen',
    wenigerZeigen: 'Weniger zeigen',
    leer: 'Es liegen keine Fondsbestandteile vor.',
    leerAnleitungTitel: 'Analyseansicht hinzufügen',
    leerAnleitungBeschreibung: 'Schritte, um die Fondsliste „funds.json“ anzulegen.',
    leerAnleitungSchritte: [
      `„ingest/funds.example.json“ aus dem Scapio-Ordner als „funds.json“ ${DATENORDNER} ablegen.`,
      'Für jeden gehaltenen ETF einen Eintrag mit der ISIN eintragen. Bei „xtrackers“ oder „amundi“ als Anbieter reicht das schon — die Adresse wird automatisch abgefragt.',
      'Bei „ishares“ zusätzlich die Produkt-ID eintragen: Produktseite des Fonds auf ishares.com öffnen → die Zahl hinter „/produkte/“ in der Adressleiste kopieren. Beispiel: ishares.com/de/privatanleger/de/produkte/251882/… → „251882“.',
      'Danach oben auf „Aktualisieren“ klicken.',
    ],
    leerAnleitungAndereAnbieter:
      'Nur ETFs von iShares, Xtrackers und Amundi lassen sich aufschlüsseln. Für ETFs anderer Anbieter ist die Analyse leider nicht möglich.',

    fehlendeFondsIsin: (isin: string) => `(${isin})`,
    fehlendeFondsTitel: 'Diese Fonds fehlen in der Auswertung',
    fehlendeFondsBeschreibung: 'Liste der Fonds ohne bekannte Bestandteile, mit Grund je Fonds.',
    fehlendeFondsEinleitung: (abdeckung: string) =>
      `${abdeckung} deines Depots sind aufgeschlüsselt. Bei den folgenden Fonds ist nicht bekannt, welche Unternehmen sie enthalten — sie zählen deshalb bei Ländern, Sektoren und Unternehmen nicht mit.`,
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

  gewinnquellen: {
    titel: 'Gewinne & Abzüge',
    abzuege: 'Abzüge',
    brutto: 'Vor Abzügen',
    /** Dieselbe Zahl wie der Gesamtgewinn über dem Verlauf, gezählt seit dem ersten Kauf. [ADR-062] */
    nettogewinn: 'Gesamtgewinn',
    nettoverlust: 'Gesamtverlust',
    ertraege: 'Erträge',
    steuern: 'Steuern',
    gebuehren: 'Gebühren',
    /** Rest gegen den Gesamtgewinn: Buchungen ohne Topf, etwa unbekannter Art. [ADR-062] */
    nichtZugeordnet: 'Nicht zugeordnet',
    uebrige: (anzahl: number) => `${anzahl} weitere`,
    realisiert: 'Realisiert',
    nichtsRealisiert: 'Noch nichts verkauft: Der Gewinn steht bisher nur im Kurs.',
    betragUndAnteil: (betrag: string, anteil: string) => `${betrag} · ${anteil}`,
    chart: (netto: string) =>
      `Flussdiagramm: Gewinne und Erträge je Herkunft fließen zusammen und teilen sich in Gesamtgewinn (${netto}), Verluste, Steuern und Gebühren.`,
    tabelle: 'Herkunft des Gewinns',
    spalteHerkunft: 'Herkunft',
    spalteBetrag: 'Betrag',
    spalteAnteil: 'Anteil',
    leer: 'Es gibt noch keinen Gewinn oder Verlust, der sich zuordnen ließe.',
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

  hinweisKnopf: {
    anzahl: (anzahl: number, text: string) => (anzahl === 1 ? '1 Hinweis' : `${text} Hinweise`),
  },

  dialog: {
    schliessen: 'Schließen',
    benachrichtigungen: 'Benachrichtigungen',
  },

  fehler: {
    netz: 'Der lokale Server antwortet nicht.',
    netzHinweis: 'Scapio neu starten (Start.command bzw. .bat oder „npm start“), dann die Seite neu laden.',
    format: 'Die Antwort des Servers war nicht lesbar. Lade die Seite neu; bleibt der Fehler, starte Scapio neu.',
    unbekannt: 'Unbekannter Fehler.',
  },

  erklaerungOeffnen: 'Erklärung anzeigen',
} as const;
