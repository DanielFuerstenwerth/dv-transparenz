# Erfassungsregeln

Verbindliche Regeln für alle, die Daten im Transparenzportal Direktvermarktung erfassen, Menschen wie KI. Supabase-Projekt `dv-transparenz` (ID `cfpxazyhhgtfttztcwmx`, Frankfurt).

## Grundsätze

1. **Nur veröffentlichte Informationen.** Websites, Preisblätter, AGB, Pressemitteilungen, Fachpresse, Registereinträge. Einzige Ausnahme: Korrekturen, die ein Anbieter schriftlich mitteilt. Sie werden als Quelle vom Typ `anbieterauskunft` erfasst (mit `ausgeloest_durch = 'hinweis_anbieter'`) und auf der Website automatisch als „Mitteilung des Anbieters“ gekennzeichnet.
2. **Jede Angabe hat eine Quelle mit Abrufdatum.** Ohne Quelle keine Angabe.
3. **Nichts erfinden, nichts schätzen.** Was der Anbieter nicht veröffentlicht, wird mit Status `nicht_veroeffentlicht` erfasst. Widersprüchliches oder Unklares mit `unklar` und einer Anmerkung.
4. **Nah am Wortlaut.** Texte sachlich und knapp; wörtliche Zitate gehören in `originalwortlaut`.
5. **Primärquelle vor Sekundärquelle.** Anbieterseite oder AGB vor Pressebericht. Liegen beide vor, kann die Angabe aus beiden Quellen je eine Zeile erhalten.
6. **Neutral.** Keine Bewertungen, keine Empfehlungen, keine Adjektive wie „günstig“ oder „attraktiv“.
7. **Keine personenbezogenen Daten** in öffentlichen Tabellen. Hinweise von Personen gehören in `intern.rueckmeldung`.
8. **Neue Angebote immer als Entwurf** (`oeffentlich = false`). Veröffentlicht wird erst nach Freigabe durch Daniel: `update public.angebot set oeffentlich = true, aufgenommen_am = current_date where slug = '…';`

## Datenmodell

| Tabelle | Inhalt |
|---|---|
| `organisation` | Unternehmen. Ein Unternehmen kann mehrere Angebote haben (Lumenaza: Plattform und Marke LUOX). |
| `angebot` | Ein Produkt. `kategorie_key`: `endkunden` oder `dienstleister`. `slug` bildet die URL. |
| `quelle` | Beleg mit `typ`, `titel`, `url`, `herausgeber`, `veroeffentlicht_am`, `abgerufen_am`, optional `archiv_url` und `beleg_pfad` (Datei im Storage-Bucket `belege`). |
| `merkmal` | Katalog der Merkmale mit Datentyp, Einheit, Definition und Ausprägungen. Neue Merkmale nur nach Rücksprache. |
| `angabe` | Ein Wert zu einem Merkmal eines Angebots. Wird nur fortgeschrieben, nie geändert oder gelöscht. |
| `kalkulator_abfrage` | Ergebnis eines Anbieterrechners für einen Referenzfall. Ebenfalls nur fortschreiben. |
| `referenzfall` | Feste Konstellationen für Rechnerabfragen (7/10/25/100 kWp × 30/60 % Eigenverbrauch, 900 kWh/kWp). |
| `beziehung` | Verbindungen: `marke_von`, `tochter_von`, `nutzt_plattform_von`, `kooperation_mit`, `vertrieb_durch`. Nur mit Quelle. |
| `intern.rueckmeldung` | Eingegangene Hinweise (nicht öffentlich). |

Sichten: `v_angabe_aktuell` (gültiger Stand), `v_angabe_verlauf` (alle gültigen Stände mit `gueltig_ab`/`gueltig_bis`), `v_aenderungsprotokoll` (jede Zeile mit Vorwert).

## Werte erfassen

Je nach Datentyp des Merkmals genau ein Wertfeld füllen:

| Datentyp | Feld | Beispiel |
|---|---|---|
| `zahl` | `wert_zahl` (Einheit kommt aus dem Merkmal) | Grundgebühr `5.99` |
| `text` | `wert_text` | Vergütungsmodell |
| `auswahl` | `wert_auswahl` mit genau einem Schlüssel | `'{erforderlich}'` |
| `mehrfachauswahl` | `wert_auswahl` mit Schlüsseln | `'{boersenpreis,bonus}'` |
| `datum` | `wert_datum` | `2027-01-01` |

Geltungsbereich: `kwp_von`, `kwp_bis` (Staffeln), `netzgebiet` (regionale Unterschiede, etwa Verfügbarkeit je VNB), `bedingung` (Freitext). Kosten: `steuer` = `brutto`, `netto` oder `unklar`, wenn die Quelle es erkennen lässt.

Die Datenbank prüft Datentyp und Ausprägungen und lehnt falsche Werte ab.

## Änderungen

Bestehende Zeilen werden nie überschrieben. Eine Änderung ist eine neue Zeile mit `ersetzt_id` = ID der bisherigen Zeile:

| `aenderungsart` | Wann | `gueltig_ab` |
|---|---|---|
| `aenderung_anbieter` | Der Anbieter hat Konditionen geändert. Bleibt als früherer Stand im Verlauf sichtbar. | Datum, ab dem die neue Kondition gilt |
| `korrektur` | Die bisherige Angabe war falsch erfasst. Die alte Zeile verschwindet aus dem Verlauf, bleibt im Protokoll. | wie bisher |
| `praezisierung` | Die Angabe wird genauer, ohne dass sie falsch war. | wie bisher |

`ausgeloest_durch`: `eigene_recherche`, `hinweis_anbieter`, `hinweis_nutzer`, `hinweis_dritte`.

```sql
-- Beispiel: Anbieter erhöht Grundgebühr ab 1.3.2027
insert into public.angabe (angebot_id, merkmal_key, wert_zahl, quelle_id, gueltig_ab, aenderungsart, ausgeloest_durch, ersetzt_id)
select a.angebot_id, a.merkmal_key, 6.99, '<neue quelle_id>', '2027-03-01', 'aenderung_anbieter', 'eigene_recherche', a.id
from public.v_angabe_aktuell a join public.angebot an on an.id = a.angebot_id
where an.slug = 'spotmyenergy-smartflux' and a.merkmal_key = 'entgelt_grund';
```

Bewusste Bereinigung von Fehleingaben (nur Daniel): `set local dv.wartung = 'an';` in derselben Transaktion. Jede Änderung landet zusätzlich in `intern.aenderungslog`.

## Gruppen der Übersicht (seit 16.10.2026)

Die Übersicht gliedert Angebote für Endkunden nach dem Merkmal `kopplung` („Gekoppelt an“, Mehrfachauswahl). Die konkreten Produkte stehen in `bedingung` und erscheinen in der Liste als „nur mit …“.

| Werte in `kopplung` | Gruppe | Reihenfolge in der Gruppe |
|---|---|---|
| `keine` | Ohne weitere Produkte | nach `erstmals_veroeffentlicht` |
| `stromtarif`, `messstellenbetrieb` oder `technik` | Gekoppelt an Stromtarif oder Technik | alphabetisch nach Anbieter |
| enthält `hardware_anbieter` | Gekoppelt an Hardware des Anbieters | alphabetisch nach Anbieter |
| fehlt | Kopplung noch nicht erfasst | alphabetisch |

- `technik`: bestimmte Technik wie Speicher oder Energiemanager, die auch von Dritten stammen kann, sofern kompatibel.
- `hardware_anbieter`: Anlage, Speicher oder Energiemanager des Anbieters oder seiner Partner.
- Ein intelligentes Messsystem eines beliebigen Messstellenbetreibers zählt nicht als Kopplung; `messstellenbetrieb` nur, wenn der Messstellenbetrieb über den Anbieter laufen muss.
- Ist die Kopplung nicht eindeutig belegt, `status = 'unklar'` mit den wahrscheinlichen Werten in `wert_auswahl` und Begründung in `anmerkung`; die Liste markiert das mit „unklar“.
- `status_kurz`: Status und Start in einer Zeile für die Liste, aus derselben Quelle. Fehlt er, zeigt die Liste die Bezeichnung des Status.
- `erstmals_veroeffentlicht`: Datum der ersten auffindbaren Ankündigung oder Veröffentlichung, mit Quelle.

Die Merkmale `stromliefervertrag`, `zusatzhardware`, `speicher` und `anlage_vom_anbieter` werden weiter erfasst und stehen in der Detailansicht; sie bestimmen die Gruppe nicht mehr.

## Rechnerabfragen

- Nur die Referenzfälle aus `referenzfall` verwenden; Ausrichtung und Messsystem nicht variieren.
- Fragt ein Rechner eine EEG-Vergütung ab, den Satz zum Abfragezeitpunkt eingeben.
- Manuell abfragen, keine automatisierten Massenabfragen.
- Ergebnis so speichern, wie es angezeigt wird: `eingaben` und `ergebnis` als JSON, `ergebnis_kurz` als lesbarer Satz, Bildschirmkopie in den Bucket `belege`, Pfad in `beleg_pfad`.
- Wiederholung etwa alle drei Monate als neue Zeile.

## Aufnahmekriterien

Aufgenommen wird jedes Angebot, mit dem PV-Anlagen bis 100 kWp (Modulleistung) direkt vermarktet werden, auch in Verbindung mit Stromtarif, Hardware, Community oder Service, gefördert wie ungefördert. „Angekündigt“ verlangt eine öffentliche Ankündigung mit Quelle. Dienstleister und Plattformen, die Prozesse der Direktvermarktung für andere übernehmen, gehören in die Kategorie `dienstleister`.

## Veröffentlichung

Die Website liest stündlich aus der Datenbank und baut sich neu. Änderungen sind spätestens nach einer Stunde online; sofort über „Run workflow“ im GitHub-Repository.
