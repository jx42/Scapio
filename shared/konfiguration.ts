/**
 * Laufzeitkonfiguration: `config.json` lesen, `einstellungen.json` aus dem
 * Datenverzeichnis darueberlegen, durch zod schicken, Vorgaben ergaenzen.
 *
 * Zwei Dateien, weil sie verschiedenen Leuten gehoeren [ADR-037]: `config.json` liegt im
 * Repository (`erlaubteHosts`, `datenverzeichnis`), `einstellungen.json` dem Nutzer und
 * ueberlebt deshalb jedes Update — auch ein neu entpacktes ZIP.
 *
 * In `shared/`, weil drei Schichten dieselbe
 * Konfiguration brauchen — Ingest (`erlaubteHosts`, Zeitlimits), Server
 * (`port`, `driftSchwellen`) und `start/` (alle) — und keine davon der anderen gehoert.
 * `core/` liest sie nie. [INV-04]
 *
 * Jeder Wert hat eine Vorgabe im Code. Kein Wert aus
 * `config.json` erreicht jemals eine Kommandozeile oder eine SQL-Zeichenkette.
 * `erlaubteHosts` ist eine Allowlist, keine Musterliste.
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { vorgabeErlaubteHosts } from './hosts.ts';

export const PROJEKTWURZEL = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * Wohin Datenbank, Sicherungen und die OAuth-Token gehoeren, wenn `config.json`
 * nichts anderes sagt. Plattformabhaengig, und zwar aus demselben Grund, aus dem
 * [ADR-005] den Projektordner meidet: der Ort soll nicht synchronisiert werden.
 *
 * Unter Windows deshalb `LOCALAPPDATA`, nicht `APPDATA`. `APPDATA` ist das
 * Roaming-Profil und wird auf Rechnern in einer Windows-Domaene beim An- und Abmelden
 * ueber das Netz kopiert — dasselbe Problem wie iCloud unter macOS, nur mit einem
 * Dateiserver statt einer Cloud. `LOCALAPPDATA` bleibt auf dem Geraet.
 *
 * Die Parameter sind nur fuer den Test da: dieselbe Funktion muss sich fuer eine
 * Plattform pruefen lassen, auf der sie gerade nicht laeuft.
 */
export function vorgabeDatenverzeichnis(
  plattform: NodeJS.Platform = process.platform,
  umgebung: NodeJS.ProcessEnv = process.env,
): string {
  if (plattform === 'win32') {
    const lokal = umgebung['LOCALAPPDATA'];
    return join(lokal !== undefined && lokal !== '' ? lokal : homedir(), 'scapio');
  }
  return '~/Library/Application Support/scapio';
}

const DriftSchwellen = z
  .object({
    hinweis: z.number().min(0).max(1),
    banner: z.number().min(0).max(1),
    abbruch: z.number().min(0).max(1),
  })
  .strict();

// Ohne Vorgaben: in `einstellungen.json` heisst ein fehlendes Feld "wie in config.json",
// nicht "zurueck auf die Vorgabe". Die Vorgaben haengen erst `KonfigurationSchema` an.
const EINSTELLUNGEN = {
  port: z.number().int().min(1024).max(65535),
  mcpZeitlimitMs: z.number().int().min(1000).max(600_000),
  csvZeitlimitMs: z.number().int().min(1000).max(300_000),
  csvGroesstMb: z.number().int().min(1).max(256),
  /** Wie lange ein Anbieterkatalog gilt, bevor die Fondsaufloesung ihn neu abruft. */
  fondsKatalogFrischeTage: z.number().int().min(1).max(30),
  inflationsquelle: z.enum(['eurostat', 'destatis']),
  zinsquelle: z.enum(['ecb', 'keine']),
  driftSchwellen: DriftSchwellen,
  /** Kachel „Top 25 Unternehmen" samt Abruf der Fondsbestandslisten [ADR-038]. */
  top25: z.boolean(),
};

/** Die Felder, die `einstellungen.json` setzen darf — nicht `erlaubteHosts`, nicht `datenverzeichnis`. */
export const EINSTELLUNGSFELDER = Object.keys(EINSTELLUNGEN) as readonly (keyof typeof EINSTELLUNGEN)[];

// `hinweis` traegt die Anleitung in der Vorlage `docs/einstellungen.example.json` und wird verworfen.
const EinstellungenSchema = z
  .object({ ...EINSTELLUNGEN, hinweis: z.string().max(2000) })
  .partial()
  .strict();

const KonfigurationSchema = z
  .object({
    port: EINSTELLUNGEN.port.default(4732),
    // Als Funktion, nicht als fester Wert: die Vorgabe haengt an der Plattform und wird
    // deshalb erst beim Lesen bestimmt, nicht beim Laden dieses Moduls.
    datenverzeichnis: z
      .string()
      .min(1)
      .default(() => vorgabeDatenverzeichnis()),
    mcpZeitlimitMs: EINSTELLUNGEN.mcpZeitlimitMs.default(300_000),
    csvZeitlimitMs: EINSTELLUNGEN.csvZeitlimitMs.default(30_000),
    csvGroesstMb: EINSTELLUNGEN.csvGroesstMb.default(32),
    // Nur einschraenkbar: ein Host ausserhalb von `hosts.ts` kaeme ohne das Festnageln der
    // geprueften Adresse aus (docs/SICHERHEIT.md, Restrisiko 1).
    erlaubteHosts: z
      .array(
        z.string().refine((h) => vorgabeErlaubteHosts().includes(h), {
          message: 'nur Hosts aus hosts.ts, config.json darf die Liste nur einschraenken',
        }),
      )
      .default(vorgabeErlaubteHosts),
    fondsKatalogFrischeTage: EINSTELLUNGEN.fondsKatalogFrischeTage.default(5),
    inflationsquelle: EINSTELLUNGEN.inflationsquelle.default('eurostat'),
    zinsquelle: EINSTELLUNGEN.zinsquelle.default('ecb'),
    driftSchwellen: DriftSchwellen.default({ hinweis: 0.001, banner: 0.005, abbruch: 0.02 }),
    top25: EINSTELLUNGEN.top25.default(false),
  })
  .strict();

/** Die Werte, die ohne jede Datei gelten — fuer die Uebernahme alter Aenderungen aus `config.json`. */
export function vorgaben(): z.infer<typeof KonfigurationSchema> {
  return KonfigurationSchema.parse({});
}

export type Konfiguration = z.infer<typeof KonfigurationSchema> & {
  /** Aufgeloest: absoluter Pfad des Datenverzeichnisses. */
  readonly datenpfad: string;
};

/**
 * Ersetzt ein fuehrendes `~/` durch das Benutzerverzeichnis und verlangt danach einen
 * absoluten Pfad. Abgelehnt: relative Pfade und alles in der Projektwurzel (Daten gehoeren
 * nicht in Git oder iCloud [ADR-005]) sowie das Benutzerverzeichnis selbst, dem
 * `db/verbindung.ts` sonst die Rechte 0700 setzte.
 */
export function pfadAufloesen(pfad: string, projektwurzel = PROJEKTWURZEL): string {
  const aufgeloest = pfad.startsWith('~/') ? join(homedir(), pfad.slice(2)) : pfad;
  if (!isAbsolute(aufgeloest)) {
    throw new Error(`datenverzeichnis muss absolut sein oder mit ~/ beginnen: ${pfad}`);
  }
  const normiert = resolve(aufgeloest);
  if (normiert === resolve(homedir())) {
    throw new Error('datenverzeichnis darf nicht das Benutzerverzeichnis selbst sein.');
  }
  const wurzel = resolve(projektwurzel);
  const imProjekt = relative(wurzel, normiert);
  if (imProjekt === '' || (!imProjekt.startsWith('..') && !isAbsolute(imProjekt))) {
    throw new Error('datenverzeichnis darf nicht im Projektordner liegen.');
  }
  return normiert;
}

const EINSTELLUNGEN_DATEI = 'einstellungen.json';

let zwischengespeichert: Konfiguration | null = null;

/** Fehlt die Datei, `{}`. Ist sie kaputt, ein Fehler mit ihrem Namen. */
export function leseJsonDatei(datei: string, name: string): unknown {
  try {
    return JSON.parse(readFileSync(datei, 'utf8'));
  } catch (fehler) {
    if ((fehler as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new Error(`${name} ist nicht lesbar: ${(fehler as Error).message}`);
  }
}

function stellenVon(fehler: z.ZodError): string {
  return fehler.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

/**
 * `einstellungenDatei` faellt nur dann auf das Datenverzeichnis zurueck, wenn auch
 * `datei` die Vorgabe ist: ein Test mit eigener `config.json` liest sonst die
 * `einstellungen.json` des Entwicklers mit.
 */
export function ladeKonfiguration(datei?: string, einstellungenDatei?: string): Konfiguration {
  if (zwischengespeichert !== null) return zwischengespeichert;

  const roh = leseJsonDatei(datei ?? join(PROJEKTWURZEL, 'config.json'), 'config.json');
  const basis = KonfigurationSchema.safeParse(roh);
  if (!basis.success) throw new Error(`config.json ist ungueltig — ${stellenVon(basis.error)}`);
  const datenpfad = pfadAufloesen(basis.data.datenverzeichnis);

  const eigeneDatei = einstellungenDatei ?? (datei === undefined ? join(datenpfad, EINSTELLUNGEN_DATEI) : null);
  let eigene: Omit<z.infer<typeof EinstellungenSchema>, 'hinweis'> = {};
  if (eigeneDatei !== null) {
    const ergebnis = EinstellungenSchema.safeParse(leseJsonDatei(eigeneDatei, eigeneDatei));
    if (!ergebnis.success) throw new Error(`${eigeneDatei} ist ungueltig — ${stellenVon(ergebnis.error)}`);
    const { hinweis: _hinweis, ...werte } = ergebnis.data;
    eigene = werte;
  }

  const k = { ...basis.data, ...eigene };
  if (!(k.driftSchwellen.hinweis <= k.driftSchwellen.banner && k.driftSchwellen.banner <= k.driftSchwellen.abbruch)) {
    throw new Error('driftSchwellen muessen aufsteigend sein: hinweis <= banner <= abbruch');
  }

  zwischengespeichert = { ...k, datenpfad };
  return zwischengespeichert;
}

/** Nur fuer Tests: den Zwischenspeicher leeren. */
export function konfigurationVergessen(): void {
  zwischengespeichert = null;
}

export const einstellungenPfad = (k: Konfiguration): string => join(k.datenpfad, EINSTELLUNGEN_DATEI);
/** Eigene Fondsquellen [ADR-018] — im Datenverzeichnis, damit sie ein Update ueberleben [ADR-037]. */
export const fondsPfad = (k: Konfiguration): string => join(k.datenpfad, 'funds.json');
/** Anfangsbestand [P-13] — Depotdaten, deshalb nie im Projektordner [ADR-041]. */
export const seedPfad = (k: Konfiguration): string => join(k.datenpfad, 'seed.json');
export const dbPfad = (k: Konfiguration): string => join(k.datenpfad, 'portfolio.db');
export const sicherungsPfad = (k: Konfiguration): string => join(k.datenpfad, 'sicherung');
export const logPfad = (k: Konfiguration): string => join(k.datenpfad, 'lauf.log');
export const mcpPfad = (k: Konfiguration): string => join(k.datenpfad, 'mcp');
/**
 * Die abgelegten OAuth-Tokens. Steht hier und nicht in `ingest/mcpAnmeldung.ts`, weil
 * auch der Server wissen muss, OB eine Anmeldung existiert — ohne dafuer die ganze
 * Ingest-Kette zu laden. [ADR-012]
 */
export const mcpTokenPfad = (k: Konfiguration): string => join(mcpPfad(k), 'token.json');
