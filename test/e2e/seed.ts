/**
 * Schreibt das synthetische Szenario aus `daten.ts` in eine frische Datenbank und laesst
 * `ingest/neuberechnung.ts` daraus `depot_tag` ableiten — genau der Schritt, den ein
 * echter Lauf auch ausfuehren wuerde. Der Ingest selbst (MCP, CSV, Eurostat) wird nicht
 * angefasst [INV-01]: dieses Skript ersetzt ausschliesslich seine Ausgabe.
 */

import type { DatabaseSync } from 'node:sqlite';
import { berechneNeu } from '../../ingest/neuberechnung.ts';
import type { Tag } from '../../core/kalender.ts';
import * as repo from '../../db/repository/index.ts';
import { inTransaktion } from '../../db/repository/index.ts';
import { begrenzeAufHistorie, erzeugeSzenario } from './daten.ts';

/**
 * Gibt den Tag zurueck, an dem das Szenario tatsaechlich endet, samt passendem
 * Lauf-Zeitstempel. Der Aufrufer reicht beides an `starteServer` bzw. in die
 * Datenbank weiter, damit Fenster, Kennzahlen und "Stand" auf demselben Tag stehen
 * wie der letzte Kurs — sonst rechnet der Server mit der Systemuhr an einem Szenario
 * vorbei, das Monate frueher endet.
 */
export function seedeDatenbank(
  db: DatabaseSync,
  heuteAngefragt: Tag,
  jetztAngefragt: string,
): { readonly heute: Tag; readonly jetzt: string } {
  const heute = begrenzeAufHistorie(heuteAngefragt);
  // Wurde gekappt, wandert der Lauf-Zeitstempel mit: ein "Stand" Monate hinter dem
  // letzten Datenpunkt behauptet einen Lauf, den es im Szenario nicht gibt. 12:00 UTC
  // faellt in Sommer- wie Winterzeit auf denselben Berliner Kalendertag. [INV-03]
  const jetzt = heute === heuteAngefragt ? jetztAngefragt : `${heute}T12:00:00.000Z`;
  const szenario = erzeugeSzenario(heute, jetzt);

  inTransaktion(db, () => {
    repo.transaktion.schreibeViele(db, szenario.transaktionen);
    repo.kurs.schreibeViele(db, szenario.kurse);
    repo.sparplan.ersetze(db, [szenario.sparplan]);
    repo.vpi.schreibeViele(db, szenario.vpiWerte);
    repo.zins.schreibeViele(db, szenario.zinsWerte);
    // `stand` ist der Kalendertag, nicht der Zeitstempel des Laufs — genau das schreibt
    // auch `ingest/lauf.ts`. Der Server vergleicht ihn mit `heute`, um zu erkennen, ob die
    // Bestandteile dieses Laufs abgerufen wurden. [INV-03]
    for (const [fondsIsin, teile] of szenario.bestandteile) {
      repo.etfBestandteil.ersetzeFuerStand(db, fondsIsin, heute, teile);
    }
    for (const aufloesung of szenario.aufloesungen) {
      repo.fondsAufloesung.setze(db, aufloesung);
    }
    for (const [isin, art] of szenario.arten) {
      repo.wertpapierArt.setze(db, { isin, art, geprueftAm: heute });
    }
    const laufId = repo.lauf.starte(db, szenario.lauf.gestartet);
    repo.lauf.beende(db, laufId, {
      beendet: szenario.lauf.beendet,
      status: 'erfolg',
      quellen: { mcp: 'erfolg', ishares: 'erfolg', eurostat: 'erfolg' },
    });
  });

  berechneNeu(db, heute);

  inTransaktion(db, () => {
    repo.bestand.ersetze(db, szenario.bestand);
  });

  return { heute, jetzt };
}
