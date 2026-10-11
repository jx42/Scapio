-- Aufloesung: welcher Anbieter fuehrt eine gehaltene ISIN, und ist ihr Katalog einsehbar.
--
-- Ersetzt das Durchprobieren gegen `funds.json`: ein Katalogabruf je Anbieter traegt hier
-- ein, was er ueber eine ISIN weiss. `durchsicht` ist absichtlich eine eigene Spalte statt
-- aus `anbieter IS NOT NULL` abgeleitet — ein Fonds, dessen Haus keine Bestandteile zeigt
-- (`gesperrt`), ist etwas anderes als eine ISIN, die kein Katalog kennt (`unbekannt`).
CREATE TABLE fonds_aufloesung (
  isin          TEXT PRIMARY KEY,
  anbieter      TEXT,             -- ishares | xtrackers | amundi | firsttrust | lgim | NULL
  durchsicht    TEXT NOT NULL,    -- moeglich | gesperrt | unbekannt
  adresse       TEXT,             -- nur ishares: die aufgeloeste Holdings-Adresse
  geprueft_am   TEXT NOT NULL     -- Kalendertag des Katalogabrufs  [INV-03]
);
