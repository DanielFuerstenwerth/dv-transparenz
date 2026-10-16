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
