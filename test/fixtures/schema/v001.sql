-- Je Tabelle aus 001-basis.sql eine synthetische Zeile, nur mit v1-Spalten.
-- Wird von test/db/migration.test.ts auf jedem Zwischenstand eingespielt.
INSERT INTO raw_snapshot (id, quelle, abgerufen_am, payload_json)
  VALUES (1, 'holdings', '2026-01-02T10:00:00+01:00', '{"items":[]}');
INSERT INTO transaktion (id, ts, tag, art, typ, isin, menge_e8, betrag_cent, beschreibung, status, ist_extern, storniert, gesehen_am)
  VALUES ('T1', '2026-01-02T09:00:00+01:00', '2026-01-02', 'WERTPAPIER', 'BUY', 'XX0000000001', 150000000, -10000, 'Kauf', 'EXECUTED', 0, 0, '2026-01-02T10:00:00+01:00');
INSERT INTO kurs (isin, tag, kurs_e6, herkunft, auffaellig)
  VALUES ('XX0000000001', '2026-01-02', 66666666, 'transaktion', 0);
INSERT INTO bestand (isin, name, menge_e8, kurs_e6, stand)
  VALUES ('XX0000000001', 'Beispielfonds', 150000000, 66666666, '2026-01-02');
INSERT INTO sparplan (isin, name, betrag_cent, frequenz, tag_im_monat, naechste_ausfuehrung, stand)
  VALUES ('XX0000000001', 'Beispielfonds', 5000, 'MONTHLY', 1, '2026-02-01', '2026-01-02');
INSERT INTO depot_tag (tag, wertpapiere_cent, cash_cent, gesamt_cent, netto_einzahlung_kum_cent, kern_version, eingabe_hash, berechnet_am, lueckenhaft)
  VALUES ('2026-01-02', 10000, 0, 10000, 10000, 1, 'abc', '2026-01-02T10:00:00+01:00', 0);
INSERT INTO etf_bestandteil (fonds_isin, stand, unternehmen_isin, name, gewicht, sektor, land)
  VALUES ('XX0000000001', '2026-01-02', 'XX0000000002', 'Beispiel AG', 0.05, 'IT', 'DE');
INSERT INTO vpi (monat, index_wert, quelle) VALUES ('2025-12', 123.4, 'eurostat');
INSERT INTO lauf (id, gestartet, beendet, status, fehler_code, fehler_text, quellen_json, hinweise_json)
  VALUES (1, '2026-01-02T10:00:00+01:00', '2026-01-02T10:01:00+01:00', 'erfolg', NULL, NULL, '{"holdings":"erfolg"}', '["Altsatz"]');
