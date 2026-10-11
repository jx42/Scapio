/*
 * Der Satz zu einem Lauf-Hinweis. Die Werte kommen roh aus der Datenbank und koennen aus
 * einer aelteren oder neueren Version stammen: jede Art wird hier formatiert, eine
 * unbekannte bekommt einen neutralen Satz statt eines Absturzes.
 */

import { de } from '@/i18n/de';
import type { LaufHinweis } from '@/lib/api';
import { datumKurz, prozentAusProzentzahl, zahl } from '@/lib/format';

const t = de.laufhinweise.art;

function anzahl(wert: unknown): string {
  return typeof wert === 'number' ? zahl(wert) : '—';
}

function text(wert: unknown): string {
  return typeof wert === 'string' ? wert : '—';
}

function liste(wert: unknown): string {
  return Array.isArray(wert) ? wert.map(text).join(', ') : '—';
}

function anteil(wertProzent: unknown): string {
  return typeof wertProzent === 'number' ? prozentAusProzentzahl(wertProzent) : '—';
}

export function hinweisText(h: LaufHinweis): string {
  // Werte ungeprueft: `hinweise_json` ist eigenes JSON, aber versionsuebergreifend.
  const w = h.werte as Readonly<Record<string, unknown>>;
  switch (h.art) {
    case 'text':
      return text(w.text);
    case 'mcpSitzungErneuert':
      return t.mcpSitzungErneuert;
    case 'vpiNichtAngebunden':
      return t.vpiNichtAngebunden(text(w.quelle));
    case 'vpiRandNichtAngebunden':
      return t.vpiRandNichtAngebunden(text(w.quelle));
    case 'vpiRandOhneBasis':
      return t.vpiRandOhneBasis;
    case 'zinsNichtAngebunden':
      return t.zinsNichtAngebunden(text(w.quelle));
    case 'fondsNichtAbrufbar':
      return t.fondsNichtAbrufbar(text(w.anbieter), text(w.isin));
    case 'artNichtAbrufbar':
      return t.artNichtAbrufbar(text(w.isin));
    case 'storniert':
      return t.storniert(anzahl(w.anzahl));
    case 'kurslueckenJung':
      return t.kurslueckenJung(anzahl(w.tage), anzahl(w.spanne));
    case 'selbstkontrolle':
      return t.selbstkontrolle(anteil(w.abweichungProzent));
    case 'punkteZuFrueh':
      return t.punkteZuFrueh(text(w.quelle), datumKurz(text(w.grenze)));
    case 'punkteInZukunft':
      return t.punkteInZukunft(text(w.quelle));
    case 'summenAbweichung':
      return t.summenAbweichung(typeof w.zehnerpotenz === 'number' ? t.zehnerpotenzEuro(zahl(w.zehnerpotenz)) : '—');
    case 'tagessprung': {
      const isin = text(w.isin);
      const bezeichnung = typeof w.name === 'string' ? `${w.name} (${isin})` : isin;
      const von = datumKurz(text(w.von));
      const bis = datumKurz(text(w.bis));
      const n = typeof w.anzahl === 'number' ? w.anzahl : 0;
      return t.tagessprung(bezeichnung, t.kurse(n, anzahl(w.anzahl)), von === bis ? t.amTag(von) : t.zwischen(von, bis));
    }
    case 'historienbeginn':
      return t.historienbeginn(datumKurz(text(w.ersterTransaktionsTag)), datumKurz(text(w.ersterKaufTag)));
    case 'uebertragOhneWert':
      return t.uebertragOhneWert(text(w.isin), datumKurz(text(w.tag)));
    case 'vpiSprung':
      return t.vpiSprung(
        Array.isArray(w.monate) ? zahl(w.monate.length) : '—',
        anteil(w.schwelleProzent),
        liste(w.monate),
      );
    case 'zeileOhneZeitstempel':
      return t.zeileOhneZeitstempel(text(w.quelle));
    case 'zeileOhneZweig':
      return t.zeileOhneZweig(text(w.quelle));
    case 'unbekannteTypen':
      return t.unbekannteTypen(liste(w.typen));
    case 'seedUebernommen':
      return t.seedUebernommen(anzahl(w.zeilen));
    case 'kursfensterNichtAbrufbar':
      return t.kursfensterNichtAbrufbar(text(w.fenster), text(w.isin));
    case 'kursfensterSchema':
      return t.kursfensterSchema(text(w.fenster), text(w.isin));
    case 'kursfensterAndereIsin':
      return t.kursfensterAndereIsin(text(w.fenster), text(w.isin));
    case 'zinsLuecken':
      return t.zinsLuecken(anzahl(w.tage));
    case 'vpiLuecken':
      return t.vpiLuecken(anzahl(w.monate));
    case 'vpiRandLuecken':
      return t.vpiRandLuecken(anzahl(w.monate));
    case 'quelleGescheitert':
      return t.quelleGescheitert(text(w.quelle));
    case 'bestandteileSumme':
      return t.bestandteileSumme(text(w.isin), anteil(w.prozent), anzahl(w.positionen), anzahl(w.ohneIsin));
    case 'transaktionenSeitenGrenze':
      return t.transaktionenSeitenGrenze(anzahl(w.seiten), anzahl(w.hoechstens));
    default: {
      // `never` haelt die Liste vollstaendig; zur Laufzeit kann trotzdem eine neuere Art kommen.
      const neuer: never = h;
      return t.unbekannt(String((neuer as { art: unknown }).art));
    }
  }
}

export function hinweisTitel(h: LaufHinweis): string {
  return de.laufhinweise.artTitel[h.art] ?? de.laufhinweise.titel;
}

/** Was der Nutzer tun kann — jede Art hat einen Satz, eine unbekannte den allgemeinen. */
export function hinweisTun(h: LaufHinweis): string {
  return de.laufhinweise.artTun[h.art] ?? de.laufhinweise.artTun.unbekannt;
}

/** Stabil ueber Neuladen hinweg — dient als React-Key und zum Merken weggeklickter Hinweise. */
export function hinweisSchluessel(h: LaufHinweis): string {
  return `${h.art} ${JSON.stringify(h.werte)}`;
}
