-- Angewendet am 17.10.2026 (Supabase-Migration nomos_korrektur_anlass_bereinigen), Vorgabe Daniel.
-- Anlass der zwei Korrekturen am Nomos-Eintrag war versehentlich „hinweis_dritte“ statt „eigene_recherche“.
-- Bereinigung im Wartungsmodus; protokolliert in intern.aenderungslog.
select set_config('dv.wartung', 'an', true);
update public.angabe
   set ausgeloest_durch = 'eigene_recherche'
 where id in ('e7c71593-0ed0-4a5b-98c9-49d7764297e2', 'f4d35e67-fa4d-4ded-bb6f-3b5a959d4c2d')
   and ausgeloest_durch = 'hinweis_dritte';
