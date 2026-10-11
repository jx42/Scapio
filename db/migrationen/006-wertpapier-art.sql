-- Wertpapierart je gehaltener ISIN (STOCK | ETF | ...), wie sie `get_security_quote` meldet.
--
-- Eigene Tabelle statt einer Spalte in `bestand`: `bestand` wird bei jedem Lauf komplett
-- ersetzt, die Art aendert sich nie — so bleibt sie stehen und wird nur fuer neue ISINs
-- abgefragt.
CREATE TABLE wertpapier_art (
  isin         TEXT PRIMARY KEY,
  art          TEXT NOT NULL,   -- wie geliefert, in Grossbuchstaben
  geprueft_am  TEXT NOT NULL    -- Kalendertag des Abrufs  [INV-03]
);
