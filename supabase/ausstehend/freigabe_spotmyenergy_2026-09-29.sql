-- NOCH NICHT ANGEWENDET. Freigabe der SpotmyEnergy-Mitteilung (Stand 29.09.2026).
-- Quelle: E-Mail von SpotmyEnergy an dv@1000gw.de. Erst ausführen, wenn Daniel freigegeben hat.
-- Am besten im Supabase-SQL-Editor ausführen (ein Durchlauf).
--
-- Enthält zwei Teile:
--   1) Änderungen am bestehenden Eintrag „SmartFlux" (wird eigenständig, Gruppe „Ohne weitere Produkte").
--   2) Veröffentlichung des neuen Eintrags „SmartFlux mit Spot-Stromtarif" (Gruppe „… Stromtarif …").
--
-- Maßgeblich ist der Sandbox-Stapel 'spotmyenergy-2026-10-21'. Ein früherer Stapel
-- 'spotmyenergy-2026-09-29' in intern.angabe_sandbox ist überholt und wird NICHT übernommen.

begin;

-- 1) Bestehenden Eintrag fortschreiben (aus der Sandbox), jeweils als Fortschreibung der aktuellen Angabe
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
where s.vorschlag = 'spotmyenergy-2026-10-21'
  and s.uebernommen_am is null
order by (select sortierung from public.merkmal m where m.key = s.merkmal_key);

update intern.angabe_sandbox
   set uebernommen_am = now()
 where vorschlag = 'spotmyenergy-2026-10-21' and uebernommen_am is null;

-- 2) Neuen Eintrag veröffentlichen
update public.angebot
   set oeffentlich = true, aufgenommen_am = current_date
 where slug = 'spotmyenergy-smartflux-stromtarif' and oeffentlich = false;

commit;

-- Danach läuft der nächste Website-Neubau (stündlich) oder sofort über „Run workflow".
-- Prüfen: „SmartFlux" steht in „Ohne weitere Produkte" (nach dem 29.09.2026 einsortiert),
-- „SmartFlux mit Spot-Stromtarif" in „Gekoppelt an Stromtarif und/oder Messstellenbetrieb";
-- das Änderungsprotokoll zeigt die Korrekturen (Anlass: Mitteilung des Anbieters) und die Aufnahme.
