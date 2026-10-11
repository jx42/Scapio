-- Schritt, in dem ein laufender Lauf gerade steckt, fuer die Anzeige am Aktualisieren-Knopf.
-- Ein Wort aus `LAUF_SCHRITTE` (`repository/lauf.ts`), nie Fremdtext; beim Abschluss NULL.
ALTER TABLE lauf ADD COLUMN schritt TEXT;
