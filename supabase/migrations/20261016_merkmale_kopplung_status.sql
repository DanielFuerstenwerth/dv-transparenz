-- Angewendet am 16.10.2026 (Recherche-Chat, auf Daniels Vorgabe zur Gliederung der Übersicht).
-- Drei neue Merkmale: Kopplung an weitere Produkte, Kurzstatus für die Liste, erste Veröffentlichung.

insert into public.merkmal (key, bezeichnung, gruppe, datentyp, einheit, definition, optionen, kategorien, sortierung, in_uebersicht, aktiv) values
('kopplung', 'Gekoppelt an', 'Voraussetzungen', 'mehrfachauswahl', null,
 'An welche weiteren Produkte die Direktvermarktung gebunden ist. Ein ohnehin erforderliches intelligentes Messsystem eines beliebigen Messstellenbetreibers zählt nicht. Die konkreten Produkte stehen in der Bedingung. Bestimmt die Gruppe in der Übersicht.',
 '[{"key":"keine","bezeichnung":"Keine weiteren Produkte"},{"key":"stromtarif","bezeichnung":"Stromtarif des Anbieters"},{"key":"messstellenbetrieb","bezeichnung":"Messstellenbetrieb über den Anbieter"},{"key":"technik","bezeichnung":"Bestimmte Technik, auch von Dritten, sofern kompatibel"},{"key":"hardware_anbieter","bezeichnung":"Hardware oder Anlage des Anbieters oder seiner Partner"}]'::jsonb,
 array['endkunden'], 48, true, true),
('status_kurz', 'Status kurz', 'Verfügbarkeit', 'text', null,
 'Status und Start in einer Zeile für die Übersicht, nach derselben Quelle wie Status oder angekündigter Start.',
 null, array['endkunden'], 11, true, true),
('erstmals_veroeffentlicht', 'Erstmals veröffentlicht', 'Verfügbarkeit', 'datum', null,
 'Datum der ersten auffindbaren öffentlichen Ankündigung oder Veröffentlichung des Angebots. Bestimmt die Reihenfolge in der Gruppe „Ohne weitere Produkte“.',
 null, array['endkunden'], 26, false, true);
