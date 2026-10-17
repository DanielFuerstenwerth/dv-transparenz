-- Dritter Bereich „Angebote für Installateure“; bisheriger Bereich für Unternehmen
-- heißt „Angebote für Anbieter für Direktvermarktung“ (Vorgabe Daniel, 17.10.2026).
-- Keine neuen Merkmale: Angebote für Installateure nutzen vorhandene Merkmale.

insert into public.kategorie (key, bezeichnung, beschreibung, sortierung)
values ('installateure', 'Angebote für Installateure',
        'Angebote, mit denen Unternehmen Installationsbetrieben ermöglichen, ihren Kundinnen und Kunden eine Direktvermarktung kleiner PV-Anlagen anzubieten oder zu vermitteln, etwa als Partnerprogramm, unter eigener Marke oder über eine Plattform.',
        15)
on conflict (key) do nothing;

update public.kategorie
   set bezeichnung = 'Angebote für Anbieter für Direktvermarktung',
       beschreibung = 'Plattformen und Dienstleistungen für Unternehmen, die selbst Direktvermarktung anbieten wollen, etwa Bilanzierung, Fahrplanmanagement, Abrechnung oder Steuerung.'
 where key = 'dienstleister';

update public.merkmal
   set kategorien = array_append(kategorien, 'installateure')
 where key in ('status', 'status_kurz', 'start_angekuendigt', 'erstmals_veroeffentlicht', 'leistungsumfang', 'zielkunden', 'hinweis')
   and not ('installateure' = any (kategorien));
