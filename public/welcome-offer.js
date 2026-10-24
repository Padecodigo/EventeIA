/* EventeIA — oferta de boas-vindas (vanilla, sem dependências).
 * O prazo vem do servidor (tempo restante calculado com o relógio do banco) e avança com
 * performance.now(): mudar o relógio do aparelho não estende nada. Nada é guardado no client. */
(function () {
  "use strict";
  var banner = document.getElementById("ev-welcome-banner");
  var modal = document.getElementById("ev-welcome-modal");
  var planos = document.getElementById("ev-welcome-planos");
  if (!banner && !planos) return;

  var params = new URLSearchParams(window.location.search);
  var body = {};
  ["convite", "utm_source", "utm_campaign", "ref"].forEach(function (k) {
    var v = params.get(k);
    if (v) body[k] = v.slice(0, 120);
  });

  function pad(n) { return String(n).padStart(2, "0"); }
  function fmt(ms) {
    var t = Math.max(0, Math.floor(ms / 1000));
    return pad(Math.floor(t / 3600)) + ":" + pad(Math.floor((t % 3600) / 60)) + ":" + pad(t % 60);
  }
  function hideAll() {
    if (banner) banner.hidden = true;
    if (planos) planos.hidden = true;
    if (modal && modal.open) modal.close();
  }

  fetch("/api/boas-vindas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (o) {
      if (!o || o.status !== "active" || !(o.remainingMs > 0)) return;
      var clocks = document.querySelectorAll("[data-welcome-countdown]");
      var start = performance.now();
      function tick() {
        var left = Math.max(0, o.remainingMs - (performance.now() - start));
        clocks.forEach(function (c) {
          c.textContent = fmt(left);
          c.setAttribute("datetime", "PT" + Math.floor(left / 1000) + "S");
        });
        if (left === 0) { clearInterval(id); hideAll(); }
      }
      var id = setInterval(tick, 1000);
      tick();

      // Prova social: só dado real (ofertas pagas nos últimos 30 dias); zero => oculto.
      if (o.recentRedemptions > 0) {
        var text = o.recentRedemptions === 1
          ? "1 pessoa usou esta oferta nos últimos 30 dias."
          : o.recentRedemptions + " pessoas usaram esta oferta nos últimos 30 dias.";
        document.querySelectorAll("[data-welcome-social]").forEach(function (el) {
          el.textContent = text;
          el.hidden = false;
        });
      }

      if (banner) {
        banner.hidden = false;
        var dismiss = banner.querySelector("[data-welcome-dismiss]");
        if (dismiss) dismiss.addEventListener("click", function () { banner.hidden = true; });
      }
      if (planos) planos.hidden = false;
      if (modal && o.created && typeof modal.showModal === "function") {
        var close = modal.querySelector("[data-welcome-close]");
        if (close) close.addEventListener("click", function () { modal.close(); });
        modal.showModal();
      }
    })
    .catch(function () { /* oferta indisponível: nada aparece */ });
})();
