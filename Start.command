#!/bin/zsh
#
# Doppelklick-Start fuer macOS. Der einzige Weg, den ein Nutzer ohne Terminal geht.
#
# Drei Dinge macht dieses Skript, und jedes hat einen Grund:
#
#  1. Node pruefen, BEVOR irgendetwas anderes laeuft. Fehlt es, sah der Nutzer bisher
#     `zsh: command not found: npm` und ein Fenster, das sich schliesst. Der
#     wahrscheinlichste Fehlerfall des allerersten Doppelklicks verdient einen Satz,
#     keinen Shell-Fehler. Fehlt Node oder ist es zu alt, oeffnet das Skript die
#     Download-Seite gleich selbst; davor prueft es, ob es ueberhaupt im entpackten
#     Ordner liegt und nicht einzeln aus dem ZIP heraus gestartet wurde.
#  2. Abhaengigkeiten NUR installieren, wenn sich `package-lock.json` geaendert hat.
#     `npm ci` loescht `node_modules` und installiert alles neu — bei jedem Doppelklick
#     war das die mit Abstand laengste Wartezeit, und nach einem `git pull` zog es
#     zugleich still neuen Code auf den Rechner. Der Hash-Vergleich macht beides
#     sichtbar und selten. Die Marke liegt in `.start/`, nicht in `node_modules/`:
#     `npm ci` raeumt dieses Verzeichnis vorher weg.
#  3. Die rohe npm-Ausgabe in eine Logdatei umlenken. Im Fenster stehen deutsche Saetze;
#     der Pfad zum Log erscheint nur, wenn wirklich etwas schiefgegangen ist.
#
# Bewusst NICHT hier: `npm audit`, ein Selbst-Update, ein Hintergrunddienst. Dieses
# Skript startet die Anwendung und tut sonst nichts.

set -u
cd "${0:a:h}" || exit 1

MINDEST_NODE=24
MARKE=".start"
PROTOKOLL="$MARKE/installation.log"
HASHDATEI="$MARKE/package-lock.sha256"

abbruch() {
  print -r -- ""
  print -r -- "$1"
  print -r -- ""
  print -r -- "⌨️  Zum Schliessen eine beliebige Taste druecken."
  read -k1 -s
  exit 1
}

# --- 1. Node ----------------------------------------------------------------

if [[ ! -f package.json ]]; then
  abbruch "📂  Scapio ist noch nicht entpackt — diese Datei liegt nicht im Scapio-Ordner.

Bitte das ZIP zuerst vollstaendig entpacken, unter Windows mit Rechtsklick auf
das ZIP und \"Alle extrahieren\". Danach Start im entpackten Ordner doppelklicken."
fi

NODE_SEITE="https://nodejs.org/de/download"

if ! command -v node >/dev/null 2>&1; then
  open "$NODE_SEITE" 2>/dev/null
  abbruch "⏬  Node.js ist nicht installiert.

Die Download-Seite $NODE_SEITE oeffnet sich im Browser.
Dort den Installer fuer dein System laden (die LTS-Version), oeffnen und durchklicken.
Danach dieses Fenster schliessen und Start.command erneut doppelklicken."
fi

node_version="$(node -v 2>/dev/null)"
node_gross="${${node_version#v}%%.*}"
if [[ ! "$node_gross" =~ '^[0-9]+$' ]] || (( node_gross < MINDEST_NODE )); then
  open "$NODE_SEITE" 2>/dev/null
  abbruch "⏬  Node.js ist zu alt: gefunden ${node_version:-unbekannt}, gebraucht wird ${MINDEST_NODE} oder neuer.

Grund: die Datenbank steckt in Node selbst (node:sqlite) und gibt es erst ab Version ${MINDEST_NODE}.
Die Download-Seite $NODE_SEITE oeffnet sich im Browser.
Bitte die aktuelle LTS-Version installieren und erneut doppelklicken."
fi

# --- 2. Abhaengigkeiten -----------------------------------------------------

mkdir -p "$MARKE" || exit 1

hash_neu="$(shasum -a 256 package-lock.json 2>/dev/null | cut -d' ' -f1)"
hash_alt=""
[[ -r "$HASHDATEI" ]] && hash_alt="$(<"$HASHDATEI")"

if [[ -d node_modules && -n "$hash_neu" && "$hash_neu" == "$hash_alt" ]]; then
  print -r -- "✅  1/3  Softwarebausteine sind aktuell."
else
  if [[ -n "$hash_alt" ]]; then
    print -r -- "🔄  1/3  Softwarebausteine werden aktualisiert — die Paketliste hat sich geaendert …"
  else
    print -r -- "⏬  1/3  Softwarebausteine werden installiert — das dauert beim ersten Mal einige Minuten …"
  fi
  if ! npm ci --ignore-scripts >"$PROTOKOLL" 2>&1; then
    abbruch "❌  Die Softwarebausteine liessen sich nicht installieren.

Was genau schiefging, steht in dieser Datei:
  $PWD/$PROTOKOLL"
  fi
  print -r -- "$hash_neu" >"$HASHDATEI"
fi

# --- 3. Anmeldung und Start -------------------------------------------------

print -r -- "🔐  2/3  Anmeldung bei Scalable Capital pruefen …"
npm run --silent mcp-login -- --nur-wenn-noetig || abbruch "❌  Die Anmeldung beim Broker ist fehlgeschlagen.

Die Meldung dazu steht oben in diesem Fenster; mehr dazu in docs/RUNBOOK.md."

print -r -- "🚀  3/3  Dashboard startet — der Browser oeffnet sich gleich von selbst."
npm start --silent || abbruch "❌  Der Start ist fehlgeschlagen.

Die Meldung dazu steht oben in diesem Fenster; mehr dazu in docs/RUNBOOK.md."
