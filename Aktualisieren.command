#!/bin/zsh
#
# Doppelklick-Update fuer macOS. Die Tuer neben Start.command — fuer denselben
# Nutzer, der kein Terminal oeffnet, und mit derselben Aufteilung: dieses Fenster sagt
# deutsche Saetze, die eigentliche Arbeit macht `start/update.ts`. [ADR-013]
#
# Zwei Eigenheiten, beide mit Grund:
#
#  1. Der ganze Ablauf steckt in einer Funktion, die erst in der letzten Zeile gerufen
#     wird. Die Shell liest ein Skript sonst haeppchenweise weiter, WAEHREND es laeuft —
#     und dieses Skript aktualisiert sich selbst mit. Eine Funktion wird vor dem ersten
#     Schritt vollstaendig gelesen; danach ist es gleichgueltig, was der Pull an dieser
#     Datei aendert.
#  2. Am Ende uebernimmt Start.command per `exec`, und zwar die frisch gezogene
#     Fassung. Abhaengigkeiten, Migrationen, Anmeldung und Start stehen dort schon
#     richtig; hier waeren sie eine zweite, alternde Kopie.

set -u

aktualisieren() {
  cd "${0:a:h}" || exit 1

  MINDEST_NODE=24

  abbruch() {
    print -r -- ""
    print -r -- "$1"
    print -r -- ""
    print -r -- "Zum Schliessen eine beliebige Taste druecken."
    read -k1 -s
    exit 1
  }

  if ! command -v node >/dev/null 2>&1; then
    abbruch "Node.js ist nicht installiert.

Bitte von https://nodejs.org laden (die LTS-Version) und installieren.
Danach dieses Fenster schliessen und Aktualisieren.command erneut doppelklicken."
  fi

  node_version="$(node -v 2>/dev/null)"
  node_gross="${${node_version#v}%%.*}"
  if [[ ! "$node_gross" =~ '^[0-9]+$' ]] || (( node_gross < MINDEST_NODE )); then
    abbruch "Node.js ist zu alt: gefunden ${node_version:-unbekannt}, gebraucht wird ${MINDEST_NODE} oder neuer.

Bitte die aktuelle LTS-Version von https://nodejs.org installieren und erneut doppelklicken."
  fi

  if ! npm run --silent update -- --mit-neustart; then
    abbruch "Das Update ist nicht durchgelaufen. Was zu tun ist, steht oben."
  fi

  print -r -- ""
  print -r -- "Starte das Dashboard neu …"
  print -r -- ""
  exec ./Start.command
}

aktualisieren "$@"
