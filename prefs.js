/* Roteiros células One Flow — preferências de aparência e acessibilidade.
   Carregado no <head>, antes do CSS, para a página já abrir no tema e no tamanho certos.
   As escolhas ficam salvas só neste aparelho (localStorage). */
(function () {
  var KEY = "bib-prefs";
  var root = document.documentElement;
  var prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { prefs = {}; }

  // Cada preferência vira um atributo na <html>, que o CSS usa
  var ATTRS = {
    fonte: function (v) { return v === "grande" || v === "maior" ? v : null; },
    contraste: function (v) { return v ? "alto" : null; },
    espaco: function (v) { return v ? "sim" : null; },
    movimento: function (v) { return v ? "reduzido" : null; },
    foco: function (v) { return v ? "forte" : null; }
  };

  function apply() {
    if (prefs.tema === "claro") root.setAttribute("data-theme", "light");
    else if (prefs.tema === "escuro") root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    for (var k in ATTRS) {
      var v = ATTRS[k](prefs[k]);
      if (v) root.setAttribute("data-" + k, v); else root.removeAttribute("data-" + k);
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) {}
  }

  apply();

  window.BibPrefs = {
    get: function () { var c = {}; for (var k in prefs) c[k] = prefs[k]; return c; },
    set: function (k, v) { prefs[k] = v; save(); apply(); },
    reset: function () { prefs = {}; save(); apply(); }
  };
})();
