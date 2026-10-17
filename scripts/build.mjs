// Erzeugt die statische Website aus der Supabase-Datenbank oder aus einem Snapshot.
// Aufruf:
//   node scripts/build.mjs                         Daten aus Supabase, Ausgabe nach dist/
//   node scripts/build.mjs --snapshot datei.json   Daten aus Datei (z. B. Vorschau mit Entwürfen)
//   Optionen: --out <ordner>  --explicit-index (Links auf index.html, für Vorschauen)
//             --write-snapshot <datei> (geladene Daten zusätzlich speichern)

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const flag = (name) => args.includes(name);

const cfg = JSON.parse(await fs.readFile(path.join(ROOT, 'site.config.json'), 'utf8'));
const OUT = path.resolve(ROOT, opt('--out') || 'dist');
const EXPLICIT_INDEX = flag('--explicit-index');

// ---------------------------------------------------------------------------
// Daten laden

const RESSOURCEN = {
  kategorie: 'kategorie?select=*&order=sortierung',
  merkmal: 'merkmal?select=*&order=sortierung',
  referenzfall: 'referenzfall?select=*&order=sortierung',
  organisation: 'organisation?select=*&order=name',
  angebot: 'angebot?select=*&order=name',
  quelle: 'quelle?select=*&order=abgerufen_am.desc',
  angabe_aktuell: 'v_angabe_aktuell?select=*&order=erfasst_am',
  angabe_verlauf: 'v_angabe_verlauf?select=*&order=erfasst_am',
  aenderungsprotokoll: 'v_aenderungsprotokoll?select=*&order=erfasst_am.desc',
  kalkulator: 'kalkulator_abfrage?select=*&order=abgefragt_am.desc',
  beziehung: 'beziehung?select=*'
};

async function ladeAusSupabase() {
  const daten = {};
  for (const [schluessel, pfad] of Object.entries(RESSOURCEN)) {
    const zeilen = [];
    for (let offset = 0; ; offset += 1000) {
      const url = `${cfg.supabaseUrl}/rest/v1/${pfad}&limit=1000&offset=${offset}`;
      const res = await fetch(url, { headers: { apikey: cfg.supabasePublishableKey, Accept: 'application/json' } });
      if (!res.ok) throw new Error(`${schluessel}: HTTP ${res.status} ${await res.text()}`);
      const teil = await res.json();
      zeilen.push(...teil);
      if (teil.length < 1000) break;
    }
    daten[schluessel] = zeilen;
  }
  return daten;
}

const snapshotPfad = opt('--snapshot');
const daten = snapshotPfad
  ? JSON.parse(await fs.readFile(path.resolve(snapshotPfad), 'utf8'))
  : await ladeAusSupabase();
for (const k of Object.keys(RESSOURCEN)) daten[k] ||= [];

// Öffentlicher Bau: nur Organisationen und Quellen, die zu veröffentlichten Angeboten gehören
if (!snapshotPfad || flag('--oeffentlich')) {
  const angebotIds = new Set(daten.angebot.filter((a) => a.oeffentlich).map((a) => a.id));
  daten.angebot = daten.angebot.filter((a) => angebotIds.has(a.id));
  for (const k of ['angabe_aktuell', 'angabe_verlauf', 'aenderungsprotokoll', 'kalkulator']) daten[k] = daten[k].filter((x) => angebotIds.has(x.angebot_id));
  daten.beziehung = daten.beziehung.filter((b) => (b.subjekt_angebot_id && angebotIds.has(b.subjekt_angebot_id)) || (b.subjekt_organisation_id && daten.angebot.some((a) => a.organisation_id === b.subjekt_organisation_id)));
  const orgIds = new Set([...daten.angebot.map((a) => a.organisation_id), ...daten.beziehung.map((b) => b.objekt_organisation_id)]);
  daten.organisation = daten.organisation.filter((o) => orgIds.has(o.id));
  const quellIds = new Set([...daten.angabe_verlauf, ...daten.angabe_aktuell, ...daten.kalkulator, ...daten.beziehung].map((x) => x.quelle_id));
  daten.quelle = daten.quelle.filter((q) => quellIds.has(q.id));
}

const VORSCHAU = daten.angebot.some((a) => !a.oeffentlich);

if (opt('--write-snapshot')) {
  const stabil = {};
  for (const k of Object.keys(RESSOURCEN)) stabil[k] = daten[k];
  await fs.mkdir(path.dirname(path.resolve(opt('--write-snapshot'))), { recursive: true });
  await fs.writeFile(path.resolve(opt('--write-snapshot')), JSON.stringify(stabil, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Indizes

const by = (arr, key) => Object.fromEntries(arr.map((x) => [x[key], x]));
const group = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); (m[k] ||= []).push(x); return m; }, {});

const merkmale = by(daten.merkmal, 'key');
const kategorien = by(daten.kategorie, 'key');
const organisationen = by(daten.organisation, 'id');
const quellen = by(daten.quelle, 'id');
const referenzfaelle = by(daten.referenzfall, 'key');
const angebote = daten.angebot.map((a) => ({ ...a, organisation: organisationen[a.organisation_id] }));
const angebotById = by(angebote, 'id');
const aktuellNachAngebot = group(daten.angabe_aktuell, (x) => x.angebot_id);
const verlaufNachAngebot = group(daten.angabe_verlauf, (x) => x.angebot_id);
const ersetzteKalk = new Set(daten.kalkulator.filter((k) => k.ersetzt_id).map((k) => k.ersetzt_id));
const kalkAktuell = daten.kalkulator.filter((k) => !ersetzteKalk.has(k.id));
const kalkNachAngebot = group(kalkAktuell, (x) => x.angebot_id);

// ---------------------------------------------------------------------------
// Formatierung

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const zahl = (n, max = 2) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: max }).format(Number(n));
const datum = (d) => { if (!d) return ''; const [y, m, t] = String(d).slice(0, 10).split('-'); return `${t}.${m}.${y}`; };
const isoTag = (d) => (d ? String(d).slice(0, 10) : '');

const STATUS_ANGABE = {
  nicht_veroeffentlicht: 'Nicht veröffentlicht',
  auf_anfrage: 'Auf Anfrage',
  unklar: 'Unklar',
  nicht_zutreffend: 'Entfällt'
};
const AENDERUNGSART = {
  neu: 'Aufgenommen',
  aenderung_anbieter: 'Änderung durch den Anbieter',
  korrektur: 'Korrektur',
  praezisierung: 'Präzisierung'
};
const ANLASS = {
  eigene_recherche: 'eigene Recherche',
  hinweis_anbieter: 'Hinweis des Anbieters',
  hinweis_nutzer: 'Hinweis einer Nutzerin oder eines Nutzers',
  hinweis_dritte: 'Hinweis Dritter'
};
const BEZIEHUNG = {
  marke_von: 'Marke von',
  tochter_von: 'Tochterunternehmen von',
  nutzt_plattform_von: 'Nutzt die Plattform von',
  kooperation_mit: 'Kooperation mit',
  vertrieb_durch: 'Vertrieb durch'
};
const BEZIEHUNG_RUECK = {
  marke_von: 'Marke',
  tochter_von: 'Tochterunternehmen',
  nutzt_plattform_von: 'Plattform für',
  kooperation_mit: 'Kooperation mit',
  vertrieb_durch: 'Vertrieb für'
};
const VERFUEGBARKEIT = {
  verfuegbar: { rang: 1, label: 'Verfügbar', klasse: 'st-verfuegbar', gruppe: 'buchbar' },
  eingeschraenkt: { rang: 2, label: 'Eingeschränkt verfügbar', klasse: 'st-eingeschraenkt', gruppe: 'buchbar' },
  vorregistrierung: { rang: 3, label: 'Vorregistrierung', klasse: 'st-vorregistrierung', gruppe: 'angekuendigt' },
  angekuendigt: { rang: 4, label: 'Angekündigt', klasse: 'st-angekuendigt', gruppe: 'angekuendigt' },
  pausiert: { rang: 5, label: 'Pausiert', klasse: 'st-pausiert', gruppe: 'sonstige' },
  eingestellt: { rang: 6, label: 'Eingestellt', klasse: 'st-eingestellt', gruppe: 'sonstige' }
};

function optionLabel(merkmal, key) {
  const o = (merkmal?.optionen || []).find((x) => x.key === key);
  return o ? o.bezeichnung : key;
}

function rohwert(a, m) {
  switch (m?.datentyp) {
    case 'zahl': return a.wert_zahl;
    case 'bool': return a.wert_bool;
    case 'datum': return a.wert_datum;
    case 'auswahl':
    case 'mehrfachauswahl': return a.wert_auswahl;
    default: return a.wert_text;
  }
}

// Wert ohne Geltungsbereich, für Tabellen und Verlauf
function wertText(a, m, praefix = '') {
  const status = a[praefix + 'status'] ?? a.status;
  if (status && status !== 'veroeffentlicht') return STATUS_ANGABE[status] || status;
  const einheit = a.einheit ?? m?.einheit;
  switch (m?.datentyp) {
    case 'zahl': {
      const v = a[praefix + 'wert_zahl'];
      if (v === null || v === undefined) return '';
      const euro = einheit && einheit.startsWith('€');
      let s = `${euro ? new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v)) : zahl(v, 4)}${einheit ? ' ' + einheit : ''}`;
      if (a.steuer === 'brutto' || a.steuer === 'netto') s += ` ${a.steuer}`;
      return s;
    }
    case 'bool': { const v = a[praefix + 'wert_bool']; return v === null || v === undefined ? '' : v ? 'Ja' : 'Nein'; }
    case 'datum': return datum(a[praefix + 'wert_datum']);
    case 'auswahl':
    case 'mehrfachauswahl': return (a[praefix + 'wert_auswahl'] || []).map((k) => optionLabel(m, k)).join(', ');
    default: return a[praefix + 'wert_text'] || '';
  }
}

function geltung(a) {
  const teile = [];
  const von = a.kwp_von, bis = a.kwp_bis;
  if (von != null && bis != null) teile.push(Number(von) === Number(bis) ? `${zahl(von)} kWp` : `${zahl(von)}–${zahl(bis)} kWp`);
  else if (bis != null) teile.push(`bis ${zahl(bis)} kWp`);
  else if (von != null) teile.push(`ab ${zahl(von)} kWp`);
  if (a.netzgebiet) teile.push(`Netzgebiet ${a.netzgebiet}`);
  if (a.bedingung) teile.push(a.bedingung);
  return teile.join(' · ');
}


// Beleg: Quelle einer Angabe, die beim Überfahren oder Antippen erscheint
const QUELLTYP = {
  website: 'Website des Anbieters', preisblatt: 'Preisblatt', agb: 'Vertragsbedingungen', vertrag: 'Vertrag',
  pressemitteilung: 'Pressemitteilung', kalkulator: 'Rechner des Anbieters', medienbericht: 'Fachpresse',
  anbieterauskunft: 'Auskunft des Anbieters', registereintrag: 'Registereintrag', sonstige: 'Sonstige Quelle'
};
const SEKUNDAER = new Set(['medienbericht']);

function beleg(angaben, inhalt, klasse = '') {
  const liste = (Array.isArray(angaben) ? angaben : [angaben]).filter((x) => x && x.quelle_id && quellen[x.quelle_id]);
  if (!liste.length) return `<span class="${klasse}">${inhalt}</span>`;
  const a = liste[0];
  const q = quellen[a.quelle_id];
  const m = merkmale[a.merkmal_key];
  const zusatz = [];
  if (liste.length > 1 || a.kwp_von != null || a.kwp_bis != null || a.netzgebiet) {
    for (const x of liste) {
      const g = geltung(x);
      zusatz.push(`${wertText(x, merkmale[x.merkmal_key])}${g ? ' (' + g + ')' : ''}`);
    }
  } else if (a.bedingung) zusatz.push(a.bedingung);
  const weitere = [...new Set(liste.slice(1).map((x) => x.quelle_id))].filter((id) => id !== a.quelle_id).map((id) => quellen[id]?.herausgeber).filter(Boolean);
  if (weitere.length) zusatz.push('Weitere Quelle: ' + weitere.join(', '));
  if (a.anmerkung) zusatz.push(a.anmerkung);
  const attr = {
    'data-typ': QUELLTYP[q.typ] || q.typ,
    'data-titel': q.titel,
    'data-url': q.url || '',
    'data-herausgeber': q.herausgeber || '',
    'data-datum': [q.veroeffentlicht_am ? 'veröffentlicht ' + datum(q.veroeffentlicht_am) : '', q.abgerufen_am ? 'abgerufen ' + datum(q.abgerufen_am) : ''].filter(Boolean).join(' · '),
    'data-wortlaut': a.originalwortlaut || '',
    'data-zusatz': zusatz.join(' · ')
  };
  const attrs = Object.entries(attr).filter(([, v]) => v).map(([k, v]) => `${k}="${esc(v)}"`).join(' ');
  return `<span class="beleg${SEKUNDAER.has(q.typ) ? ' sekundaer' : ''}${klasse ? ' ' + klasse : ''}" tabindex="0" ${attrs}>${inhalt}</span>`;
}

// ---------------------------------------------------------------------------
// Aufbereitung je Angebot

function angabenVon(angebot, key) {
  return (aktuellNachAngebot[angebot.id] || [])
    .filter((x) => x.merkmal_key === key)
    .sort((a, b) => (a.kwp_von ?? -1) - (b.kwp_von ?? -1) || String(a.netzgebiet || '').localeCompare(String(b.netzgebiet || '')));
}

function verfuegbarkeit(angebot) {
  const st = angabenVon(angebot, 'status').filter((x) => x.status === 'veroeffentlicht');
  const allgemein = st.filter((x) => !x.netzgebiet);
  const basis = (allgemein.length ? allgemein : st).map((x) => x.wert_auswahl?.[0]).filter(Boolean);
  const beste = basis.sort((a, b) => (VERFUEGBARKEIT[a]?.rang ?? 9) - (VERFUEGBARKEIT[b]?.rang ?? 9))[0];
  return { key: beste || null, info: VERFUEGBARKEIT[beste] || null, regional: st.some((x) => x.netzgebiet), angabe: st.find((x) => x.wert_auswahl?.[0] === beste) || null };
}

function datenstand(angebot) {
  const daten_ = (aktuellNachAngebot[angebot.id] || []).map((x) => x.quelle_abgerufen_am).filter(Boolean).sort();
  return daten_.length ? daten_[daten_.length - 1] : null;
}

function einfach(angebot, key) {
  const liste = angabenVon(angebot, key);
  if (!liste.length) return { text: 'Noch nicht erfasst', kurz: '–', leer: true, wert: null };
  const allgemein = liste.filter((x) => x.kwp_von == null && x.kwp_bis == null && !x.netzgebiet);
  // Mehrere allgemeine Angaben: Primärquelle vor Fachpresse, dann die zuletzt erfasste
  const a = allgemein.length
    ? [...allgemein].sort((x, y) => (SEKUNDAER.has(x.quelle_typ) ? 1 : 0) - (SEKUNDAER.has(y.quelle_typ) ? 1 : 0) || String(y.erfasst_am).localeCompare(String(x.erfasst_am)))[0]
    : liste[0];
  const m = merkmale[key];
  const gestaffelt = liste.some((x) => x.kwp_von != null || x.kwp_bis != null);
  const text = wertText(a, m) + (gestaffelt && liste.length > 1 ? ' (gestaffelt)' : '');
  return { text, leer: a.status !== 'veroeffentlicht', wert: a.status === 'veroeffentlicht' ? rohwert(a, m) : null, angabe: a };
}

// Gruppe: ob die Direktvermarktung an weitere Produkte gekoppelt ist (Merkmal „kopplung“)
const GRUPPE = {
  ohne: { rang: 1, label: 'Ohne weitere Produkte', sortierung: 'sortiert nach erster Veröffentlichung', text: 'Direktvermarktung ohne Stromtarif, Messstellenbetrieb oder Hardware des Anbieters.' },
  tarif_technik: { rang: 2, label: 'Gekoppelt an Tarif, Messstellenbetrieb oder Technik', sortierung: 'alphabetisch', text: 'Nur mit Stromtarif oder Messstellenbetrieb des Anbieters oder mit bestimmter Technik wie Speicher oder Energiemanager, die auch von Dritten stammen kann.' },
  hardware: { rang: 3, label: 'Gekoppelt an Hardware des Anbieters', sortierung: 'alphabetisch', text: 'Nur mit Anlage, Speicher oder Energiemanager des Anbieters oder seiner Partner.' },
  unklar: { rang: 4, label: 'Kopplung noch nicht erfasst', sortierung: 'alphabetisch', text: 'Zur Kopplung liegt noch keine Angabe vor.' }
};

function gruppe(angebot) {
  const liste = angabenVon(angebot, 'kopplung');
  const a = liste.find((x) => x.status === 'veroeffentlicht') || liste[0] || null;
  const w = a?.wert_auswahl || [];
  let key = 'unklar';
  if (w.includes('hardware_anbieter')) key = 'hardware';
  else if (w.some((k) => ['stromtarif', 'messstellenbetrieb', 'technik'].includes(k))) key = 'tarif_technik';
  else if (w.includes('keine')) key = 'ohne';
  return { key, ...GRUPPE[key], angabe: a, unsicher: !!a && a.status !== 'veroeffentlicht' };
}

function erstVeroeffentlicht(angebot) {
  const e = angabenVon(angebot, 'erstmals_veroeffentlicht').find((x) => x.status === 'veroeffentlicht');
  return e?.wert_datum || null;
}

const anbieterName = (a) => `${a.organisation?.name || ''} ${a.name}`;
const sortierteAngebote = (kat) => angebote
  .filter((a) => a.kategorie_key === kat)
  .map((a) => ({ ...a, verf: verfuegbarkeit(a), grp: gruppe(a), erst: erstVeroeffentlicht(a), stand: datenstand(a) }))
  .sort((a, b) => {
    if (kat !== 'endkunden') return a.name.localeCompare(b.name, 'de');
    return a.grp.rang - b.grp.rang
      || (a.grp.key === 'ohne' ? String(a.erst || '9999').localeCompare(String(b.erst || '9999')) : 0)
      || anbieterName(a).localeCompare(anbieterName(b), 'de', { sensitivity: 'base' });
  });

const endkunden = sortierteAngebote('endkunden');
const dienstleister = sortierteAngebote('dienstleister');

const letzteErfassung = [...daten.angabe_aktuell.map((x) => x.erfasst_am), ...kalkAktuell.map((x) => x.erfasst_am)].filter(Boolean).sort().pop();
const STAND = letzteErfassung ? isoTag(letzteErfassung) : isoTag(new Date().toISOString());

// ---------------------------------------------------------------------------
// Seitenrahmen

function link(tiefe, ziel) {
  // ziel: '' (Start), 'angebote/x', 'methodik', 'assets/style.css', 'daten/angaben.csv' ...
  const prefix = tiefe ? '../'.repeat(tiefe) : './';
  const istDatei = /\.[a-z0-9]+$/i.test(ziel);
  if (istDatei) return prefix + ziel;
  if (!ziel) return EXPLICIT_INDEX ? prefix + 'index.html' : prefix;
  return prefix + ziel + (EXPLICIT_INDEX ? '/index.html' : '/');
}

const NAV = [
  { ziel: '', label: 'Übersicht', key: 'start' },
  { ziel: 'detailansicht', label: 'Detailansicht', key: 'detail' },
  { ziel: 'aenderungen', label: 'Änderungen', key: 'aenderungen' },
  { ziel: 'daten', label: 'Daten', key: 'daten' },
  { ziel: 'methodik', label: 'Methodik', key: 'methodik' }
];

function seite({ tiefe, titel, beschreibung, kanonisch, aktiv, inhalt }) {
  const L = (z) => link(tiefe, z);
  const voll = titel ? `${titel} – ${cfg.portalName}` : cfg.portalName;
  const url = cfg.siteUrl + '/' + (kanonisch ? kanonisch + '/' : '');
  const umami = cfg.umami?.websiteId
    ? `<script defer src="${esc(cfg.umami.scriptUrl)}" data-website-id="${esc(cfg.umami.websiteId)}" data-do-not-track="true"></script>`
    : '';
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(voll)}</title>
<meta name="description" content="${esc(beschreibung)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="de_DE">
<meta property="og:site_name" content="${esc(cfg.portalName)}">
<meta property="og:title" content="${esc(titel || cfg.portalName)}">
<meta property="og:description" content="${esc(beschreibung)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(cfg.siteUrl)}/assets/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="627">
<meta name="twitter:card" content="summary_large_image">
${VORSCHAU ? '<meta name="robots" content="noindex">' : ''}
<link rel="icon" href="${L('assets/favicon.svg')}" type="image/svg+xml">
<link rel="preload" href="${L('assets/fonts/inter-400.woff')}" as="font" type="font/woff" crossorigin>
<link rel="preload" href="${L('assets/fonts/inter-600.woff')}" as="font" type="font/woff" crossorigin>
<link rel="stylesheet" href="${L('assets/style.css')}">
${umami}
</head>
<body>
<a class="skip" href="#inhalt">Zum Inhalt</a>
${VORSCHAU ? '<div class="vorschau">Vorschau mit unveröffentlichten Entwürfen. Nicht öffentlich.</div>' : ''}
<header class="kopf">
  <div class="rahmen kopf-innen">
    <a class="marke" href="${L('')}" aria-label="${esc(cfg.portalName)} – Startseite">
      <span class="wortmarke">1000GW</span>
      <span class="portal">${esc(cfg.portalName)}</span>
    </a>
    <button class="menue" type="button" aria-expanded="false" aria-controls="navigation">Menü</button>
    <nav id="navigation" class="nav" aria-label="Hauptnavigation">
      ${NAV.map((n) => `<a href="${L(n.ziel)}"${n.key === aktiv ? ' aria-current="page"' : ''}>${n.label}</a>`).join('\n      ')}
    </nav>
  </div>
</header>
<main id="inhalt">
${inhalt}
</main>
<footer class="fuss">
  <div class="rahmen fuss-innen">
    <div>
      <span class="wortmarke wortmarke-klein">1000GW</span>
      <p>Ein Angebot der ${esc(cfg.betreiber.name)}.</p>
    </div>
    <nav aria-label="Weitere Seiten">
      <a href="${L('methodik')}">Methodik</a>
      <a href="${L('daten')}">Daten</a>
      <a href="${L('impressum')}">Impressum</a>
      <a href="${L('datenschutz')}">Datenschutz</a>
      <a href="mailto:${esc(cfg.hinweisEmail)}">Hinweis senden</a>
    </nav>
    <p class="fuss-hinweis">Alle Angaben ohne Gewähr. Maßgeblich sind die Vertragsunterlagen der Anbieter.</p>
  </div>
</footer>
<script src="${L('assets/app.js')}" defer></script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Bausteine

const veroeff = (x) => x.status === 'veroeffentlicht';

function statusChip(verf, extra = '') {
  if (!verf?.info) return '<span class="chip st-unbekannt">Noch nicht erfasst</span>';
  return `${beleg(verf.angabe, esc(verf.info.label), 'chip ' + verf.info.klasse)}${extra}`;
}

function quelleVerweis(quelleId, nummern) {
  const n = nummern.get(quelleId);
  return n ? `<a class="qref" href="#quelle-${n}" aria-label="Quelle ${n}">[${n}]</a>` : '';
}

function leistungText(angebot) {
  const min = einfach(angebot, 'leistung_min_kwp');
  const max = einfach(angebot, 'leistung_max_kwp');
  const vmin = min.wert, vmax = max.wert;
  if (vmin != null && vmax != null) return `${zahl(vmin)}–${zahl(vmax)} kWp`;
  if (vmax != null) return `bis ${zahl(vmax)} kWp`;
  if (vmin != null && Number(vmin) > 0) return `ab ${zahl(vmin)} kWp`;
  if (vmin != null) return 'keine Obergrenze genannt';
  if (!min.leer || !max.leer) return 'Siehe Details';
  const s = angabenVon(angebot, 'leistung_max_kwp')[0] || angabenVon(angebot, 'leistung_min_kwp')[0];
  return s ? STATUS_ANGABE[s.status] || '–' : '–';
}

function startDatum(a) {
  const st = einfach(a, 'start_angekuendigt');
  return st.leer ? '' : beleg(angabenVon(a, 'start_angekuendigt'), esc(st.text));
}

function ansichtWechsel(L, aktiv) {
  return `<nav class="ansicht" aria-label="Ansicht">
      <a href="${L('')}"${aktiv === 'start' ? ' aria-current="page"' : ''}>Übersicht</a>
      <a href="${L('detailansicht')}"${aktiv === 'detail' ? ' aria-current="page"' : ''}>Detailansicht</a>
    </nav>`;
}

function kiHinweis() {
  return `<p class="ki-hinweis" role="note">Recherche zu Angeboten durch KI – ohne Garantie. Korrekturen bitte an <a href="mailto:${esc(cfg.hinweisEmail)}">${esc(cfg.hinweisEmail)}</a></p>`;
}

// Status in einer Zeile: Kurzfassung, sonst Bezeichnung des Status
function statusZeile(a) {
  const punkt = `<span class="punkt ${a.verf.info?.klasse || 'st-unbekannt'}" aria-hidden="true"></span>`;
  const kurz = angabenVon(a, 'status_kurz').filter(veroeff);
  if (kurz.length) {
    const k = [...kurz].sort((x, y) => String(y.erfasst_am).localeCompare(String(x.erfasst_am)))[0];
    return `${punkt}${beleg([k], esc(k.wert_text))}`;
  }
  const start = a.verf.info?.gruppe === 'angekuendigt' ? startDatum(a) : '';
  return `${punkt}${a.verf.info ? beleg(a.verf.angabe, esc(a.verf.info.label)) : '<span class="leer">Noch nicht erfasst</span>'}${start ? `<span class="unter">${start}</span>` : ''}`;
}

const ersterSatz = (s) => { const m = String(s || '').match(/^(.+?[.;])(\s|$)/); return (m ? m[1] : String(s || '')).replace(/;$/, '.'); };

// Einschränkungen: Kopplung, Leistung, Neu- oder Bestandsanlagen, kurze weitere Bedingung
function einschraenkungen(a) {
  const teile = [];
  const k = a.grp.angabe;
  if (k && a.grp.key !== 'ohne' && a.grp.key !== 'unklar') {
    const text = k.bedingung || wertText({ ...k, status: 'veroeffentlicht' }, merkmale.kopplung);
    teile.push(`<span class="k">nur mit</span> ${beleg([k], esc(text))}${a.grp.unsicher ? ' <span class="unsicher">unklar</span>' : ''}`);
  }
  const lmin = angabenVon(a, 'leistung_min_kwp').filter(veroeff);
  const lmax = angabenVon(a, 'leistung_max_kwp').filter(veroeff);
  const lt = leistungText(a);
  if (/kWp/.test(lt)) teile.push(`<span class="k">Leistung</span> ${beleg([...lmax, ...lmin], esc(lt))}`);
  const wb = angabenVon(a, 'weitere_bedingungen').find(veroeff);
  if (wb) { const s = ersterSatz(wb.wert_text); if (s.length <= 95) teile.push(`<span class="k">sonst</span> ${beleg([wb], esc(s))}`); }
  return teile.length ? `<ul class="zeilen">${teile.map((t) => `<li>${t}</li>`).join('')}</ul>` : '<span class="leer">keine genannt</span>';
}

// Alle aktuellen Angaben eines Merkmals, je mit Beleg und Geltung
function alleWerte(a, key, { kurz = false } = {}) {
  const liste = angabenVon(a, key);
  if (!liste.length) return '';
  const m = merkmale[key];
  return liste.map((x) => {
    const g = geltung(x);
    const mitteilung = x.quelle_typ === 'anbieterauskunft' ? '<span class="mitteilung">Mitteilung des Anbieters</span>' : '';
    const geltungHtml = g && !kurz ? `<span class="geltung">${esc(g)}</span>` : (g && (x.kwp_von != null || x.kwp_bis != null) ? ` <span class="g">(${esc(geltung({ kwp_von: x.kwp_von, kwp_bis: x.kwp_bis }))})</span>` : '');
    const hatWert = x.status === 'unklar' && rohwert(x, m) != null && !(Array.isArray(rohwert(x, m)) && !rohwert(x, m).length);
    const text = hatWert ? wertText({ ...x, status: 'veroeffentlicht' }, m) + ' (unklar)' : wertText(x, m);
    const marke = PREISMERKMALE.has(key) && indirekt(x) && !kurz ? INDIREKT_MARKE : '';
    return `<span class="w${marke ? ' indirekt' : ''}">${marke}${beleg([x], esc(text), veroeff(x) ? '' : 'leer')}${geltungHtml}${mitteilung}</span>`;
  }).join('');
}

const PREIS_KURZ = [
  ['verguetungsmodell', 'Vergütung'],
  ['vermarktungsform', 'Form'],
  ['entgelt_grund', 'Grund'],
  ['entgelt_menge', 'Menge'],
  ['entgelt_anteil', 'Anteil'],
  ['entgelt_einmalig', 'Einmalig']
];
const FORM_KURZ = { marktpraemie: 'Marktprämie, § 20 EEG', sonstige: 'sonstige DV, § 21a EEG' };

// Preisbezogene Merkmale: Angaben nur aus der Fachpresse dezent und gekennzeichnet
const PREISMERKMALE = new Set(['verguetungsmodell', 'preisgestaltung', 'preisbasis', 'entgelt_grund', 'entgelt_menge', 'entgelt_anteil', 'entgelt_einmalig', 'entgelt_sonstiges']);
const indirekt = (x) => SEKUNDAER.has(x?.quelle_typ);
const INDIREKT_MARKE = '<span class="indirekt-marke">laut Fachpresse</span>';

function textZelle(a, key, { nurErsterSatz = false } = {}) {
  const x = einfach(a, key).angabe;
  if (!x) return '<span class="leer">–</span>';
  if (!veroeff(x)) return beleg([x], esc(wertText(x, merkmale[key])), 'leer');
  let text = String(x.wert_text);
  if (nurErsterSatz) { const m = text.match(/^([\s\S]+?[.!?])(?=\s+[A-ZÄÖÜ„]|$)/); if (m) text = m[1]; }
  return indirekt(x)
    ? `<span class="indirekt">${INDIREKT_MARKE}${beleg([x], esc(text))}</span>`
    : beleg([x], esc(text));
}

function preisZelle(a, L) {
  const zeilen = [];
  for (const [key, label] of PREIS_KURZ) {
    const liste = angabenVon(a, key);
    if (!liste.length) continue;
    let html;
    if (key === 'verguetungsmodell') {
      const x = einfach(a, key).angabe;
      if (!x || !veroeff(x)) continue;
      const m = String(x.wert_text).match(/^([\s\S]+?[.!?])(?=\s+[A-ZÄÖÜ„]|$)/);
      html = beleg([x], esc(m ? m[1] : x.wert_text));
    } else if (key === 'vermarktungsform') {
      const x = liste.find(veroeff) || liste[0];
      html = beleg([x], esc(veroeff(x) ? (FORM_KURZ[x.wert_auswahl?.[0]] || wertText(x, merkmale[key])) : wertText(x, merkmale[key])), veroeff(x) ? '' : 'leer');
    } else html = alleWerte(a, key, { kurz: true });
    zeilen.push(`<div><dt>${label}</dt><dd>${html}</dd></div>`);
  }
  if (!zeilen.length || !angabenVon(a, 'verguetungsmodell').some(veroeff)) {
    const pb = angabenVon(a, 'preisbasis');
    if (pb.length) zeilen.unshift(`<div><dt>Basis</dt><dd>${alleWerte(a, 'preisbasis', { kurz: true })}</dd></div>`);
  }
  if (angabenVon(a, 'entgelt_sonstiges').some(veroeff)) zeilen.push(`<div><dt>Weitere</dt><dd><a href="${L('detailansicht')}#${esc(a.slug)}">siehe Detailansicht</a></dd></div>`);
  return zeilen.length ? `<dl class="preis">${zeilen.join('')}</dl>` : '<span class="leer">noch nicht erfasst</span>';
}

function quellLinks(a) {
  const gesehen = new Set();
  const nachTyp = {};
  for (const x of aktuellNachAngebot[a.id] || []) {
    const q = quellen[x.quelle_id];
    if (!q?.url || gesehen.has(q.url)) continue;
    gesehen.add(q.url);
    (nachTyp[q.typ] ||= []).push(q);
  }
  for (const k of kalkNachAngebot[a.id] || []) {
    const q = quellen[k.quelle_id];
    if (q?.url && !gesehen.has(q.url)) { gesehen.add(q.url); (nachTyp[q.typ] ||= []).push(q); }
  }
  return nachTyp;
}

function linkZelle(a, L) {
  const nachTyp = quellLinks(a);
  const links = [];
  if (a.url) links.push(`<a class="extern" href="${esc(a.url)}" rel="noopener" target="_blank">Anbieter</a>`);
  for (const [typ, label] of [['agb', 'AGB'], ['preisblatt', 'Preisblatt'], ['kalkulator', 'Rechner']]) {
    (nachTyp[typ] || []).forEach((q, i, arr) => links.push(`<a class="extern" href="${esc(q.url)}" rel="noopener" target="_blank" title="${esc(q.titel)}">${label}${arr.length > 1 ? ' ' + (i + 1) : ''}</a>`));
  }
  links.push(`<a href="${L('angebote/' + a.slug)}">Quellen &amp; Verlauf</a>`);
  return `<ul class="links">${links.map((x) => `<li>${x}</li>`).join('')}</ul>`;
}

function anbieterAngebot(a, L) {
  return `<span class="anb">${esc(a.organisation?.name || '')}</span><a href="${L('angebote/' + a.slug)}">${esc(a.name)}</a>${a.oeffentlich ? '' : '<span class="entwurf-marke">Entwurf</span>'}`;
}

function gruppenKopf(g) {
  return `<span class="gr-name">${esc(g.label)}</span><span class="gr-sort">${esc(g.sortierung)}</span>`;
}

// ---------------------------------------------------------------------------
// Startseite (Übersicht)

function startseite() {
  const tiefe = 0;
  const L = (z) => link(tiefe, z);
  // Kennzahlen je Anbieter (Unternehmen), nicht je Angebot
  const anbieterIds = [...new Set(endkunden.map((a) => a.organisation_id))];
  const hatBuchbar = (id) => endkunden.some((a) => a.organisation_id === id && a.verf.info?.gruppe === 'buchbar');
  const anbieterBuchbar = anbieterIds.filter(hatBuchbar).length;
  const anbieterAngekuendigt = anbieterIds.filter((id) => !hatBuchbar(id) && endkunden.some((a) => a.organisation_id === id && a.verf.info?.gruppe === 'angekuendigt')).length;

  const gruppen = Object.keys(GRUPPE).map((key) => ({ key, g: GRUPPE[key], liste: endkunden.filter((a) => a.grp.key === key) })).filter((x) => x.liste.length);
  const zeilen = gruppen.map(({ g, liste }) => liste.map((a, i) => `<tr${a.oeffentlich ? '' : ' class="entwurf"'}>
  ${i === 0 ? `<th scope="rowgroup" rowspan="${liste.length}" class="gr">${gruppenKopf(g)}</th>` : ''}
  <th scope="row" class="an">${anbieterAngebot(a, L)}</th>
  <td data-label="Status" class="st">${statusZeile(a)}</td>
  <td data-label="Einschränkungen" class="ei">${einschraenkungen(a)}</td>
  <td data-label="Vergütungsmodell" class="vg">${textZelle(a, 'verguetungsmodell', { nurErsterSatz: true })}</td>
  <td data-label="Preisgestaltung" class="pr">${textZelle(a, 'preisgestaltung')}</td>
  <td data-label="Links" class="li">${linkZelle(a, L)}</td>
</tr>`).join('\n')).join('\n');

  const dl = dienstleister.map((a) => {
    const umfang = einfach(a, 'leistungsumfang');
    const ziel = einfach(a, 'zielkunden');
    return `<article class="dl-karte${a.oeffentlich ? '' : ' entwurf'}">
  <h3><a href="${L('angebote/' + a.slug)}">${esc(a.name)}</a>${a.oeffentlich ? '' : ' <span class="entwurf-marke">Entwurf</span>'}</h3>
  <p class="unter">${esc(a.organisation?.name || '')}</p>
  <p>${umfang.leer ? esc(a.kurzbeschreibung || umfang.text) : beleg(angabenVon(a, 'leistungsumfang'), esc(umfang.text))}</p>
  ${ziel.leer ? '' : `<p class="meta">Zielkunden: ${beleg(angabenVon(a, 'zielkunden'), esc(ziel.text))}</p>`}
</article>`;
  }).join('\n');

  const inhalt = `
<section class="auftakt">
  <div class="rahmen">
    <h1>Wer bietet Direktvermarktung für Strom aus kleinen PV&#8209;Anlagen an?</h1>
    <p class="lead">Welche Angebote sind bereits angekündigt und ab wann?</p>
    <dl class="kennzahlen">
      <div><dt>Anbieter für Endkunden</dt><dd>${anbieterIds.length}</dd></div>
      <div><dt>mit buchbarem Angebot</dt><dd>${anbieterBuchbar}</dd></div>
      <div><dt>nur angekündigt</dt><dd>${anbieterAngekuendigt}</dd></div>
    </dl>
  </div>
</section>

<section class="abschnitt" id="endkunden" aria-labelledby="h-endkunden">
  <div class="rahmen rahmen-liste">
    <div class="abschnitt-kopf">
      <h2 id="h-endkunden">Angebote für Endkunden</h2>
      ${ansichtWechsel(L, 'start')}
    </div>
    <p class="einleitung">Gegliedert danach, ob die Direktvermarktung an weitere Produkte des Anbieters gekoppelt ist. Gepunktet unterstrichene Angaben zeigen beim Überfahren oder Antippen ihre Quelle.</p>
    ${kiHinweis()}
    <div class="tabelle-rahmen">
      <table class="dvliste">
        <caption class="sr">Angebote für Endkunden nach Kopplung</caption>
        <thead><tr><th scope="col">Kategorie</th><th scope="col">Anbieter &amp; Angebot</th><th scope="col">Status</th><th scope="col">Einschränkungen</th><th scope="col">Vergütungsmodell</th><th scope="col">Preisgestaltung</th><th scope="col">Links</th></tr></thead>
        <tbody>
${endkunden.length ? zeilen : '<tr><td colspan="7">Die ersten Einträge werden geprüft.</td></tr>'}
        </tbody>
      </table>
    </div>
    <p class="anmerkung">Ein intelligentes Messsystem ist für die Direktvermarktung fast immer erforderlich und zählt nicht als Kopplung, solange es von einem beliebigen Messstellenbetreiber stammen kann. Preise wie vom Anbieter angegeben, brutto oder netto laut Quelle. Alle Preisangaben in der <a href="${L('detailansicht')}">Detailansicht</a>, Regeln in der <a href="${L('methodik')}">Methodik</a>. Datenstand ${datum(STAND)}.</p>
  </div>
</section>

<section class="abschnitt abschnitt-flaeche" aria-labelledby="h-dl">
  <div class="rahmen">
    <h2 id="h-dl">Angebote für Unternehmen</h2>
    <p class="einleitung">Plattformen und Dienstleistungen für Unternehmen, die selbst Direktvermarktung anbieten wollen.</p>
    <div class="dl-raster">
${dl || '<p>Die ersten Einträge werden geprüft.</p>'}
    </div>
  </div>
</section>

<section class="abschnitt" aria-labelledby="h-hinweis">
  <div class="rahmen schmal">
    <h2 id="h-hinweis">Angebot fehlt oder Angabe veraltet?</h2>
    <p>Hinweise bitte mit Beleg an <a href="mailto:${esc(cfg.hinweisEmail)}">${esc(cfg.hinweisEmail)}</a>. Jede übernommene Änderung erscheint mit Anlass und Datum im <a href="${L('aenderungen')}">Änderungsprotokoll</a>.</p>
  </div>
</section>`;

  return seite({
    tiefe, titel: null, kanonisch: '', aktiv: 'start', inhalt,
    beschreibung: 'Wer bietet Direktvermarktung für Strom aus kleinen PV-Anlagen an? Angebote bis 100 kWp mit Status, Einschränkungen, Vergütungsmodell und Preisgestaltung, jede Angabe mit Quelle.'
  });
}

// ---------------------------------------------------------------------------
// Detailansicht: alle erfassten Angaben zu Bedingungen und Preisen

const DETAIL_SPALTEN = [
  { key: 'kopplung', label: 'Gekoppelt an', breit: true },
  { key: 'zugelassene_anlagen', label: 'Neu- oder Bestandsanlagen' },
  { key: 'vermarktungsform', label: 'Form der Direktvermarktung' },
  { key: 'verguetungsmodell', label: 'Vergütungsmodell', breit: true },
  { key: 'preisgestaltung', label: 'Preisgestaltung', breit: true },
  { key: 'preisbasis', label: 'Preisbasis' },
  { key: 'entgelt_grund', label: 'Grundgebühr' },
  { key: 'entgelt_menge', label: 'Mengenentgelt' },
  { key: 'entgelt_anteil', label: 'Erlösanteil' },
  { key: 'entgelt_einmalig', label: 'Einmalige Kosten' },
  { key: 'entgelt_sonstiges', label: 'Weitere Kosten', breit: true },
  { key: 'messsystem', label: 'Messsystem' },
  { key: 'steuerung', label: 'Steuerung durch den Anbieter' },
  { key: 'mindestlaufzeit', label: 'Mindestlaufzeit' },
  { key: 'kuendigungsfrist', label: 'Kündigung' }
];

function detailseite() {
  const tiefe = 1;
  const L = (z) => link(tiefe, z);
  const kopf = ['Anbieter & Angebot', 'Status', 'Anlagengröße', ...DETAIL_SPALTEN.map((x) => x.label), 'Anbieterrechner', 'Stand'];
  const gruppen = Object.keys(GRUPPE).map((key) => ({ g: GRUPPE[key], liste: endkunden.filter((a) => a.grp.key === key) })).filter((x) => x.liste.length);
  const zeilen = gruppen.map(({ g, liste }) => `<tr class="gr-zeile"><th scope="rowgroup" colspan="${kopf.length}"><span class="gr-innen">${gruppenKopf(g)}</span></th></tr>
${liste.map((a) => {
    const lmin = angabenVon(a, 'leistung_min_kwp'), lmax = angabenVon(a, 'leistung_max_kwp');
    const kalk = kalkNachAngebot[a.id] || [];
    return `<tr id="${esc(a.slug)}"${a.oeffentlich ? '' : ' class="entwurf"'}>
  <th scope="row" class="an">${anbieterAngebot(a, L)}</th>
  <td class="st">${statusZeile(a)}</td>
  <td class="zahl">${lmin.length || lmax.length ? beleg([...lmin, ...lmax], esc(leistungText(a))) : '<span class="leer">–</span>'}</td>
  ${DETAIL_SPALTEN.map((sp) => `<td${sp.breit ? ' class="breit"' : ''}>${alleWerte(a, sp.key) || '<span class="leer">–</span>'}</td>`).join('\n  ')}
  <td>${kalk.length ? `<a href="${L('angebote/' + a.slug)}#rechner">${kalk.length} ${kalk.length === 1 ? 'Referenzfall' : 'Referenzfälle'}</a>` : '<span class="leer">–</span>'}</td>
  <td class="zahl meta">${datum(a.stand)}</td>
</tr>`;
  }).join('\n')}`).join('\n');

  const inhalt = `
<section class="auftakt auftakt-klein">
  <div class="rahmen">
    <h1>Detailansicht</h1>
    <p class="lead">Alle erfassten Angaben zu Bedingungen und Preisen der Angebote für Endkunden. Zeiger auf eine Angabe zeigt ihre Quelle; Wortlaut und frühere Stände auf den Seiten der einzelnen Angebote.</p>
  </div>
</section>
<div class="rahmen rahmen-breit detail">
  <div class="abschnitt-kopf">
    <p class="meta">${endkunden.length} Angebote · Reihenfolge wie in der Übersicht · Datenstand ${datum(STAND)}</p>
    ${ansichtWechsel(L, 'detail')}
  </div>
  ${kiHinweis()}
  <div class="tabelle-rahmen tabelle-breit">
    <table class="details">
      <caption class="sr">Bedingungen und Preise der Angebote für Endkunden</caption>
      <thead><tr>${kopf.map((k) => `<th scope="col">${esc(k)}</th>`).join('')}</tr></thead>
      <tbody>
${zeilen || `<tr><td colspan="${kopf.length}">Die ersten Einträge werden geprüft.</td></tr>`}
      </tbody>
    </table>
  </div>
  <p class="anmerkung">„–“: noch nicht erfasst. Preise wie vom Anbieter angegeben, brutto oder netto laut Quelle; „Nicht veröffentlicht“: Die Quelle nennt den Wert nicht. Die Tabelle zeigt Bedingungen, keine Erlöse. Definitionen der Merkmale in der <a href="${L('methodik')}">Methodik</a>.</p>
</div>`;
  return seite({ tiefe, titel: 'Detailansicht', kanonisch: 'detailansicht', aktiv: 'detail', inhalt, beschreibung: 'Bedingungen und Preise aller Angebote zur Direktvermarktung kleiner PV-Anlagen, jede Angabe mit Quelle.' });
}

// ---------------------------------------------------------------------------
// Angebotsseite

const GRUPPEN_REIHENFOLGE = ['Verfügbarkeit', 'Anlage', 'Voraussetzungen', 'Vermarktung', 'Kosten', 'Vertrag', 'Dienstleistung', 'Allgemein'];

function angebotsseite(a) {
  const tiefe = 2;
  const L = (z) => link(tiefe, z);
  const aktuell = aktuellNachAngebot[a.id] || [];
  const verlauf = (verlaufNachAngebot[a.id] || []).filter((x) => !x.aktuell);
  const kalk = (kalkNachAngebot[a.id] || []).sort((x, y) => (referenzfaelle[x.referenzfall_key]?.sortierung ?? 999) - (referenzfaelle[y.referenzfall_key]?.sortierung ?? 999) || String(y.abgefragt_am).localeCompare(String(x.abgefragt_am)));

  // Quellen nummerieren in Reihenfolge des Auftretens
  const nummern = new Map();
  const nummeriere = (id) => { if (id && !nummern.has(id)) nummern.set(id, nummern.size + 1); };
  const sortiert = [...aktuell].sort((x, y) => (merkmale[x.merkmal_key]?.sortierung ?? 999) - (merkmale[y.merkmal_key]?.sortierung ?? 999));
  sortiert.forEach((x) => nummeriere(x.quelle_id));
  verlauf.forEach((x) => nummeriere(x.quelle_id));
  kalk.forEach((x) => nummeriere(x.quelle_id));
  const bez = daten.beziehung.filter((b) => b.subjekt_angebot_id === a.id || b.subjekt_organisation_id === a.organisation_id || b.objekt_organisation_id === a.organisation_id);
  bez.forEach((b) => nummeriere(b.quelle_id));

  const gruppen = group(sortiert, (x) => merkmale[x.merkmal_key]?.gruppe || 'Allgemein');
  const gruppenHtml = GRUPPEN_REIHENFOLGE.filter((g) => gruppen[g]).map((g) => {
    const reihen = group(gruppen[g], (x) => x.merkmal_key);
    const zeilen = Object.entries(reihen).map(([key, liste]) => {
      const m = merkmale[key];
      const werte = liste.map((x) => {
        const g2 = geltung(x);
        const wort = x.originalwortlaut ? `<blockquote>${esc(x.originalwortlaut)}</blockquote>` : '';
        const gueltig = x.gueltig_ab ? `<span class="meta">Gültig ab ${datum(x.gueltig_ab)}</span>` : '';
        const mitteilung = x.quelle_typ === 'anbieterauskunft' ? '<span class="mitteilung">Mitteilung des Anbieters</span>' : '';
        return `<div class="wert"><span class="${x.status === 'veroeffentlicht' ? '' : 'leer'}">${esc(wertText(x, m))}</span>${g2 ? `<span class="geltung">${esc(g2)}</span>` : ''}${mitteilung}${wort}${gueltig}${x.anmerkung ? `<span class="meta">${esc(x.anmerkung)}</span>` : ''}</div>`;
      }).join('');
      const qs = [...new Set(liste.map((x) => x.quelle_id))].map((id) => quelleVerweis(id, nummern)).join(' ');
      return `<tr><th scope="row"><span class="merkmal" title="${esc(m?.definition || '')}">${esc(m?.bezeichnung || key)}</span></th><td>${werte}</td><td class="quelle-spalte">${qs}</td></tr>`;
    }).join('\n');
    return `<section class="gruppe"><h2>${esc(g)}</h2><table class="angaben"><colgroup><col class="c1"><col><col class="c3"></colgroup><tbody>${zeilen}</tbody></table></section>`;
  }).join('\n');

  const verlaufHtml = verlauf.length ? `<section class="gruppe"><h2>Frühere Angaben</h2>
<table class="liste"><thead><tr><th scope="col">Merkmal</th><th scope="col">Angabe</th><th scope="col">Gültig</th><th scope="col">Quelle</th></tr></thead><tbody>
${verlauf.sort((x, y) => String(y.gueltig_ab || y.erfasst_am).localeCompare(String(x.gueltig_ab || x.erfasst_am))).map((x) => {
    const m = merkmale[x.merkmal_key];
    const g2 = geltung(x);
    const zeitraum = [x.gueltig_ab ? 'ab ' + datum(x.gueltig_ab) : '', x.gueltig_bis ? 'bis ' + datum(x.gueltig_bis) : ''].filter(Boolean).join(' ');
    return `<tr><td>${esc(m?.bezeichnung || x.merkmal_key)}</td><td>${esc(wertText(x, m))}${g2 ? `<span class="geltung">${esc(g2)}</span>` : ''}</td><td class="meta">${esc(zeitraum)}</td><td>${quelleVerweis(x.quelle_id, nummern)}</td></tr>`;
  }).join('\n')}
</tbody></table></section>` : '';

  const kalkHtml = kalk.length ? `<section class="gruppe" id="rechner"><h2>Ergebnisse des Anbieterrechners</h2>
<p class="einleitung">Abfragen mit festen <a href="${L('methodik')}#referenzfaelle">Referenzfällen</a>, wiedergegeben wie vom Rechner angezeigt.</p>
<table class="liste"><thead><tr><th scope="col">Referenzfall</th><th scope="col">Ergebnis</th><th scope="col">Abgefragt</th><th scope="col">Quelle</th></tr></thead><tbody>
${kalk.map((k) => `<tr><td>${esc(referenzfaelle[k.referenzfall_key]?.bezeichnung || 'Eigene Eingaben')}</td><td>${esc(k.ergebnis_kurz || '')}${k.anmerkung ? `<span class="meta">${esc(k.anmerkung)}</span>` : ''}</td><td class="zahl meta">${datum(k.abgefragt_am)}</td><td>${quelleVerweis(k.quelle_id, nummern)}</td></tr>`).join('\n')}
</tbody></table></section>` : '';

  const bezHtml = bez.length ? `<section class="gruppe"><h2>Verbindungen</h2><ul class="bez">
${bez.map((b) => {
    const objekt = organisationen[b.objekt_organisation_id];
    const objektAngebot = angebote.find((x) => x.organisation_id === b.objekt_organisation_id && x.kategorie_key === 'dienstleister');
    const objektName = objektAngebot ? `<a href="${L('angebote/' + objektAngebot.slug)}">${esc(objekt?.name)}</a>` : esc(objekt?.name || '');
    let satz;
    if (b.objekt_organisation_id === a.organisation_id && b.subjekt_angebot_id !== a.id && b.subjekt_organisation_id !== a.organisation_id) {
      const subj = b.subjekt_angebot_id ? angebotById[b.subjekt_angebot_id] : null;
      const subjName = subj ? `<a href="${L('angebote/' + subj.slug)}">${esc(subj.name)}</a>` : esc(organisationen[b.subjekt_organisation_id]?.name || '');
      satz = `${BEZIEHUNG_RUECK[b.typ] || b.typ}: ${subjName}`;
    } else {
      satz = `${BEZIEHUNG[b.typ] || b.typ} ${objektName}`;
    }
    return `<li>${satz} ${quelleVerweis(b.quelle_id, nummern)}${b.beschreibung ? `<span class="meta">${esc(b.beschreibung)}</span>` : ''}</li>`;
  }).join('\n')}</ul></section>` : '';

  const quellenHtml = nummern.size ? `<section class="gruppe" id="quellen"><h2>Quellen</h2><ol class="quellen">
${[...nummern.entries()].map(([id, n]) => {
    const q = quellen[id] || {};
    const titel = q.url ? `<a href="${esc(q.url)}" rel="noopener" target="_blank">${esc(q.titel)}</a>` : esc(q.titel || 'Quelle');
    const teile = [q.typ === 'anbieterauskunft' ? 'Mitteilung des Anbieters an das Portal' : '', q.herausgeber, q.veroeffentlicht_am ? 'veröffentlicht ' + datum(q.veroeffentlicht_am) : '', q.abgerufen_am ? 'abgerufen ' + datum(q.abgerufen_am) : ''].filter(Boolean).join(' · ');
    const archiv = q.archiv_url ? ` · <a href="${esc(q.archiv_url)}" rel="noopener" target="_blank">Archivkopie</a>` : '';
    return `<li id="quelle-${n}" value="${n}">${titel}<span class="meta">${esc(teile)}${archiv}</span></li>`;
  }).join('\n')}</ol></section>` : '';

  const kat = kategorien[a.kategorie_key];
  const inhalt = `
<section class="auftakt auftakt-klein">
  <div class="rahmen">
    <p class="pfad"><a href="${L('')}">Übersicht</a> · ${esc(a.kategorie_key === 'dienstleister' ? 'Angebote für Unternehmen' : 'Angebote für Endkunden')}</p>
    <h1>${esc(a.name)}${a.oeffentlich ? '' : ' <span class="entwurf-marke">Entwurf</span>'}</h1>
    <p class="lead">${esc(a.organisation?.name || '')}${a.kurzbeschreibung ? ` · ${esc(a.kurzbeschreibung)}` : ''}</p>
    <div class="kopfzeile">
      ${statusChip(a.verf)}
      ${a.kategorie_key === 'endkunden' ? `<span class="zugang-marke">${a.grp.angabe ? beleg([a.grp.angabe], esc(a.grp.label)) : esc(a.grp.label)}</span>` : ''}
      ${a.url ? `<a class="extern" href="${esc(a.url)}" rel="noopener" target="_blank">Website des Anbieters</a>` : ''}
      <span class="meta">Datenstand ${datum(a.stand) || '–'}</span>
    </div>
  </div>
</section>
<div class="rahmen detail">
${kiHinweis()}
${gruppenHtml || '<p>Für dieses Angebot sind noch keine Angaben erfasst.</p>'}
${kalkHtml}
${verlaufHtml}
${bezHtml}
${quellenHtml}
<p class="anmerkung">Angabe fehlt oder ist veraltet? Hinweis mit Beleg an <a href="mailto:${esc(cfg.hinweisEmail)}?subject=${encodeURIComponent('Hinweis zu ' + a.name)}">${esc(cfg.hinweisEmail)}</a>.</p>
</div>`;

  return seite({
    tiefe, titel: a.name, kanonisch: 'angebote/' + a.slug, aktiv: 'start', inhalt,
    beschreibung: `${a.name} (${a.organisation?.name || ''}): Verfügbarkeit, Voraussetzungen und Kosten der Direktvermarktung mit Quellen.`
  });
}

// ---------------------------------------------------------------------------
// Änderungsprotokoll

function aenderungsseite() {
  const tiefe = 1;
  const L = (z) => link(tiefe, z);
  const eintraege = [];
  const protokoll = daten.aenderungsprotokoll.filter((x) => !x.startbestand);
  const neu = group(protokoll.filter((x) => x.aenderungsart === 'neu'), (x) => isoTag(x.erfasst_am) + '|' + x.angebot_id);
  for (const [k, liste] of Object.entries(neu)) {
    const [tag, id] = k.split('|');
    const an = angebotById[id];
    const art = an && isoTag(an.aufgenommen_am) === tag ? 'Aufgenommen' : 'Ergänzt';
    eintraege.push({ tag, sort: tag + ' 0', art, html: `<a href="${L('angebote/' + (angebotById[id]?.slug || ''))}">${esc(liste[0].angebot_name)}</a> <span class="meta">${liste.length} ${liste.length === 1 ? 'Angabe' : 'Angaben'}</span>` });
  }
  for (const x of protokoll.filter((y) => y.aenderungsart !== 'neu')) {
    const m = merkmale[x.merkmal_key];
    const vorher = x.vorher_status ? wertText(x, m, 'vorher_') : '';
    const nachher = wertText(x, m);
    const g2 = geltung(x);
    eintraege.push({
      tag: isoTag(x.erfasst_am), sort: x.erfasst_am, art: AENDERUNGSART[x.aenderungsart],
      html: `<a href="${L('angebote/' + x.angebot_slug)}">${esc(x.angebot_name)}</a> · ${esc(x.merkmal_bezeichnung)}: ${vorher ? `<del>${esc(vorher)}</del> → ` : ''}<ins>${esc(nachher)}</ins>${g2 ? ` <span class="geltung">${esc(g2)}</span>` : ''}${x.gueltig_ab && x.aenderungsart === 'aenderung_anbieter' ? ` <span class="meta">gültig ab ${datum(x.gueltig_ab)}</span>` : ''}<span class="meta">Anlass: ${esc(ANLASS[x.ausgeloest_durch] || x.ausgeloest_durch)}${x.quelle_url ? ` · <a href="${esc(x.quelle_url)}" rel="noopener" target="_blank">Quelle</a>` : ''}${x.anmerkung ? ' · ' + esc(x.anmerkung) : ''}</span>`
    });
  }
  for (const k of daten.kalkulator) {
    const an = angebotById[k.angebot_id];
    if (!an) continue;
    eintraege.push({ tag: isoTag(k.erfasst_am), sort: k.erfasst_am, art: k.aenderungsart === 'korrektur' ? 'Korrektur Rechnerabfrage' : 'Rechnerabfrage', html: `<a href="${L('angebote/' + an.slug)}">${esc(an.name)}</a> · ${esc(referenzfaelle[k.referenzfall_key]?.bezeichnung || 'Eigene Eingaben')}: ${esc(k.ergebnis_kurz || '')} <span class="meta">abgefragt ${datum(k.abgefragt_am)}</span>` });
  }
  // Startbestand: alles bis einschließlich cfg.startbestandBis erscheint als ein Eintrag
  const startBis = cfg.startbestandBis;
  if (startBis) {
    const vorher = eintraege.filter((e) => e.tag <= startBis);
    if (vorher.length) {
      const imStart = angebote.filter((a) => a.aufgenommen_am && isoTag(a.aufgenommen_am) <= startBis);
      const ek = imStart.filter((a) => a.kategorie_key === 'endkunden').length;
      const dl = imStart.filter((a) => a.kategorie_key === 'dienstleister').length;
      for (let i = eintraege.length - 1; i >= 0; i--) if (eintraege[i].tag <= startBis) eintraege.splice(i, 1);
      eintraege.push({ tag: startBis, sort: startBis + ' 0', art: 'Startbestand', html: `Erste Veröffentlichung mit ${ek} Angeboten für Endkunden und ${dl} für Unternehmen. Änderungen werden ab dem Folgetag einzeln dokumentiert; Bearbeitungsstände vor der Veröffentlichung stehen in der Datei <a href="${L('daten/aenderungen.csv')}">aenderungen.csv</a>.` });
    }
  }
  eintraege.sort((a, b) => String(b.sort).localeCompare(String(a.sort)));
  const nachTag = group(eintraege, (e) => e.tag);
  const html = Object.keys(nachTag).sort().reverse().map((tag) => `<section class="tag"><h2>${datum(tag)}</h2><ul class="protokoll">
${nachTag[tag].map((e) => `<li><span class="art">${esc(e.art)}</span><span class="was">${e.html}</span></li>`).join('\n')}
</ul></section>`).join('\n');

  const inhalt = `
<section class="auftakt auftakt-klein"><div class="rahmen">
  <h1>Änderungsprotokoll</h1>
  <p class="lead">Jede Angabe wird fortgeschrieben, nicht überschrieben. Änderungen der Anbieter und Korrekturen des Portals sind getrennt gekennzeichnet.</p>
</div></section>
<div class="rahmen schmal detail">
${html || '<p>Noch keine Einträge.</p>'}
</div>`;
  return seite({ tiefe, titel: 'Änderungsprotokoll', kanonisch: 'aenderungen', aktiv: 'aenderungen', inhalt, beschreibung: 'Alle Änderungen an den Angaben mit Datum, Anlass und Quelle.' });
}

// ---------------------------------------------------------------------------
// Methodik

function methodikseite() {
  const tiefe = 1;
  const L = (z) => link(tiefe, z);
  const ref = daten.referenzfall.map((r) => `<tr><td>${esc(r.bezeichnung)}</td><td class="zahl">${zahl(r.kwp)}</td><td class="zahl">${zahl(r.erzeugung_kwh, 0)}</td><td class="zahl">${zahl(r.eigenverbrauchsquote * 100, 0)}&nbsp;%</td><td class="zahl">${zahl(r.einspeisung_kwh, 0)}</td></tr>`).join('\n');
  const glossar = GRUPPEN_REIHENFOLGE.map((g) => {
    const ms = daten.merkmal.filter((m) => m.gruppe === g && m.aktiv);
    if (!ms.length) return '';
    return `<h3>${esc(g)}</h3><dl class="glossar">${ms.map((m) => `<div><dt>${esc(m.bezeichnung)}${m.einheit ? ` <span class="meta">${esc(m.einheit)}</span>` : ''}</dt><dd>${esc(m.definition)}${m.optionen ? `<span class="meta">Ausprägungen: ${m.optionen.map((o) => esc(o.bezeichnung)).join(', ')}</span>` : ''}</dd></div>`).join('')}</dl>`;
  }).join('\n');
  const versionen = (cfg.methodikVersionen || []).map((v) => `<li><span class="zahl">${datum(v.datum)}</span> ${esc(v.text)}</li>`).join('');

  const inhalt = `
<section class="auftakt auftakt-klein"><div class="rahmen">
  <h1>Methodik</h1>
  <p class="lead">Was erfasst wird, wie Angaben belegt sind und nach welchen Regeln das Portal Angebote darstellt.</p>
</div></section>
<div class="rahmen schmal detail text">
<section>
<h2>Gegenstand</h2>
<p>Das Portal erfasst Angebote, mit denen Betreiber von PV-Anlagen bis 100&nbsp;kWp installierter Modulleistung ihren Strom direkt vermarkten lassen können. Erfasst werden eigenständige Angebote ebenso wie Angebote in Verbindung mit Stromtarif, Hardware, Gemeinschaftsmodellen oder weiteren Leistungen, gefördert wie ungefördert.</p>
<p>Getrennt davon stehen Angebote für Unternehmen: Plattformen und Dienstleistungen für Unternehmen, die selbst Direktvermarktung anbieten wollen.</p>
</section>
<section>
<h2>Aufnahme</h2>
<p>Aufgenommen wird jedes Angebot, zu dem öffentlich zugängliche Informationen vorliegen. Als angekündigt gilt ein Angebot, sobald der Anbieter es öffentlich angekündigt hat. Die Aufnahme setzt keine Mitwirkung des Anbieters voraus.</p>
</section>
<section>
<h2>Angaben und Quellen</h2>
<p>Grundlage sind ausschließlich veröffentlichte Informationen: Websites, Preisblätter und Geschäftsbedingungen der Anbieter, Pressemitteilungen und Fachpresse. Jede Angabe nennt Quelle und Abrufdatum und folgt möglichst dem Wortlaut der Quelle. Eigene Schätzungen fließen nicht ein. Primärquellen der Anbieter haben Vorrang vor Fachpresse; Angaben nur aus der Fachpresse sind beim Überfahren gestrichelt statt gepunktet unterstrichen.</p>
<p>Die Recherche zu den Angeboten erfolgt KI-gestützt: Quellen werden mit KI gesucht, ausgewertet und zusammengefasst. Die Angaben sind ohne Garantie. Korrekturen bitte an <a href="mailto:${esc(cfg.hinweisEmail)}">${esc(cfg.hinweisEmail)}</a>.</p>
<p>Korrekturen, die Anbieter mitteilen, werden übernommen und bei der jeweiligen Angabe als Mitteilung des Anbieters gekennzeichnet.</p>
<p>Gelten Bedingungen nur für bestimmte Anlagengrößen, Netzgebiete oder Voraussetzungen, steht dies bei der jeweiligen Angabe.</p>
</section>
<section>
<h2>Darstellung und Reihenfolge</h2>
<p>Die Übersicht gliedert die Angebote für Endkunden danach, ob die Direktvermarktung an weitere Produkte gekoppelt ist (Merkmal „Gekoppelt an“). Ein intelligentes Messsystem ist für die Direktvermarktung fast immer erforderlich und zählt nicht als Kopplung, solange es von einem beliebigen Messstellenbetreiber stammen kann. Ist ein Angebot an Hardware des Anbieters gekoppelt, steht es in der dritten Gruppe, auch wenn zusätzlich ein Stromtarif erforderlich ist.</p>
<dl class="glossar">${Object.entries(GRUPPE).filter(([k]) => k !== 'unklar').map(([, g]) => `<div><dt>${esc(g.label)} <span class="meta">${esc(g.sortierung)}</span></dt><dd>${esc(g.text)}</dd></div>`).join('')}</dl>
<p>In der Gruppe „Ohne weitere Produkte“ stehen die Angebote in der Reihenfolge ihrer ersten auffindbaren Veröffentlichung, in den übrigen Gruppen alphabetisch nach Anbieter. Die Reihenfolge ist keine Bewertung.</p>
<p>Je Angebot zeigt die Übersicht den Status, die Einschränkungen (Kopplung, Leistungsgrenzen, weitere Bedingungen), das Vergütungsmodell und die Preisgestaltung. Die Preisgestaltung fasst zusammen, was Kundinnen und Kunden dem Anbieter zahlen; sie beruht ausschließlich auf Veröffentlichungen der Anbieter. Liegen zu Preisen nur Berichte der Fachpresse vor, steht die Angabe dezenter und mit dem Hinweis „laut Fachpresse“. Alle erfassten Angaben einschließlich Neu- oder Bestandsanlagen und Form der Direktvermarktung stehen in der <a href="${L('detailansicht')}">Detailansicht</a>, Wortlaut, Quellen und frühere Stände auf den Seiten der Angebote.</p>
<p>Das Portal spricht keine Empfehlungen aus und vergibt keine Rangplätze oder Auszeichnungen, auch nicht gegen Entgelt. Anbieter haben keinen Einfluss auf den Inhalt der Angaben.</p>
</section>
<section>
<h2>Änderungen und Korrekturen</h2>
<p>Angaben werden nicht überschrieben, sondern fortgeschrieben. Das <a href="${L('aenderungen')}">Änderungsprotokoll</a> unterscheidet Änderungen durch den Anbieter, die ab einem bestimmten Datum gelten, von Korrekturen und Präzisierungen durch das Portal. Der Startbestand vom ${datum(cfg.startbestandBis || '')} erscheint dort als ein Eintrag; seitdem wird jede Änderung mit Datum einzeln aufgeführt.</p>
<p>Hinweise von Anbietern, Nutzerinnen und Nutzern oder Dritten bitte mit Beleg an <a href="mailto:${esc(cfg.hinweisEmail)}">${esc(cfg.hinweisEmail)}</a>. Übernommene Hinweise erscheinen mit ihrem Anlass im Protokoll.</p>
</section>
<section id="referenzfaelle">
<h2>Referenzfälle</h2>
<p>Wo Anbieter Konditionen nur über einen Rechner ausweisen, wird dieser mit festen Referenzfällen abgefragt. Das Ergebnis wird wiedergegeben, wie der Rechner es anzeigt, mit Datum und Bildschirmkopie als Beleg. Die Abfragen werden in regelmäßigen Abständen wiederholt.</p>
<div class="tabelle-rahmen"><table class="liste"><thead><tr><th scope="col">Referenzfall</th><th scope="col">kWp</th><th scope="col">Erzeugung kWh/a</th><th scope="col">Eigenverbrauch</th><th scope="col">Einspeisung kWh/a</th></tr></thead><tbody>
${ref}
</tbody></table></div>
<p class="meta">Spezifischer Ertrag 900&nbsp;kWh/kWp. Ausrichtung und Messsystem werden nicht unterschieden. Fragt ein Rechner eine EEG-Vergütung ab, gilt der Satz zum Zeitpunkt der Abfrage.</p>
</section>
<section>
<h2>Grenzen</h2>
<p>Die Übersicht zeigt Bedingungen, keine Erlöse. Sie ersetzt nicht die Prüfung der Vertragsunterlagen; maßgeblich sind die Bedingungen der Anbieter zum Zeitpunkt des Vertragsschlusses.</p>
</section>
<section>
<h2>Merkmale</h2>
${glossar}
</section>
<section>
<h2>Fassungen dieser Methodik</h2>
<ul class="versionen">${versionen}</ul>
</section>
</div>`;
  return seite({ tiefe, titel: 'Methodik', kanonisch: 'methodik', aktiv: 'methodik', inhalt, beschreibung: 'Aufnahme, Quellen, Darstellung und Korrekturen im Transparenzportal Direktvermarktung.' });
}

// ---------------------------------------------------------------------------
// Daten und Downloads

function csv(zeilen, spalten) {
  const zelle = (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(v).replace('.', ',');
    if (Array.isArray(v)) v = v.join('|');
    if (typeof v === 'boolean') v = v ? 'ja' : 'nein';
    const s = String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [spalten.join(';'), ...zeilen.map((z) => spalten.map((s) => zelle(z[s])).join(';'))].join('\r\n') + '\r\n';
}

function downloads() {
  const slug = (id) => angebotById[id]?.slug || '';
  const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  const angebotZeilen = [...endkunden, ...dienstleister].map((a) => ({
    angebot: a.slug, name: a.name, organisation: a.organisation?.name, kategorie: a.kategorie_key, url: a.url,
    verfuegbarkeit: a.verf.key, gruppe: a.kategorie_key === 'endkunden' ? a.grp.key : null, erstmals_veroeffentlicht: a.erst || null, start_angekuendigt: einfach(a, 'start_angekuendigt').leer ? null : einfach(a, 'start_angekuendigt').text,
    aufgenommen_am: a.aufgenommen_am, datenstand: a.stand
  }));
  const angabeZeilen = daten.angabe_verlauf.map((x) => ({
    id: x.id, angebot: slug(x.angebot_id), merkmal: x.merkmal_key, status: x.status,
    wert: (() => { const m = merkmale[x.merkmal_key]; const r = rohwert(x, m); return typeof r === 'string' && m?.datentyp === 'zahl' ? num(r) : (m?.datentyp === 'zahl' ? num(r) : r); })(),
    einheit: x.einheit, steuer: x.steuer, kwp_von: num(x.kwp_von), kwp_bis: num(x.kwp_bis), netzgebiet: x.netzgebiet, bedingung: x.bedingung,
    gueltig_ab: x.gueltig_ab, gueltig_bis: x.gueltig_bis, aktuell: x.aktuell, erfasst_am: x.erfasst_am, quelle_id: x.quelle_id
  }));
  const protokollZeilen = daten.aenderungsprotokoll.map((x) => ({
    id: x.id, erfasst_am: x.erfasst_am, angebot: x.angebot_slug, merkmal: x.merkmal_key, aenderungsart: x.aenderungsart, anlass: x.ausgeloest_durch,
    vorher: x.vorher_status ? wertText(x, merkmale[x.merkmal_key], 'vorher_') : null, nachher: wertText(x, merkmale[x.merkmal_key]),
    gueltig_ab: x.gueltig_ab, quelle_url: x.quelle_url, startbestand: !!x.startbestand
  }));
  const anbieterZeilen = daten.organisation.map((o) => {
    const eigene = [...endkunden, ...dienstleister].filter((a) => a.organisation_id === o.id);
    return { anbieter: o.slug, name: o.name, rechtlicher_name: o.rechtlicher_name, website: o.website, angebote_endkunden: eigene.filter((a) => a.kategorie_key === 'endkunden').length, angebote_unternehmen: eigene.filter((a) => a.kategorie_key === 'dienstleister').length, angebote: eigene.map((a) => a.slug) };
  }).filter((z) => z.angebote.length);
  const quellZeilen = daten.quelle.map((q) => ({ id: q.id, typ: q.typ, titel: q.titel, url: q.url, herausgeber: q.herausgeber, veroeffentlicht_am: q.veroeffentlicht_am, abgerufen_am: q.abgerufen_am, archiv_url: q.archiv_url }));
  const kalkZeilen = daten.kalkulator.map((k) => ({ id: k.id, angebot: slug(k.angebot_id), referenzfall: k.referenzfall_key, abgefragt_am: k.abgefragt_am, ergebnis: k.ergebnis_kurz, eingaben: JSON.stringify(k.eingaben), ergebnis_detail: JSON.stringify(k.ergebnis), aktuell: !ersetzteKalk.has(k.id), quelle_id: k.quelle_id }));
  const refZeilen = daten.referenzfall.map((r) => ({ referenzfall: r.key, bezeichnung: r.bezeichnung, kwp: num(r.kwp), spez_ertrag_kwh_kwp: num(r.spez_ertrag_kwh_kwp), eigenverbrauchsquote: num(r.eigenverbrauchsquote), erzeugung_kwh: num(r.erzeugung_kwh), einspeisung_kwh: num(r.einspeisung_kwh), gueltig_ab: r.gueltig_ab }));
  const merkmalZeilen = daten.merkmal.map((m) => ({ merkmal: m.key, bezeichnung: m.bezeichnung, gruppe: m.gruppe, datentyp: m.datentyp, einheit: m.einheit, definition: m.definition, auspraegungen: m.optionen ? m.optionen.map((o) => o.key).join('|') : null }));

  return {
    'angebote.csv': csv(angebotZeilen, ['angebot', 'name', 'organisation', 'kategorie', 'url', 'verfuegbarkeit', 'gruppe', 'erstmals_veroeffentlicht', 'start_angekuendigt', 'aufgenommen_am', 'datenstand']),
    'angaben.csv': csv(angabeZeilen, ['id', 'angebot', 'merkmal', 'status', 'wert', 'einheit', 'steuer', 'kwp_von', 'kwp_bis', 'netzgebiet', 'bedingung', 'gueltig_ab', 'gueltig_bis', 'aktuell', 'erfasst_am', 'quelle_id']),
    'aenderungen.csv': csv(protokollZeilen, ['id', 'erfasst_am', 'angebot', 'merkmal', 'aenderungsart', 'anlass', 'vorher', 'nachher', 'gueltig_ab', 'quelle_url', 'startbestand']),
    'anbieter.csv': csv(anbieterZeilen, ['anbieter', 'name', 'rechtlicher_name', 'website', 'angebote_endkunden', 'angebote_unternehmen', 'angebote']),
    'quellen.csv': csv(quellZeilen, ['id', 'typ', 'titel', 'url', 'herausgeber', 'veroeffentlicht_am', 'abgerufen_am', 'archiv_url']),
    'rechnerabfragen.csv': csv(kalkZeilen, ['id', 'angebot', 'referenzfall', 'abgefragt_am', 'ergebnis', 'eingaben', 'ergebnis_detail', 'aktuell', 'quelle_id']),
    'referenzfaelle.csv': csv(refZeilen, ['referenzfall', 'bezeichnung', 'kwp', 'spez_ertrag_kwh_kwp', 'eigenverbrauchsquote', 'erzeugung_kwh', 'einspeisung_kwh', 'gueltig_ab']),
    'merkmale.csv': csv(merkmalZeilen, ['merkmal', 'bezeichnung', 'gruppe', 'datentyp', 'einheit', 'definition', 'auspraegungen']),
    'daten.json': JSON.stringify({ stand: STAND, herausgeber: cfg.betreiber.name, anbieter: anbieterZeilen, angebote: angebotZeilen, angaben: angabeZeilen, aenderungen: protokollZeilen, quellen: quellZeilen, rechnerabfragen: kalkZeilen, referenzfaelle: refZeilen, merkmale: merkmalZeilen }, null, 2)
  };
}

function datenseite(dateien) {
  const tiefe = 1;
  const L = (z) => link(tiefe, z);
  const BESCHREIBUNG = {
    'angebote.csv': 'Alle Angebote mit Kategorie, Gruppe, Verfügbarkeit und Datenstand',
    'angaben.csv': 'Alle Angaben einschließlich früherer Stände, je Zeile ein Merkmal',
    'aenderungen.csv': 'Änderungsprotokoll mit Art, Anlass sowie vorherigem und neuem Wert',
    'quellen.csv': 'Quellen mit Abrufdatum',
    'rechnerabfragen.csv': 'Ergebnisse der Anbieterrechner für die Referenzfälle',
    'referenzfaelle.csv': 'Definition der Referenzfälle',
    'merkmale.csv': 'Definition aller Merkmale und Ausprägungen',
    'anbieter.csv': 'Anbieter (Unternehmen) mit ihren Angeboten',
    'daten.json': 'Alle Tabellen in einer Datei'
  };
  const kb = (s) => `${zahl(Buffer.byteLength(s) / 1024, 0)} KB`;
  const liste = Object.entries(dateien).map(([name, inhalt]) => `<tr><td><a href="${L('daten/' + name)}" download>${name}</a></td><td>${BESCHREIBUNG[name]}</td><td class="zahl meta">${kb(inhalt)}</td></tr>`).join('\n');
  const inhalt = `
<section class="auftakt auftakt-klein"><div class="rahmen">
  <h1>Daten</h1>
  <p class="lead">Alle Angaben zum Herunterladen, einschließlich früherer Stände. Die Dateien werden bei jeder Änderung neu erzeugt.</p>
</div></section>
<div class="rahmen schmal detail text">
<div class="tabelle-rahmen"><table class="liste"><thead><tr><th scope="col">Datei</th><th scope="col">Inhalt</th><th scope="col">Größe</th></tr></thead><tbody>
${liste}
</tbody></table></div>
<p class="meta">CSV mit Semikolon als Trennzeichen, Dezimalkomma und UTF-8. Mehrfachwerte sind durch senkrechte Striche getrennt. Datenstand ${datum(STAND)}.</p>
<h2>Verknüpfung</h2>
<p>Angaben verweisen über <code>angebot</code> auf die Angebote und über <code>quelle_id</code> auf die Quellen. Bedeutung und Ausprägungen der Merkmale stehen in <code>merkmale.csv</code> und auf der Seite <a href="${L('methodik')}">Methodik</a>.</p>
<h2>Quellenangabe</h2>
<p>Bei Verwendung bitte angeben: ${esc(cfg.portalName)}, ${esc(cfg.betreiber.name)}, Datenstand ${datum(STAND)}, ${esc(cfg.siteUrl.replace('https://', ''))}.</p>
</div>`;
  return seite({ tiefe, titel: 'Daten', kanonisch: 'daten', aktiv: 'daten', inhalt, beschreibung: 'Alle Angaben zur Direktvermarktung kleiner PV-Anlagen als CSV und JSON, einschließlich früherer Stände.' });
}

// ---------------------------------------------------------------------------
// Rechtliches

function impressum() {
  const b = cfg.betreiber;
  const inhalt = `
<section class="auftakt auftakt-klein"><div class="rahmen"><h1>Impressum</h1></div></section>
<div class="rahmen schmal detail text">
<h2>Angaben gemäß § 5 DDG</h2>
<p>${esc(b.name)}<br>${esc(b.strasse)}<br>${esc(b.ort)}</p>
<p>Handelsregister: ${esc(b.register)}<br>USt-IdNr.: ${esc(b.ustId)}<br>Vertreten durch: ${esc(b.vertreten)}</p>
<h2>Kontakt</h2>
<p>E-Mail: <a href="mailto:${esc(cfg.kontaktEmail)}">${esc(cfg.kontaktEmail)}</a><br>Hinweise zu Angaben im Portal: <a href="mailto:${esc(cfg.hinweisEmail)}">${esc(cfg.hinweisEmail)}</a></p>
<h2>Verantwortlich für journalistisch-redaktionelle Inhalte gemäß § 18 Abs. 2 MStV</h2>
<p>${esc(b.verantwortlich)}<br>${esc(b.strasse)}<br>${esc(b.ort)}</p>
<h2>Haftung für Inhalte</h2>
<p>Die Angaben in diesem Portal beruhen auf veröffentlichten Informationen und auf Mitteilungen der Anbieter; die Quelle ist bei jeder Angabe genannt. Sie wurden mit Sorgfalt erstellt. Für Richtigkeit, Vollständigkeit und Aktualität wird keine Gewähr übernommen. Maßgeblich sind die Vertragsunterlagen der Anbieter.</p>
<h2>Haftung für Links</h2>
<p>Das Portal verweist auf Websites Dritter, auf deren Inhalte die ${esc(b.name)} keinen Einfluss hat. Für diese Inhalte ist der jeweilige Anbieter verantwortlich.</p>
</div>`;
  return seite({ tiefe: 1, titel: 'Impressum', kanonisch: 'impressum', aktiv: '', inhalt, beschreibung: 'Impressum des Transparenzportals Direktvermarktung.' });
}

function datenschutz() {
  const b = cfg.betreiber;
  const umami = cfg.umami?.websiteId ? `
<h2>Reichweitenmessung</h2>
<p>Zur Messung der Seitenaufrufe nutzt das Portal Umami (Umami Software, Inc.). Umami setzt keine Cookies und speichert keine IP-Adressen. Erfasst werden aufgerufene Seite, verweisende Seite, Browser, Betriebssystem, Gerätetyp und Land in zusammengefasster Form. Ein Personenbezug wird nicht hergestellt. Die Verarbeitung beruht auf Art. 6 Abs. 1 lit. f DSGVO; das berechtigte Interesse liegt in der Kenntnis der Nutzung des Portals. Ist im Browser „Do Not Track“ aktiviert, findet keine Messung statt.</p>` : '';
  const inhalt = `
<section class="auftakt auftakt-klein"><div class="rahmen"><h1>Datenschutz</h1></div></section>
<div class="rahmen schmal detail text">
<h2>Verantwortlicher</h2>
<p>${esc(b.name)}, ${esc(b.strasse)}, ${esc(b.ort)}, E-Mail: <a href="mailto:${esc(cfg.kontaktEmail)}">${esc(cfg.kontaktEmail)}</a></p>
<h2>Bereitstellung der Website</h2>
<p>Die Website wird über GitHub Pages (GitHub, Inc., USA) ausgeliefert. Beim Aufruf verarbeitet der Hoster technisch notwendige Daten, insbesondere IP-Adresse, Zeitpunkt, aufgerufene Seite und Browserangaben, um die Seite auszuliefern und die Sicherheit des Betriebs zu gewährleisten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. GitHub ist nach dem EU-US Data Privacy Framework zertifiziert.</p>
<p>Schriften und alle weiteren Bestandteile der Seite werden vom selben Server geladen. Das Portal setzt keine Cookies.</p>
${umami}
<h2>Kontakt per E-Mail</h2>
<p>Wer Hinweise oder Anfragen per E-Mail sendet, übermittelt Name, E-Mail-Adresse und Inhalt der Nachricht. Diese Daten werden zur Bearbeitung verwendet, Art. 6 Abs. 1 lit. f DSGVO, und gelöscht, sobald sie dafür nicht mehr erforderlich sind und keine Aufbewahrungspflichten bestehen. Personenbezogene Daten aus Hinweisen werden nicht im Portal veröffentlicht.</p>
<h2>Ihre Rechte</h2>
<p>Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit sowie Widerspruch gegen Verarbeitungen auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO. Zudem können Sie sich bei einer Aufsichtsbehörde beschweren, etwa bei der Berliner Beauftragten für Datenschutz und Informationsfreiheit.</p>
<p class="meta">Stand: ${datum(isoTag(new Date().toISOString()))}</p>
</div>`;
  return seite({ tiefe: 1, titel: 'Datenschutz', kanonisch: 'datenschutz', aktiv: '', inhalt, beschreibung: 'Datenschutzhinweise des Transparenzportals Direktvermarktung.' });
}

function fehlerseite() {
  const inhalt = `<section class="auftakt auftakt-klein"><div class="rahmen"><h1>Seite nicht gefunden</h1><p class="lead">Die Adresse existiert nicht oder nicht mehr.</p><p><a href="/">Zur Übersicht</a></p></div></section>`;
  return seite({ tiefe: 0, titel: 'Seite nicht gefunden', kanonisch: '', aktiv: '', inhalt, beschreibung: 'Seite nicht gefunden.' }).replace(/href="\.\//g, 'href="/');
}

// ---------------------------------------------------------------------------
// Schreiben

async function schreibe(rel, inhalt) {
  const ziel = path.join(OUT, rel);
  await fs.mkdir(path.dirname(ziel), { recursive: true });
  await fs.writeFile(ziel, inhalt);
}

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });
await fs.cp(path.join(ROOT, 'src'), path.join(OUT, 'assets'), { recursive: true });

await schreibe('index.html', startseite());
await schreibe('detailansicht/index.html', detailseite());
for (const a of [...endkunden, ...dienstleister]) await schreibe(`angebote/${a.slug}/index.html`, angebotsseite(a));
await schreibe('aenderungen/index.html', aenderungsseite());
await schreibe('methodik/index.html', methodikseite());
const dateien = downloads();
for (const [name, inhalt] of Object.entries(dateien)) await schreibe(`daten/${name}`, inhalt);
await schreibe('daten/index.html', datenseite(dateien));
await schreibe('impressum/index.html', impressum());
await schreibe('datenschutz/index.html', datenschutz());
await schreibe('404.html', fehlerseite());

const host = new URL(cfg.siteUrl).host;
await schreibe('CNAME', host + '\n');
await schreibe('robots.txt', VORSCHAU ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nSitemap: ${cfg.siteUrl}/sitemap.xml\n`);
const urls = ['', 'detailansicht/', 'aenderungen/', 'daten/', 'methodik/', 'impressum/', 'datenschutz/', ...[...endkunden, ...dienstleister].map((a) => `angebote/${a.slug}/`)];
await schreibe('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${cfg.siteUrl}/${u}</loc></url>`).join('\n')}\n</urlset>\n`);

console.log(`Fertig: ${endkunden.length} Angebote, ${dienstleister.length} Dienstleister, Stand ${STAND}${VORSCHAU ? ' (VORSCHAU mit Entwürfen)' : ''} → ${path.relative(ROOT, OUT) || '.'}`);
