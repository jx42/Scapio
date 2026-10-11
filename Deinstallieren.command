#!/bin/zsh
#
# Doppelklick-Deinstallation fuer macOS. Die dritte Tuer neben Start.command und
# Aktualisieren.command: dieses Fenster sagt deutsche Saetze, die eigentliche Arbeit macht
# `start/deinstallieren.ts`. Es loescht nur das Datenverzeichnis; den Scapio-Ordner
# loescht der Nutzer danach selbst. [ADR-049]

set -u
cd "${0:a:h}" || exit 1

MINDEST_NODE=24

ende() {
  print -r -- ""
  [[ -n "$1" ]] && print -r -- "$1" && print -r -- ""
  print -r -- "Zum Schliessen eine beliebige Taste druecken."
  read -k1 -s
  exit "$2"
}

if ! command -v node >/dev/null 2>&1; then
  ende "Node.js ist nicht installiert. Ohne Node.js laesst sich der Datenordner nicht
sicher finden — bitte von Hand loeschen, siehe README, Abschnitt \"Deinstallieren\"." 1
fi

node_version="$(node -v 2>/dev/null)"
node_gross="${${node_version#v}%%.*}"
if [[ ! "$node_gross" =~ '^[0-9]+$' ]] || (( node_gross < MINDEST_NODE )); then
  ende "Node.js ist zu alt: gefunden ${node_version:-unbekannt}, gebraucht wird ${MINDEST_NODE} oder neuer.
Bitte den Datenordner von Hand loeschen, siehe README, Abschnitt \"Deinstallieren\"." 1
fi

if ! npm run --silent deinstallieren; then
  ende "Die Deinstallation ist nicht durchgelaufen. Was zu tun ist, steht oben." 1
fi

ende "" 0
