-- Angewendet am 17.10.2026 (Supabase-Migration kopplung_technik_keine_kopplung).
-- Merkmal „kopplung“: „Technik“ ist seit 17.10.2026 keine Kopplung mehr (Vorgabe Daniel).
-- Die Website blendet die Ausprägung bereits aus (VERALTET in scripts/build.mjs);
-- die Angaben zu Octopus SolarUp, Rabot Energy und Tibber sind bereits als Korrektur fortgeschrieben.

update public.merkmal
   set definition = 'An welche weiteren Produkte des Anbieters die Direktvermarktung gebunden ist: Stromtarif, Messstellenbetrieb oder Hardware des Anbieters oder seiner Partner. Ein ohnehin erforderliches intelligentes Messsystem eines beliebigen Messstellenbetreibers zählt nicht, ebenso wenig technische Voraussetzungen, die Geräte beliebiger Hersteller erfüllen können; diese stehen in der Bedingung. Bestimmt die Gruppe in der Übersicht.',
       optionen = '[{"key":"keine","bezeichnung":"Keine weiteren Produkte"},{"key":"stromtarif","bezeichnung":"Stromtarif des Anbieters"},{"key":"messstellenbetrieb","bezeichnung":"Messstellenbetrieb über den Anbieter"},{"key":"technik","bezeichnung":"Bestimmte Technik (bis 17.10.2026, seitdem keine Kopplung)"},{"key":"hardware_anbieter","bezeichnung":"Hardware oder Anlage des Anbieters oder seiner Partner"}]'::jsonb
 where key = 'kopplung';
