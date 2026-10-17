-- Angewendet am 17.10.2026 (Recherche-Chat, Vorgabe Daniel 10:48).
-- 1. angabe.startbestand: Korrekturen des Startbestands erscheinen nicht im Änderungsprotokoll der Website.
-- 2. v_aenderungsprotokoll um startbestand erweitert.
-- 3. Kommentare zu Anbietern (organisation) und Angeboten (angebot), Sicht v_anbieter.
alter table public.angabe add column if not exists startbestand boolean not null default false;
comment on column public.angabe.startbestand is 'true: Korrektur des Startbestands vom 16.10.2026; erscheint nicht im Änderungsprotokoll der Website (Vorgabe Daniel, 17.10.2026). In aenderungen.csv bleibt sie mit Kennzeichen enthalten.';

create or replace view public.v_aenderungsprotokoll with (security_invoker = true) as
 SELECT a.id, a.erfasst_am, a.angebot_id, an.slug AS angebot_slug, an.name AS angebot_name, o.name AS organisation_name,
    a.merkmal_key, m.bezeichnung AS merkmal_bezeichnung, m.datentyp, a.aenderungsart, a.ausgeloest_durch, a.status,
    a.wert_text, a.wert_zahl, a.wert_bool, a.wert_datum, a.wert_auswahl, COALESCE(a.einheit, m.einheit) AS einheit,
    a.kwp_von, a.kwp_bis, a.netzgebiet, a.bedingung, a.gueltig_ab, a.anmerkung,
    v.status AS vorher_status, v.wert_text AS vorher_wert_text, v.wert_zahl AS vorher_wert_zahl, v.wert_bool AS vorher_wert_bool,
    v.wert_datum AS vorher_wert_datum, v.wert_auswahl AS vorher_wert_auswahl,
    q.titel AS quelle_titel, q.url AS quelle_url, q.abgerufen_am AS quelle_abgerufen_am,
    a.startbestand
   FROM angabe a
     JOIN angebot an ON an.id = a.angebot_id
     JOIN organisation o ON o.id = an.organisation_id
     JOIN merkmal m ON m.key = a.merkmal_key
     JOIN quelle q ON q.id = a.quelle_id
     LEFT JOIN angabe v ON v.id = a.ersetzt_id;

comment on table public.organisation is 'Anbieter: Unternehmen, die Angebote machen oder Plattformen betreiben. Ein Anbieter kann mehrere Angebote haben.';
comment on table public.angebot is 'Angebote: Produkte der Anbieter (organisation_id verweist auf den Anbieter).';

create or replace view public.v_anbieter with (security_invoker = true) as
select o.id, o.slug, o.name, o.rechtlicher_name, o.website,
  count(a.id) filter (where a.oeffentlich) as angebote_oeffentlich,
  count(a.id) filter (where a.oeffentlich and a.kategorie_key = 'endkunden') as angebote_endkunden,
  count(a.id) filter (where a.oeffentlich and a.kategorie_key = 'dienstleister') as angebote_unternehmen,
  array_agg(a.slug order by a.name) filter (where a.oeffentlich) as angebote
from public.organisation o
left join public.angebot a on a.organisation_id = o.id
group by o.id;
revoke all on public.v_anbieter from anon, authenticated;
grant select on public.v_anbieter to anon, authenticated;
comment on view public.v_anbieter is 'Anbieter mit Anzahl ihrer veröffentlichten Angebote.';
