/**
 * Laeuft vor jedem Einstieg, den ein Mensch per `npm run` anstoesst. Absichtlich `.mjs` und
 * ohne Import: auf einem zu alten Node scheitern `--experimental-strip-types` und
 * `node:sqlite`, bevor eine Pruefung in einer `.ts`-Datei ueberhaupt laeuft.
 * Die Zahl steht auch in `package.json` (`engines`) und in den Startdateien.
 */
const MINDEST_NODE = 24;

const gross = Number(process.versions.node.split('.')[0]);
if (!(gross >= MINDEST_NODE)) {
  process.stderr.write(
    `Node ${MINDEST_NODE} oder neuer wird gebraucht (gefunden: ${process.versions.node}) — wegen node:sqlite.\n` +
      'Bitte die aktuelle LTS-Version von https://nodejs.org installieren.\n',
  );
  process.exit(1);
}
