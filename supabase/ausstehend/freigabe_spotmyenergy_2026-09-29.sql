-- NOCH NICHT ANGEWENDET. Freigabe der vorläufigen SpotmyEnergy-Angaben (Sandbox-Vorschlag
-- 'spotmyenergy-2026-09-29') nach public.angabe. Quelle: E-Mail von SpotmyEnergy an dv@1000gw.de.
-- Erst ausführen, wenn Daniel den Vorschlag freigegeben hat.
-- Die Angaben erscheinen danach im Änderungsprotokoll (Anlass: Mitteilung des Anbieters).

begin;

insert into public.angabe
  (angebot_id, merkmal_key, status, wert_text, wert_zahl, wert_bool, wert_datum, wert_auswahl,
   einheit, steuer, originalwortlaut, kwp_von, kwp_bis, netzgebiet, bedingung, gueltig_ab,
   quelle_id, aenderungsart, ausgeloest_durch, ersetzt_id, anmerkung, startbestand)
select
  s.angebot_id, s.merkmal_key, s.status, s.wert_text, s.wert_zahl, s.wert_bool, s.wert_datum, s.wert_auswahl,
  s.einheit, s.steuer, s.originalwortlaut, null, null, null, s.bedingung, s.gueltig_ab,
  s.quelle_id, s.aenderungsart, s.ausgeloest_durch,
  case when s.ersetzt_merkmal
       then (select v.id from public.v_angabe_aktuell v
              where v.angebot_id = s.angebot_id and v.merkmal_key = s.merkmal_key)
       else null end,
  s.anmerkung, s.startbestand
from intern.angabe_sandbox s
where s.vorschlag = 'spotmyenergy-2026-09-29'
  and s.uebernommen_am is null
order by (select sortierung from public.merkmal m where m.key = s.merkmal_key);

update intern.angabe_sandbox
   set uebernommen_am = now()
 where vorschlag = 'spotmyenergy-2026-09-29' and uebernommen_am is null;

commit;

-- Danach läuft der nächste Website-Neubau automatisch (stündlich) oder sofort über „Run workflow".
-- Prüfen: SpotmyEnergy steht dann in der Gruppe „Ohne weitere Produkte" (nach erster
-- Veröffentlichung einsortiert, 29.09.2026), und das Änderungsprotokoll zeigt die Korrekturen.
