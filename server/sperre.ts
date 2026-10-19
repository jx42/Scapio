/**
 * Die Sperre um den Ingest. Zwei Ebenen, weil es zwei Arten von Gleichzeitigkeit gibt.
 *
 * 1. Im Prozess: ein Feld. Zwei `POST /api/refresh` kurz hintereinander duerfen nicht
 *    zwei Laeufe starten — das zweite bekommt 409. [INV-08]
 * 2. Zwischen Prozessen: eine Datei im Datenverzeichnis, atomar mit dem Flag `wx`
 *    angelegt (das schlaegt fehl, wenn sie schon existiert — deshalb kein
 *    "erst pruefen, dann schreiben", das genau dazwischen verlieren wuerde).
 *    Sie verhindert, dass `npm run ingest` und der Server gleichzeitig schreiben.
 *
 * Eine Sperrdatei ohne lebenden Prozess ist Muell und darf die Anwendung nicht dauerhaft
 * blockieren: wird der Ingest hart abgeschossen, bleibt die Datei liegen. Sie gilt als
 * verwaist, sobald der eingetragene Prozess nicht mehr existiert (`process.kill(pid, 0)`)
 * oder sie aelter als 15 Minuten ist — laenger dauert kein Lauf.
 *
 * "Aelter als" misst gegen die `mtime` der DATEI, nicht gegen den Zeitstempel darin: ein
 * laufender Halter fasst sie jede Minute an (`utimesSync`, kein Neuschreiben). Sonst
 * gaelte ein ehrlich langer Lauf nach 15 Minuten als verwaist, obwohl sein Prozess lebt —
 * die pid-Pruefung faengt das nur, solange beide Seiten auf demselben Rechner laufen und
 * die pid nicht zwischenzeitlich neu vergeben wurde. Der Zeitstempel im Inhalt bleibt der
 * Erwerbszeitpunkt: die Oberflaeche zeigt ihn im 409, dafuer darf er sich nicht bewegen.
 *
 * Freigegeben wird ausschliesslich im `finally` des Aufrufers.
 *
 * Die Datei liegt im Datenverzeichnis, nicht im Projektordner. [CLAUDE.md]
 */

import { randomBytes } from 'node:crypto';
import { linkSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { verzeichnisAnlegen } from '../shared/dateirechte.ts';
import { ApiFehler } from './fehler.ts';

/** Laenger als jeder Lauf ohne Lebenszeichen bleiben darf. Danach gilt sie als liegengeblieben. */
export const HOECHSTALTER_MS = 15 * 60 * 1000;

/** Abstand der Lebenszeichen. Deutlich kleiner als `HOECHSTALTER_MS`, damit ein kurzer
 *  Haenger im Lauf die eigene Sperre nicht verwaisen laesst. */
export const LEBENSZEICHEN_MS = 60 * 1000;

export const SPERRDATEI = 'lauf.lock';

export type Halter = {
  /** Wer die Sperre haelt: `api`, `start`, `ingest`. Kein Fremdtext. */
  readonly quelle: string;
  /** ISO-Zeitstempel des Erwerbs. */
  readonly seit: string;
  readonly pid: number;
};

type Dateiinhalt = {
  quelle?: unknown;
  seit?: unknown;
  pid?: unknown;
};

/** Lebt der Prozess noch? Signal 0 sendet nichts, es prueft nur. */
function lebt(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (fehler) {
    // EPERM heisst: es gibt ihn, er gehoert nur jemand anderem.
    return (fehler as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function alterAusStempel(seit: string): number {
  const t = Date.parse(seit);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : Date.now() - t;
}

export class Sperre {
  readonly #pfad: string;
  #halter: Halter | null = null;
  /** Wird nachgereicht, sobald der Ingest seine Lauf-Nummer vergeben hat. */
  #laufId: number | null = null;
  /** Laeuft nur, solange DIESER Prozess die Sperre haelt. */
  #lebenszeichen: NodeJS.Timeout | null = null;

  constructor(datenpfad: string) {
    this.#pfad = join(datenpfad, SPERRDATEI);
    verzeichnisAnlegen(datenpfad);
  }

  get pfad(): string {
    return this.#pfad;
  }

  /** Wer sie in diesem Prozess haelt — `null`, wenn dieser Prozess sie nicht haelt. */
  belegt(): (Halter & { readonly laufId: number | null }) | null {
    return this.#halter === null ? null : { ...this.#halter, laufId: this.#laufId };
  }

  /** Nur lesend: wirft `E_SPERRE`, wenn dieser oder ein lebender fremder Prozess sie haelt. */
  pruefeFrei(): void {
    const eigener = this.belegt();
    if (eigener !== null) throw this.#konflikt(eigener.quelle, eigener.seit, eigener.laufId);
    const fremd = this.#lies();
    if (fremd !== null && fremd.pid !== process.pid && !this.#istVerwaist(fremd)) {
      throw this.#konflikt(fremd.quelle, fremd.seit, null);
    }
  }

  /**
   * Nimmt die Sperre oder wirft `E_SPERRE` (409) mit `laufId`, `quelle` und `seit`.
   * Genau diese drei Felder braucht die Oberflaeche, um zu sagen, was gerade laeuft.
   */
  nimm(quelle: string): void {
    const eigener = this.belegt();
    if (eigener !== null) throw this.#konflikt(eigener.quelle, eigener.seit, eigener.laufId);

    const halter: Halter = { quelle, seit: new Date().toISOString(), pid: process.pid };

    if (!this.#schreibe(halter)) {
      const fremd = this.#lies();
      // Eine Datei mit UNSERER eigenen pid ist keine fremde Sperre. Sie entsteht, wenn
      // der Ingest im selben Prozess laeuft und seinerseits eine Sperre nimmt. Gegen
      // zwei gleichzeitige Laeufe in diesem Prozess schuetzt der Mutex oben, nicht die
      // Datei — wuerde sie hier blockieren, sperrte sich der Prozess selbst aus.
      const eigenerProzess = fremd !== null && fremd.pid === process.pid;
      if (fremd !== null && !eigenerProzess && !this.#istVerwaist(fremd)) {
        throw this.#konflikt(fremd.quelle, fremd.seit, null);
      }
      // Verwaist, unlesbar oder von uns selbst: uebernehmen, genau einmal erneut versuchen.
      if (!this.#uebernimm(fremd, halter)) {
        const nochmal = this.#lies();
        throw this.#konflikt(nochmal?.quelle ?? 'unbekannt', nochmal?.seit ?? halter.seit, null);
      }
    }

    this.#halter = halter;
    this.#laufId = null;
    this.#starteLebenszeichen();
  }

  setzeLaufId(id: number | null): void {
    this.#laufId = id;
  }

  /**
   * Gehoert in ein `finally`. Ist idempotent — doppelte Freigabe ist kein Fehler. Ohne
   * eigenen Halter passiert nichts: die Datei gehoert dann einem anderen Prozess (etwa
   * einem laufenden `npm run ingest`), und aufraeumen darf nur `raeumeVerwaiste`.
   */
  gibFrei(): void {
    if (this.#halter === null) return;
    this.#halter = null;
    this.#laufId = null;
    this.#haltLebenszeichen();
    rmSync(this.#pfad, { force: true });
  }

  /**
   * Beim Start: eine liegengebliebene Sperrdatei entfernen, wenn ihr Prozess tot oder
   * sie zu alt ist. Gibt zurueck, ob geraeumt wurde — `start.ts` sagt das dem Betreiber.
   */
  raeumeVerwaiste(): boolean {
    const vorhanden = this.#lies();
    if (vorhanden === null) {
      // Existiert die Datei, ist aber unlesbar, kann sie nichts mehr schuetzen.
      rmSync(this.#pfad, { force: true });
      return false;
    }
    if (!this.#istVerwaist(vorhanden)) return false;
    rmSync(this.#pfad, { force: true });
    return true;
  }

  /**
   * Erst wegbenennen, dann pruefen, WAS weggenommen wurde. Ein blosses `rm` + `wx` gaebe
   * zwei Prozessen, die dieselbe verwaiste Datei sehen, beide die Sperre: der zweite
   * loeschte die frische Datei des ersten. `rename` nimmt genau eine Datei an sich; war
   * sie schon frisch, kommt sie per `link` (legt nie ueber eine bestehende) zurueck.
   */
  #uebernimm(verwaist: Halter | null, halter: Halter): boolean {
    const beiseite = `${this.#pfad}.${String(process.pid)}.${randomBytes(4).toString('hex')}.alt`;
    try {
      renameSync(this.#pfad, beiseite);
    } catch (fehler) {
      if ((fehler as NodeJS.ErrnoException).code !== 'ENOENT') throw fehler;
      return this.#schreibe(halter);
    }
    const weg = this.#lies(beiseite);
    const dieselbe = weg === null ? verwaist === null : verwaist !== null && weg.pid === verwaist.pid && weg.seit === verwaist.seit;
    try {
      if (dieselbe) return this.#schreibe(halter);
      try {
        linkSync(beiseite, this.#pfad);
      } catch {
        // Inzwischen hat ein Dritter geschrieben — seine Datei gilt.
      }
      return false;
    } finally {
      rmSync(beiseite, { force: true });
    }
  }

  #istVerwaist(h: Halter): boolean {
    return !lebt(h.pid) || this.#alter(h.seit) > HOECHSTALTER_MS;
  }

  /**
   * Alter seit dem letzten Lebenszeichen. Die `mtime` ist die Wahrheit; der Zeitstempel
   * im Inhalt ist nur der Rueckfall fuer den Fall, dass die Datei nicht mehr lesbar ist.
   */
  #alter(seit: string): number {
    try {
      return Date.now() - statSync(this.#pfad).mtimeMs;
    } catch {
      return alterAusStempel(seit);
    }
  }

  /**
   * `unref()`: dieser Timer darf den Prozess nicht am Leben halten. Ein `npm run ingest`,
   * das fertig ist, soll sich beenden, nicht auf den naechsten Herzschlag warten.
   */
  #starteLebenszeichen(): void {
    this.#haltLebenszeichen();
    const timer = setInterval(() => {
      if (this.#halter === null) return;
      const jetzt = new Date();
      try {
        utimesSync(this.#pfad, jetzt, jetzt);
      } catch {
        // Die Datei ist weg — jemand hat sie von Hand geraeumt. Nicht unser Problem:
        // `gibFrei()` raeumt ohnehin mit `force`.
      }
    }, LEBENSZEICHEN_MS);
    timer.unref();
    this.#lebenszeichen = timer;
  }

  #haltLebenszeichen(): void {
    if (this.#lebenszeichen !== null) {
      clearInterval(this.#lebenszeichen);
      this.#lebenszeichen = null;
    }
  }

  #schreibe(h: Halter): boolean {
    try {
      writeFileSync(this.#pfad, JSON.stringify(h), { flag: 'wx', mode: 0o600 });
      return true;
    } catch (fehler) {
      if ((fehler as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw fehler;
    }
  }

  #lies(pfad = this.#pfad): Halter | null {
    let roh: string;
    try {
      roh = readFileSync(pfad, 'utf8');
    } catch {
      return null;
    }
    let inhalt: Dateiinhalt;
    try {
      inhalt = JSON.parse(roh) as Dateiinhalt;
    } catch {
      return null;
    }
    if (typeof inhalt.pid !== 'number' || typeof inhalt.seit !== 'string') return null;
    const quelle = typeof inhalt.quelle === 'string' ? inhalt.quelle : 'unbekannt';
    return { quelle, seit: inhalt.seit, pid: inhalt.pid };
  }

  #konflikt(quelle: string, seit: string, laufId: number | null): ApiFehler {
    return new ApiFehler(
      'E_SPERRE',
      409,
      'Es läuft bereits eine Aktualisierung.',
      'Warte, bis der laufende Lauf fertig ist — der Fortschritt steht unter /api/lauf.',
      { laufId, quelle, seit },
    );
  }
}
