// Navigation auf kleinen Bildschirmen
(function () {
  var knopf = document.querySelector('.menue');
  var nav = document.getElementById('navigation');
  if (!knopf || !nav) return;
  knopf.addEventListener('click', function () {
    var offen = nav.classList.toggle('offen');
    knopf.setAttribute('aria-expanded', offen ? 'true' : 'false');
  });
})();

// Belege: Quelle einer Angabe beim Überfahren, Antippen oder per Tastatur
(function () {
  var belege = document.querySelectorAll('.beleg');
  if (!belege.length) return;
  var tipp = document.createElement('div');
  tipp.className = 'tipp';
  tipp.id = 'beleg-tipp';
  tipp.setAttribute('role', 'tooltip');
  tipp.hidden = true;
  document.body.appendChild(tipp);
  var offen = null, timer = null;
  function el(tag, klasse, text) { var e = document.createElement(tag); if (klasse) e.className = klasse; if (text) e.textContent = text; return e; }
  function zeige(b) {
    var d = b.dataset;
    tipp.textContent = '';
    tipp.className = 'tipp' + (b.classList.contains('sekundaer') ? ' sekundaer' : '');
    tipp.appendChild(el('span', 'art', d.typ));
    var titel = el('span', 'titel');
    if (d.url) { var a = el('a', '', d.titel); a.href = d.url; a.target = '_blank'; a.rel = 'noopener'; titel.appendChild(a); } else titel.textContent = d.titel;
    tipp.appendChild(titel);
    tipp.appendChild(el('span', 'daten', [d.herausgeber, d.datum].filter(Boolean).join(' · ')));
    if (d.wortlaut) tipp.appendChild(el('blockquote', '', '„' + d.wortlaut + '“'));
    if (d.zusatz) tipp.appendChild(el('div', 'zusatz', d.zusatz));
    tipp.hidden = false;
    var r = b.getBoundingClientRect(), t = tipp.getBoundingClientRect();
    var breite = document.documentElement.clientWidth;
    var x = Math.max(16, Math.min(r.left, breite - t.width - 16)) + window.scrollX;
    var y = r.bottom + window.scrollY + 8;
    if (r.bottom + t.height + 16 > window.innerHeight && r.top - t.height - 8 > 0) y = r.top + window.scrollY - t.height - 8;
    tipp.style.left = x + 'px';
    tipp.style.top = y + 'px';
    if (offen && offen !== b) offen.removeAttribute('aria-expanded');
    offen = b;
    b.setAttribute('aria-expanded', 'true');
    b.setAttribute('aria-describedby', 'beleg-tipp');
  }
  function verstecke() { tipp.hidden = true; if (offen) offen.removeAttribute('aria-expanded'); offen = null; }
  document.addEventListener('pointerover', function (e) {
    if (e.pointerType !== 'mouse') return;
    var b = e.target.closest && e.target.closest('.beleg');
    if (b) { clearTimeout(timer); zeige(b); }
  });
  document.addEventListener('pointerout', function (e) {
    if (e.pointerType !== 'mouse') return;
    var nach = e.relatedTarget;
    if (nach && nach.closest && (nach.closest('.beleg') || nach.closest('#beleg-tipp'))) return;
    timer = setTimeout(verstecke, 180);
  });
  tipp.addEventListener('pointerover', function () { clearTimeout(timer); });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.beleg');
    if (b) { if (offen === b && !tipp.hidden) verstecke(); else zeige(b); return; }
    if (!(e.target.closest && e.target.closest('#beleg-tipp'))) verstecke();
  });
  document.addEventListener('focusin', function (e) { var b = e.target.closest && e.target.closest('.beleg'); if (b) zeige(b); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') verstecke(); });
  window.addEventListener('resize', function () { if (offen) zeige(offen); });
  var rahmen = document.querySelectorAll('.tabelle-rahmen');
  for (var i = 0; i < rahmen.length; i++) rahmen[i].addEventListener('scroll', verstecke, { passive: true });
})();
