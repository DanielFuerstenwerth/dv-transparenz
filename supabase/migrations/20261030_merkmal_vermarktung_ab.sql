-- Angewendet am 30.10.2026 (Recherche-Chat, Freigabe Daniel 28./30.10.2026; Vorschlag Wochencheck 26.10.2026).
-- Neues Merkmal „Beginn der Vermarktung“. Die zugehörigen Angaben (7 Angebote) und die Rabot-Änderungen
-- stehen in supabase/ausstehend/freigabe_wochencheck_2026-10-26.sql (ebenfalls am 30.10. angewendet).
insert into public.merkmal (key, bezeichnung, gruppe, datentyp, einheit, definition, optionen, kategorien, sortierung, in_uebersicht, aktiv) values
('vermarktung_ab', 'Beginn der Vermarktung', 'Verfügbarkeit', 'text', null,
 'Ab wann der Anbieter den Strom laut eigener Veröffentlichung tatsächlich vermarktet oder vergütet, wenn das vom Vertragsabschluss oder von der Buchbarkeit abweicht.',
 null, array['endkunden'], 22, false, true);
