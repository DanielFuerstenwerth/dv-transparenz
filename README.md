# Transparenzportal Direktvermarktung

Statische Website der 1000 GW GmbH mit Angeboten zur Direktvermarktung für PV-Anlagen bis 100 kWp.

## Aufbau

- `scripts/build.mjs` liest die Daten aus Supabase und erzeugt die Website in `dist/`. Keine Abhängigkeiten außer Node 22.
- `src/` enthält Gestaltung (`style.css`), Filter (`app.js`), Schriften und Bilder.
- `site.config.json` enthält Domain, Kontaktadressen, Impressumsdaten und die optionale Reichweitenmessung.
- `.github/workflows/deploy.yml` baut stündlich, bei jedem Push und auf Knopfdruck, speichert den Datenstand in `data/snapshot.json` und veröffentlicht über GitHub Pages.
- `docs/ERFASSUNG.md` regelt, wie Daten erfasst und geändert werden.

## Lokal bauen

```bash
node scripts/build.mjs                               # Daten aus Supabase
node scripts/build.mjs --snapshot data/snapshot.json # Daten aus Datei
```

## Reichweitenmessung einschalten

In `site.config.json` bei `umami.websiteId` die Website-ID aus Umami Cloud eintragen. Die Datenschutzseite ergänzt den Abschnitt automatisch.

## Methodik ändern

Änderungen an Darstellungsregeln auf der Seite Methodik in `scripts/build.mjs` vornehmen und in `site.config.json` unter `methodikVersionen` mit Datum festhalten.
