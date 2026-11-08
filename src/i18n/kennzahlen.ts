/* `de.kennzahlen`: Kennzahlenkarten, ihre Erklaerungen und Hinweise, eingehaengt in `de.ts`. */

import type { HinweisCode } from '../../server/vertrag.ts';
import { JUNGE_SPANNE_TAGE } from '../../server/vertrag.ts';

export const kennzahlen = {
  einstand: 'Investiertes Kapital',
  kursgewinn: 'Kursgewinn',
  richtungPfeil: { auf: '▲', ab: '▼' },
  richtungPositiv: 'positiv',
  richtungNegativ: 'negativ',
  realisiert: 'Realisierte Gewinne',
  twr: 'Marktrendite (TWR) gesamt',
  /** Kurzform fuer die Karte ueber dem Verlauf: die Langform passt dort samt Info-Knopf nicht in eine Zeile. */
  twrProJahrKurz: 'Marktrendite p.a.',
  xirr: 'Interner Zinsfuß (IZF)',
  inflation: 'Ø Inflation p.a.',
  real: 'Realrendite p.a.',
  realUeberTeuerung: 'Ersatzweise über die durchschnittliche Teuerung gerechnet: für die Zahlungsreihe fehlen Indexwerte.',
  inflationLaufendesJahr: (jahr: string, wert: string) => `${jahr} bisher ${wert}`,
  volatilitaet: 'Volatilität p.a.',
  maxDrawdownKurz: 'Max. Drawdown',
  sharpe: 'Sharpe-Ratio',
  erklaerung: {
    einstand:
      'Was du für die heute gehaltenen Anteile bezahlt hast, auch Einstand genannt (Kaufpreis samt Kaufkosten). Berechnet nach dem FIFO-Prinzip (First In, First Out): Verkaufst du einen Teil einer Position, gelten dabei zuerst die am längsten gehaltenen Anteile als verkauft. Deshalb ist dieser Wert nicht dasselbe wie das eingezahlte Kapital — bereits verkaufte Anteile zählen nicht mehr mit, und Geld auf dem Verrechnungskonto ist noch nicht in Wertpapiere gekauft.',
    kursgewinn:
      'Der aktuelle Wert der gehaltenen Wertpapiere abzüglich des investierten Kapitals — wie viel deine noch gehaltenen Anteile heute mehr oder weniger wert sind, als du dafür bezahlt hast. Solange du nichts verkauft hast, ist das ein Buchgewinn oder -verlust: Geld, das du noch nicht realisiert hast. Der Prozentwert setzt den Kursgewinn ins Verhältnis zum investierten Kapital, ohne zu berücksichtigen, wie lange das Geld investiert war — anders als bei der Marktrendite. Nicht zu verwechseln mit dem „Gesamtgewinn“ über dem Verlauf: der rechnet den ganzen Depotwert gegen das eingezahlte Kapital und zählt deshalb auch das Verrechnungskonto, Erträge, Steuern und Gebühren mit.',
    realisiert:
      'Gewinne oder Verluste aus Anteilen, die tatsächlich verkauft wurden — im Unterschied zum Kursgewinn also bereits fest, nicht nur auf dem Papier. Abgerechnet nach FIFO: Beim Verkauf gelten die am längsten gehaltenen Anteile einer Position als verkauft, der Gewinn ergibt sich aus deren ursprünglichem Kaufpreis. Ein reiner Depotübertrag — dieselbe ISIN, dieselbe Menge, innerhalb von 30 Tagen hinaus- und wieder hereingebucht — zählt dabei nicht als Verkauf.',
    gesamt: 'Wertpapiere plus Verrechnungskonto zum letzten bekannten Kurs.',
    twr: 'Die Marktrendite ist die zeitgewichtete Rendite (TWR, englisch Time-Weighted Return): sie misst, wie gut die Geldanlage selbst gelaufen ist — unabhängig davon, wann und wie viel du ein- oder ausgezahlt hast. Dafür wird die Anlagedauer an jeder Zahlung in Teilperioden zerlegt, die einzeln berechnet und verkettet werden. „Gesamt“ heißt: über die komplette Anlagedauer gerechnet, nicht auf ein Jahr umgelegt. Dadurch ist die Marktrendite direkt mit einem Index oder Fonds vergleichbar, der ebenfalls keine Ein- und Auszahlungen kennt — anders als der interne Zinsfuß, der dein persönliches Timing mit einrechnet. Gemessen wird das ganze Depot einschließlich Guthaben auf dem Verrechnungskonto: Geld, das dort uninvestiert liegt, bremst die Marktrendite in einem steigenden Markt.',
    twrProJahr:
      'Die zeitgewichtete Marktrendite (TWR), auf ein Jahr umgerechnet, damit sie sich mit anderen Jahresrenditen vergleichen lässt. Bei einer Anlagedauer unter einem Jahr wird nicht hochgerechnet — eine kurze Phase aufs Jahr projiziert würde leicht ein falsches Bild ergeben. Der interne Zinsfuß wird dagegen immer aufs Jahr gerechnet, auch bei kurzer Anlagedauer.',
    xirr: 'Der interne Zinsfuß (IZF, englisch XIRR, Extended Internal Rate of Return) ist die geldgewichtete Rendite pro Jahr: sie misst die tatsächliche Rendite auf dein eingezahltes Geld und rechnet mit ein, wann jede einzelne Ein- und Auszahlung stattfand. Das ist die für dich persönlich relevante Zahl — zwei Anleger im selben Fonds können unterschiedliche IZF-Werte haben, je nachdem, wann sie eingezahlt haben. Gerade wegen dieses Timings ist der IZF nicht direkt mit einem Index vergleichbar; dafür eignet sich die Marktrendite besser. Der IZF ist immer ein Jahreswert, auch bei einer Anlagedauer unter einem Jahr: dann ist er hochgerechnet und kann viel größer ausfallen als die Marktrendite „gesamt“ — ein Prozent in einem Monat ergibt rund 12,7 % p.a.',
    inflation:
      'Die durchschnittliche Teuerung pro Jahr, gemessen am Verbraucherpreisindex, über den gesamten Anlagezeitraum — vom ersten Zahlungsfluss (oder, falls die Indexreihe später beginnt, von ihrem ersten Monat) bis zum letzten Monat, für den bereits eine amtliche Zahl vorliegt. Also keine Momentaufnahme der aktuellen Inflation, sondern ein Durchschnittswert über die komplette Anlagedauer. Im Hinweis darunter steht zusätzlich die Inflation des laufenden Jahres: der Durchschnitt der bisherigen Monate, jeweils gegen denselben Monat des Vorjahres gerechnet.',
    real: 'Was von der Rendite übrig bleibt, wenn man den Kaufkraftverlust durch Inflation abzieht — also was du wirklich mehr kaufen könntest, nicht nur mehr Euro auf dem Konto hast. Berechnet als interner Zinsfuß, also geldgewichtet, nachdem jede Ein- und Auszahlung mit dem Verbraucherpreisindex ihres Monats in Kaufkraft von heute umgerechnet wurde. So wirkt die Inflation genau auf das Geld, das zu der Zeit tatsächlich angelegt war. Wie der interne Zinsfuß ist sie immer ein Jahreswert, unter einem Jahr Anlagedauer also hochgerechnet.',
    volatilitaet:
      'Wie stark die Marktrendite (TWR) von Monat zu Monat schwankt, statistisch gemessen (Stichproben-Standardabweichung der monatlichen Rendite, mit × √12 auf ein Jahr hochgerechnet). Der laufende Monat zählt erst mit, wenn er vorbei ist. Eine hohe Volatilität bedeutet größere Ausschläge nach oben wie unten — nicht zwangsläufig einen Verlust, aber ein unruhigeres Auf und Ab.',
    maxDrawdown:
      'Der schmerzhafteste Einbruch in der Historie: der größte prozentuale Rückgang vom bisherigen Höchststand bis zum darauffolgenden Tiefpunkt, gemessen an der Marktrendite (TWR). Das gilt unabhängig davon, ob der Verlust längst wieder aufgeholt ist — die Kennzahl zeigt, wie tief es zwischenzeitlich schlimmstenfalls nach unten ging. Für Zeiträume, in denen nur Monatskurse vorliegen, kann der tatsächliche Tiefpunkt tiefer gewesen sein.',
    sharpe: (zinsSatz: string) =>
      `Setzt Rendite und Risiko ins Verhältnis: die Überschussrendite gegenüber dem risikofreien Zins (EZB €STR, im Betrachtungszeitraum durchschnittlich ${zinsSatz} p.a.), geteilt durch die Schwankung dieser Überschussrendite über die Monate, für die ein €STR vorliegt. Dieser Nenner kann daher etwas von der Volatilität unter dem Max. Drawdown abweichen. Zur Einordnung: unter 0 schneidet die Anlage schlechter ab als der risikofreie Zins. Ein breiter Welt-Aktien-ETF erreicht langfristig etwa 0,3 bis 0,6; Werte über 1 halten selten über viele Jahre und deuten bei kurzer Anlagedauer eher auf eine gute Marktphase hin.`,
  },
  twrProJahrZuKurz: 'Der Zeitraum ist kürzer als ein Jahr. Ein Jahreswert würde hochgerechnet und wäre irreführend — er wird deshalb nicht gezeigt.',
  maxDrawdownZuWenigDaten: 'Nicht berechenbar: dafür liegen zu wenige Tage mit Kursverlauf vor.',
  maxDrawdownZeitraum: (hoch: string, tief: string) => `${hoch} – ${tief}`,
  sublineInvestiert: (wert: string) => `Investiert: ${wert}`,
  sublineTwrGesamt: (wert: string) => `Gesamt: ${wert}`,
  sublineReal: (izf: string, inflation: string) => `IZF: ${izf} – Inflat.: ${inflation}`,
  sublineVolatilitaet: (wert: string) => `Volatilität: ${wert} p.a.`,
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
  /**
   * Je Kennzahlen-Hinweis ein Satz für den Hinweis-Dialog. `H_KEIN_VPI` und `H_DRIFT_AUSGESETZT`
   * fehlen bewusst: die Inflationsangabe der Realrendite-Karte und das Drift-Banner sagen das schon.
   */
  hinweis: {
    H_UNBEKANNTER_TYP: (anzahl: number, text: string) =>
      anzahl === 1
        ? 'Eine unbekannte Buchungsart zählt mit ihrem Betrag als Gewinn oder Verlust, nicht als Einzahlung, und ändert damit die Rendite. Unter „Gewinne & Abzüge“ steht sie bei „Nicht zugeordnet“.'
        : `${text} unbekannte Buchungsarten zählen mit ihrem Betrag als Gewinn oder Verlust, nicht als Einzahlung, und ändern damit die Rendite. Unter „Gewinne & Abzüge“ stehen sie bei „Nicht zugeordnet“.`,
    H_KURSLUECKE: (anzahl: number, text: string) =>
      `In den letzten ${JUNGE_SPANNE_TAGE} Tagen fehlten ${anzahl === 1 ? 'an einem Tag' : `an ${text} Tagen`} vollständige Kurse; der Verlauf ist dort geschätzt.`,
    H_AUSBUCHUNG: (anzahl: number, text: string) =>
      `${anzahl === 1 ? 'Ein Abgang ohne Betrag und ohne Zugang am selben Tag zählt' : `${text} Abgänge ohne Betrag und ohne Zugang am selben Tag zählen`} als Totalverlust, eine spätere Einbuchung als geschenkte Anteile. Meist steckt ein über mehrere Tage gebuchter ISIN-Wechsel dahinter; Kursgewinn und Rendite der Position sind dann verzerrt.`,
    H_UEBERVERKAUF: (anzahl: number, text: string) =>
      `${anzahl === 1 ? 'Ein Verkauf geht' : `${text} Verkäufe gehen`} über den bekannten Bestand hinaus, meist weil frühere Käufe fehlen. Der Bestand bleibt bei null; der Erlös ohne bekannten Einstand zählt als realisierter Gewinn.`,
    H_CASH_NEGATIV:
      'Die Positionen sind zusammen mehr wert als das ganze Depot, das Verrechnungskonto steht also im Minus. Der Cash-Anteil wird mit 0 % gezeigt.',
    H_KEIN_ZINS: 'Die Sharpe-Ratio fehlt: Für den risikofreien Zins (EZB €STR) liegen keine Werte vor.',
  } satisfies Record<Exclude<HinweisCode, 'H_KEIN_VPI' | 'H_DRIFT_AUSGESETZT'>, unknown>,
  hinweiseTitel: 'Hinweise aus der Berechnung',
  hinweiseBeschreibung: 'Was beim Rechnen der Kennzahlen aufgefallen ist.',
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
} as const;
