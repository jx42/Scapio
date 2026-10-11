-- Migration 001 — Basisschema.
-- Nur vorwaerts. Wer hier etwas aendert, schreibt 002, nicht diese Datei um.

CREATE TABLE raw_snapshot (
  id            INTEGER PRIMARY KEY,
  quelle        TEXT NOT NULL,            -- holdings | transaktionen | kurse:<isin> | …
  abgerufen_am  TEXT NOT NULL,            -- ISO 8601 mit Offset
  payload_json  TEXT NOT NULL
);
CREATE INDEX idx_raw_quelle ON raw_snapshot(quelle, abgerufen_am DESC);

CREATE TABLE transaktion (
  id            TEXT PRIMARY KEY,         -- ID der Bank
  ts            TEXT NOT NULL,            -- ISO 8601 mit Offset, wie geliefert
  tag           TEXT NOT NULL,            -- YYYY-MM-DD, Europe/Berlin  [INV-03]
  art           TEXT NOT NULL,            -- WERTPAPIER | CASH
  typ           TEXT NOT NULL,            -- SAVINGS_PLAN | BUY | SELL | CASH_TRANSFER_IN | …
  isin          TEXT,
  menge_e8      INTEGER,                  -- Stück × 1e8    [INV-02]
  betrag_cent   INTEGER NOT NULL,         -- Vorzeichen aus Sicht des Depots
  beschreibung  TEXT,                     -- FREMDTEXT, nie interpretieren  [INV-06]
  status        TEXT NOT NULL,            -- EXECUTED | PENDING | CANCELED
  ist_extern    INTEGER NOT NULL,         -- 0/1, entscheidet über XIRR  [P-05]
  storniert     INTEGER NOT NULL DEFAULT 0,
  gesehen_am    TEXT NOT NULL
);
CREATE INDEX idx_tx_tag ON transaktion(tag);
CREATE INDEX idx_tx_isin_tag ON transaktion(isin, tag);

CREATE TABLE kurs (
  isin        TEXT NOT NULL,
  tag         TEXT NOT NULL,
  kurs_e6     INTEGER NOT NULL,           -- EUR × 1e6
  herkunft    TEXT NOT NULL,              -- transaktion | chart_1m | chart_3m | chart_1y | chart_max
  auffaellig  INTEGER NOT NULL DEFAULT 0, -- Tagessprung > 30 %  [P-08]
  PRIMARY KEY (isin, tag)
);

CREATE TABLE bestand (
  isin TEXT PRIMARY KEY, name TEXT NOT NULL,
  menge_e8 INTEGER NOT NULL, kurs_e6 INTEGER NOT NULL, stand TEXT NOT NULL
);

CREATE TABLE sparplan (
  isin TEXT PRIMARY KEY, name TEXT NOT NULL, betrag_cent INTEGER NOT NULL,
  frequenz TEXT NOT NULL, tag_im_monat INTEGER, naechste_ausfuehrung TEXT, stand TEXT NOT NULL
);

CREATE TABLE depot_tag (
  tag                       TEXT PRIMARY KEY,
  wertpapiere_cent          INTEGER NOT NULL,
  cash_cent                 INTEGER NOT NULL,
  gesamt_cent               INTEGER NOT NULL,
  netto_einzahlung_kum_cent INTEGER NOT NULL,
  kern_version              INTEGER NOT NULL,
  eingabe_hash              TEXT NOT NULL,
  berechnet_am              TEXT NOT NULL,
  lueckenhaft               INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE etf_bestandteil (
  fonds_isin TEXT NOT NULL, stand TEXT NOT NULL,
  unternehmen_isin TEXT NOT NULL, name TEXT NOT NULL,
  gewicht REAL NOT NULL, sektor TEXT, land TEXT,
  PRIMARY KEY (fonds_isin, stand, unternehmen_isin)
);

CREATE TABLE vpi (monat TEXT PRIMARY KEY, index_wert REAL NOT NULL, quelle TEXT NOT NULL);

CREATE TABLE lauf (
  id INTEGER PRIMARY KEY, gestartet TEXT NOT NULL, beendet TEXT,
  status TEXT NOT NULL,                   -- laufend | erfolg | teilweise | fehler
  fehler_code TEXT, fehler_text TEXT,
  quellen_json TEXT NOT NULL,             -- {"kurse": "erfolg", "ishares": "fehler", …}
  hinweise_json TEXT                      -- Plausibilitätsbefunde, Anzahlen — nie Inhalte
);
