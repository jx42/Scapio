-- Bezugswertpapier einer reinen Cash-Buchung (`cash.relatedIsin` der Bank): sagt, WOFUER
-- eine Steuer oder Ausschuettung gebucht wurde, ohne dass sich Stuecke bewegen.
--
-- Eigene Spalte statt `isin`, weil `isin` Mengenreihe, FIFO und Einstand steuert: eine
-- Steuerbuchung ohne Menge wuerde dort eine Phantomposition anlegen. `bezug_isin` wird
-- nur angezeigt, nie gerechnet.
--
-- Bestandszeilen bleiben NULL, bis der naechste Lauf sie ueberschreibt — der Import ist
-- idempotent und schreibt jede Zeile ohnehin neu. [INV-09]
ALTER TABLE transaktion ADD COLUMN bezug_isin TEXT;
