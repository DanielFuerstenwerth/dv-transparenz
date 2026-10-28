-- ANGEWENDET am 30.10.2026 (Recherche-Chat, auf Daniels Freigabe vom 30.10.2026: „Live, aber E3/DC zurückhalten“).
-- Freigabe Wochencheck 26.10.2026. Entscheidung Daniel 28.10.2026: „Alle Vorschläge finde ich gut“.
--
-- Enthält:
--   1) Rabot Energy: Start, Status kurz, weitere Bedingungen, Hinweis nach der Pressemitteilung vom 20.10.2026
--      (Sandbox-Stapel 'wochencheck-2026-10-26', 4 Zeilen). Vergütung 7–8 ct/kWh und Status bleiben.
--   2) Neues Merkmal „Beginn der Vermarktung“ (vermarktung_ab) mit Angaben zu 7 veröffentlichten Angeboten.
--      SpotmyEnergy (beide Einträge) nach der Mitteilung des Anbieters per E-Mail (Vorgabe Daniel 30.10.: Info aus der E-Mail beibehalten).
-- Die Veröffentlichung von E3/DC ist ausgegliedert: supabase/ausstehend/freigabe_e3dc_power_fix.sql
-- (erst zusammen mit dem Code-Patch „Änderungsprotokoll: Aufnahmetag“).
begin;

-- 0) Sicherung: Jede zu ersetzende Angabe muss noch die aktuelle sein; Merkmal darf noch nicht existieren.
do $$
declare n int;
begin
  select count(*) into n
    from intern.angabe_sandbox s
   where s.vorschlag = 'wochencheck-2026-10-26' and s.uebernommen_am is null and s.ersetzt_merkmal
     and not exists (
       select 1 from public.v_angabe_aktuell v
        where v.angebot_id = s.angebot_id and v.merkmal_key = s.merkmal_key
          and v.id = substring(s.notiz_intern from 'ersetzt_id=([0-9a-f-]{36})')::uuid);
  if n > 0 then raise exception 'Abbruch: % Sandbox-Zeile(n) ersetzen keine aktuelle Angabe mehr', n; end if;
  if (select count(*) from intern.angabe_sandbox where vorschlag = 'wochencheck-2026-10-26' and uebernommen_am is null) <> 4 then
    raise exception 'Abbruch: Sandbox-Stapel wochencheck-2026-10-26 nicht vollständig oder schon übernommen';
  end if;
  if exists (select 1 from public.merkmal where key = 'vermarktung_ab') then
    raise exception 'Abbruch: Merkmal vermarktung_ab existiert bereits';
  end if;
end $$;

-- 1) Rabot Energy aus der Sandbox übernehmen
insert into public.angabe
  (angebot_id, merkmal_key, status, wert_text, wert_zahl, wert_bool, wert_datum, wert_auswahl,
   einheit, steuer, originalwortlaut, kwp_von, kwp_bis, netzgebiet, bedingung, gueltig_ab,
   quelle_id, aenderungsart, ausgeloest_durch, ersetzt_id, anmerkung, startbestand)
select
  s.angebot_id, s.merkmal_key, s.status, s.wert_text, s.wert_zahl, s.wert_bool, s.wert_datum, s.wert_auswahl,
  s.einheit, s.steuer, s.originalwortlaut, s.kwp_von, s.kwp_bis, s.netzgebiet, s.bedingung, s.gueltig_ab,
  s.quelle_id, s.aenderungsart, s.ausgeloest_durch,
  case when s.ersetzt_merkmal then substring(s.notiz_intern from 'ersetzt_id=([0-9a-f-]{36})')::uuid end,
  s.anmerkung, s.startbestand
from intern.angabe_sandbox s
where s.vorschlag = 'wochencheck-2026-10-26' and s.uebernommen_am is null
order by (select sortierung from public.merkmal m where m.key = s.merkmal_key);

update intern.angabe_sandbox
   set uebernommen_am = now()
 where vorschlag = 'wochencheck-2026-10-26' and uebernommen_am is null;

-- 2) Merkmal „Beginn der Vermarktung“ (Vorschlag Wochencheck 26.10., freigegeben 28.10.2026)
insert into public.merkmal (key, bezeichnung, gruppe, datentyp, einheit, definition, optionen, kategorien, sortierung, in_uebersicht, aktiv) values
('vermarktung_ab', 'Beginn der Vermarktung', 'Verfügbarkeit', 'text', null,
 'Ab wann der Anbieter den Strom laut eigener Veröffentlichung tatsächlich vermarktet oder vergütet, wenn das vom Vertragsabschluss oder von der Buchbarkeit abweicht.',
 null, array['endkunden'], 22, false, true);

insert into public.angabe (angebot_id, merkmal_key, status, wert_text, originalwortlaut, quelle_id, aenderungsart, ausgeloest_durch, anmerkung)
select an.id, 'vermarktung_ab', 'veroeffentlicht', v.wert, v.orig, v.quelle_id::uuid, 'neu', coalesce(v.anlass, 'eigene_recherche'), v.anm
from (values
  ('rabot-direktvermarktung',
   'Belieferung erster Kunden ab Februar 2027; buchbar ab Mitte November 2026',
   'Ab Mitte November ist das Angebot buchbar, die ersten Kunden können ab Februar 2027 in die Belieferung starten.',
   '773fcc73-9997-4ece-a8ca-bdf012088649', null, null),
  ('cloover-einspeiseverguetung',
   'Zum Monatsersten, frühestens ab 1. Dezember 2026; buchbar seit 15.10.2026',
   null, '26b402ec-74c6-4b33-b5c0-7366e26ee0a7', null, null),
  ('spotmyenergy-smartflux',
   'Überführung in die Direktvermarktung nach der 36-monatigen Übergangsfrist bzw. sobald MiSpeL beim Verteilnetzbetreiber aktiv ist (Neuanlagen ab 1.1.2027); Verträge seit 29.09.2026',
   null, '9d1544da-3406-4a3f-b74d-5c8e11c98255',
   'Aus der Mitteilung von SpotmyEnergy (E-Mail an dv@1000gw.de, Foliensatz „SmartFlux“, Stand 29.09.2026); gleicher Inhalt wie „Angekündigter Start“.',
   'hinweis_anbieter'),
  ('spotmyenergy-smartflux-stromtarif',
   'Überführung in die Direktvermarktung nach der 36-monatigen Übergangsfrist bzw. sobald MiSpeL beim Verteilnetzbetreiber aktiv ist (Neuanlagen ab 1.1.2027); Verträge seit 29.09.2026',
   null, '9d1544da-3406-4a3f-b74d-5c8e11c98255',
   'Aus der Mitteilung von SpotmyEnergy (E-Mail an dv@1000gw.de, Foliensatz „SmartFlux“, Stand 29.09.2026); gleicher Inhalt wie „Angekündigter Start“.',
   'hinweis_anbieter'),
  ('sonnen-virtuelles-kraftwerk',
   'In der Regel zwei Monate nach der Anmeldung; nicht bei allen Netzbetreibern möglich',
   null, '39c82f49-3908-47c1-abbf-383aae94b794', null, null),
  ('enpal-verguetung',
   'Nach Freigabe durch den Netzbetreiber; bis dahin gilt die gesetzliche Einspeisevergütung',
   null, 'd4db054c-7274-4f73-9a7e-6218082786fc',
   'Wie lange die Freigabe dauert, hängt laut Anbieter vom Netzbetreiber ab.', null),
  ('octopus-solarup',
   'Pauschale ab Installation aller Komponenten, in der Regel nach vier bis sechs Monaten; bis dahin vorläufiger Tarif, eine bestehende EEG-Vergütung kann weiter bezogen werden',
   null, '9e79aba7-5968-4e50-a1ff-8f440d7fcf44', null, null)
) v(slug, wert, orig, quelle_id, anm, anlass)
join public.angebot an on an.slug = v.slug and an.oeffentlich;

-- Kontrolle (muss 4 / 7 ergeben)
select
  (select count(*) from public.angabe a join public.angebot an on an.id = a.angebot_id
    where an.slug = 'rabot-direktvermarktung' and a.quelle_id = '773fcc73-9997-4ece-a8ca-bdf012088649' and a.merkmal_key <> 'vermarktung_ab') as rabot,
  (select count(*) from public.angabe where merkmal_key = 'vermarktung_ab') as vermarktung_ab;

commit;

-- Danach: nächster Website-Neubau (stündlich) oder sofort über „Run workflow“.
-- Prüfen: Rabot zeigt „Warteliste offen; buchbar ab Mitte November 2026, Belieferung ab Februar 2027“;
-- Detailansicht hat die Spalte „Beginn der Vermarktung“; Methodik listet das Merkmal im Glossar;
-- Änderungsprotokoll zeigt am Freigabetag Rabot (Änderungen des Anbieters) und Ergänzungen bei sieben Angeboten.
