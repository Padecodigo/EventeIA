/* EventeIA — oferta de boas-vindas (vanilla, sem dependências).
 * O client só lembra se a faixa foi minimizada (preferência visual); a elegibilidade e o prazo
 * vêm do servidor (/api/boas-vindas, relógio do banco). */
(function () {
  "use strict";
  var banner = document.getElementById("ev-welcome-banner");
  var badge = document.getElementById("ev-offer-badge");
  if (!banner) return;
  var MIN_KEY = "ev-offer-minimized";
  function isMin() {
    try {
      return window.localStorage.getItem(MIN_KEY) === "1";
    } catch (e) {
      return false;
    }
  }
  function setMin(v) {
    try {
      if (v) window.localStorage.setItem(MIN_KEY, "1");
      else window.localStorage.removeItem(MIN_KEY);
    } catch (e) {
      /* sem storage: só nesta página */
    }
  }
  // Mostra a faixa (el) ou, se minimizada, só o selo do canto.
  function reveal(el) {
    if (!el) return;
    var min = isMin();
    el.hidden = min;
    if (badge) {
      badge.hidden = !min;
      badge.onclick = function () {
        setMin(false);
        badge.hidden = true;
        el.hidden = false;
      };
    }
  }
  function minimize(el) {
    setMin(true);
    el.hidden = true;
    if (badge) badge.hidden = false;
  }

  var params = new URLSearchParams(window.location.search);
  var body = {};
  ["convite", "utm_source", "utm_campaign", "ref"].forEach(function (k) {
    var v = params.get(k);
    if (v) body[k] = v.slice(0, 120);
  });

  function showWelcomeBanner() {
    if (!banner) return;
    reveal(banner);
    var dismiss = banner.querySelector("[data-welcome-dismiss]");
    if (dismiss)
      dismiss.addEventListener("click", function () {
        minimize(banner);
      });
  }

  fetch("/api/boas-vindas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  })
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function () {
      showWelcomeBanner();
    })
    .catch(function () {
      showWelcomeBanner();
    });
})();
