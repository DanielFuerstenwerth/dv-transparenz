-- Noch nicht angewendet (Stand 16.10.2026).
-- Zweck: Organisationen und Quellen von Entwürfen sind über die öffentliche API nicht mehr lesbar.
-- Anwenden mit apply_migration, Name: lesezugriff_nur_veroeffentlicht

create or replace function intern.angebot_oeffentlich(p_angebot uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select oeffentlich from public.angebot where id = p_angebot), false);
$$;

create or replace function intern.organisation_sichtbar(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.angebot a where a.organisation_id = p_org and a.oeffentlich)
      or exists (select 1 from public.beziehung b where b.objekt_organisation_id = p_org
                   and (b.subjekt_angebot_id is null or exists (select 1 from public.angebot a where a.id = b.subjekt_angebot_id and a.oeffentlich))
                   and (b.subjekt_organisation_id is null or exists (select 1 from public.angebot a where a.organisation_id = b.subjekt_organisation_id and a.oeffentlich)));
$$;

create or replace function intern.quelle_sichtbar(p_quelle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.angabe g join public.angebot a on a.id = g.angebot_id where g.quelle_id = p_quelle and a.oeffentlich)
      or exists (select 1 from public.kalkulator_abfrage k join public.angebot a on a.id = k.angebot_id where k.quelle_id = p_quelle and a.oeffentlich)
      or exists (select 1 from public.beziehung b where b.quelle_id = p_quelle and intern.organisation_sichtbar(b.objekt_organisation_id));
$$;

grant usage on schema intern to anon, authenticated;
revoke all on all tables in schema intern from anon, authenticated;
grant execute on function intern.angebot_oeffentlich(uuid), intern.organisation_sichtbar(uuid), intern.quelle_sichtbar(uuid) to anon, authenticated;

drop policy organisation_lesen on public.organisation;
create policy organisation_lesen on public.organisation for select to anon, authenticated using (intern.organisation_sichtbar(id));

drop policy quelle_lesen on public.quelle;
create policy quelle_lesen on public.quelle for select to anon, authenticated using (intern.quelle_sichtbar(id));

drop policy angabe_lesen on public.angabe;
create policy angabe_lesen on public.angabe for select to anon, authenticated using (intern.angebot_oeffentlich(angebot_id));

drop policy kalkulator_lesen on public.kalkulator_abfrage;
create policy kalkulator_lesen on public.kalkulator_abfrage for select to anon, authenticated using (intern.angebot_oeffentlich(angebot_id));

drop policy beziehung_lesen on public.beziehung;
create policy beziehung_lesen on public.beziehung for select to anon, authenticated using (
  (subjekt_angebot_id is null or intern.angebot_oeffentlich(subjekt_angebot_id))
  and (subjekt_organisation_id is null or intern.organisation_sichtbar(subjekt_organisation_id)));
