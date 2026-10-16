// Navigation auf kleinen Bildschirmen und Filter der Übersicht
(function () {
  var knopf = document.querySelector('.menue');
  var nav = document.getElementById('navigation');
  if (knopf && nav) {
    knopf.addEventListener('click', function () {
      var offen = nav.classList.toggle('offen');
      knopf.setAttribute('aria-expanded', offen ? 'true' : 'false');
    });
  }

  var form = document.getElementById('filter');
  var tabelle = document.getElementById('uebersicht');
  if (!form || !tabelle) return;
  var zeilen = Array.prototype.slice.call(tabelle.querySelectorAll('tbody tr[data-gruppe]'));
  var treffer = document.getElementById('treffer');
  var leer = document.getElementById('leer-filter');
  var gesamt = zeilen.length;

  function zahl(s) { return s === '' || s == null ? null : Number(String(s).replace(',', '.')); }

  function anwenden() {
    var kwp = zahl(form.kwp.value);
    var gruppe = form.querySelector('input[name="gruppe"]:checked').value;
    var ohneStrom = form.ohneStrom.checked;
    var ohneAnlage = form.ohneAnlage.checked;
    var sichtbar = 0;
    zeilen.forEach(function (z) {
      var d = z.dataset;
      var ok = true;
      if (gruppe !== 'alle' && d.gruppe !== gruppe) ok = false;
      if (kwp !== null && !isNaN(kwp)) {
        var min = zahl(d.min), max = zahl(d.max);
        if (min !== null && kwp < min) ok = false;
        if (max !== null && kwp > max) ok = false;
      }
      if (ohneStrom && d.strom === 'erforderlich') ok = false;
      if (ohneAnlage && d.anlage === 'ja') ok = false;
      z.hidden = !ok;
      if (ok) sichtbar++;
    });
    treffer.textContent = sichtbar === gesamt ? gesamt + ' Angebote' : sichtbar + ' von ' + gesamt + ' Angeboten';
    if (leer) leer.hidden = sichtbar !== 0;
  }

  form.addEventListener('input', anwenden);
  form.addEventListener('change', anwenden);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
})();
