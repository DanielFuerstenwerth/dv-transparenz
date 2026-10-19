-- Angewendet am 19.10.2026 (Recherche-Chat, Vorgabe Daniel 19.10.): Merkmal Angebotsform.
-- Pilotprojekte und befristete Aktionen werden in der Übersicht nicht nach Kopplung eingereiht,
-- sondern stehen in einer eigenen Gruppe ganz unten und zählen nicht in die Kennzahlen.
insert into public.merkmal (key, bezeichnung, gruppe, datentyp, einheit, definition, optionen, kategorien, sortierung, in_uebersicht, aktiv) values
('angebotsform', 'Angebotsform', 'Verfügbarkeit', 'auswahl', null,
 'Ob es sich um ein reguläres Angebot oder um ein Pilotprojekt beziehungsweise eine befristete Aktion handelt. Pilotprojekte und Aktionen stehen in der Übersicht in einer eigenen Gruppe am Ende und zählen nicht in die Kennzahlen. Ohne Angabe gilt ein Angebot als regulär.',
 '[{"key":"regulaer","bezeichnung":"Reguläres Angebot"},{"key":"pilot_aktion","bezeichnung":"Pilotprojekt oder befristete Aktion"}]'::jsonb,
 array['endkunden'], 12, false, true);
