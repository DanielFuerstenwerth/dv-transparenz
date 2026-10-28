-- ANGEWENDET am 31.10.2026 (Recherche-Chat, Freigabe Daniel 31.10.2026: „veröffentliche zuerst und jetzt gleich den Entwurf nur für E3/DC“; zusammen mit dem Patch „Änderungsprotokoll: Aufnahmetag“).
-- Entscheidung Daniel 30.10.2026: vorerst zurückhalten. Erst ausführen, wenn Daniel freigibt UND der Code-Patch
-- „Änderungsprotokoll: Entwürfe am Aufnahmetag“ (scripts/build.mjs) live ist; sonst erscheint E3/DC im
-- Änderungsprotokoll am Erfassungstag 26.10.2026 als „Ergänzt“ statt am Freigabetag als „Aufgenommen“.
-- Tarifseite https://www.e3dc.com/power/ am 26. und 31.10. nicht abrufbar (Serverfehler bzw. Weiterleitungsschleife); Grundlage bleibt die Pressemitteilung.

begin;

update public.angebot
   set oeffentlich = true, aufgenommen_am = current_date
 where slug = 'e3dc-power-fix' and oeffentlich = false;

select slug, oeffentlich, aufgenommen_am from public.angebot where slug = 'e3dc-power-fix';

commit;
