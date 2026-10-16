-- Angewendet am 16.10.2026 (Recherche-Chat, Vorgabe Daniel 21:33): Merkmal Preisgestaltung.
insert into public.merkmal (key, bezeichnung, gruppe, datentyp, einheit, definition, optionen, kategorien, sortierung, in_uebersicht, aktiv) values
('preisgestaltung', 'Preisgestaltung', 'Kosten', 'text', null,
 'Was Kundinnen und Kunden dem Anbieter zahlen, knapp zusammengefasst: Entgelte, Abzüge und Erlösanteile sowie an das Angebot gebundene Tarife oder Hardware. Nur aus Quellen des Anbieters; Angaben, die nur aus der Fachpresse stammen, sind als solche gekennzeichnet.',
 null, array['endkunden'], 69, true, true);
