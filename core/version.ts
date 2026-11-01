/**
 * Version des Rechenkerns.
 *
 * INV-10: Jede Verhaltensaenderung in `core/` erhoeht diese Zahl. Der Test
 * `test/invarianten/inv-10.test.ts` vergleicht einen Hash ueber alle Quelldateien
 * dieses Ordners mit einem hinterlegten Wert und schlaegt fehl, bis beides passt.
 *
 * Steigt die Version, gilt jede Zeile in `depot_tag` als veraltet und die gesamte
 * Historie wird beim naechsten Lauf aus `raw_snapshot` neu aufgebaut. Das ist
 * beabsichtigt und kostet Sekunden.
 */
export const KERN_VERSION = 42;
