/* EventeIA — oferta de boas-vindas (vanilla, sem dependências).
 * O prazo vem do servidor (tempo restante calculado com o relógio do banco) e avança com
 * performance.now(): mudar o relógio do aparelho não estende nada. O client só lembra se a faixa foi minimizada (preferência visual). */
(function () {
  "use strict";
  var banner = document.getElementById("ev-welcome-banner");
  var luckyBanner = document.getElementById("ev-lucky-banner");
  var luckyModal = document.getElementById("ev-lucky-modal");
  var badge = document.getElementById("ev-offer-badge");
  if (!banner && !luckyBanner) return;
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

  function pad(n) {
    return String(n).padStart(2, "0");
  }
  function fmt(ms) {
    var t = Math.max(0, Math.floor(ms / 1000));
    return pad(Math.floor(t / 3600)) + ":" + pad(Math.floor((t % 3600) / 60)) + ":" + pad(t % 60);
  }
  function showWelcomeBanner() {
    // Visitante: texto fixo da oferta real (R$ 40 avulso / 30% pacotes por 48h a partir do
    // 1º acesso logado, controlado no servidor). Sem contagem regressiva para visitantes.
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
    .then(function (o) {
      // Cupom sorteado só quando a boas-vindas já não vale (nunca os dois juntos).
      if (o && (o.status === "expired" || o.status === "redeemed")) {
        lucky();
        return;
      }
      showWelcomeBanner();
    })
    .catch(function () {
      showWelcomeBanner();
    });

  function brl(c) {
    return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  function all(sel) {
    return document.querySelectorAll(sel);
  }

  function lucky() {
    if (!luckyBanner) return;
    var drawBtn = luckyBanner.querySelector("[data-lucky-draw]");
    var dismiss = luckyBanner.querySelector("[data-lucky-dismiss]");
    if (dismiss)
      dismiss.addEventListener("click", function () {
        minimize(luckyBanner);
      });
    var close = luckyModal && luckyModal.querySelector("[data-lucky-close]");
    if (close)
      close.addEventListener("click", function () {
        luckyModal.close();
      });

    function show(c, animate) {
      if (!c || c.status !== "active" || !(c.remainingMs > 0)) {
        luckyBanner.hidden = true;
        return;
      }
      all("[data-lucky-percent]").forEach(function (e) {
        e.textContent = c.percent;
      });
      all("[data-lucky-final]").forEach(function (e) {
        e.textContent = brl(c.finalPriceCents);
      });
      all("[data-lucky-code]").forEach(function (e) {
        e.textContent = c.code || "";
      });
      var teaser = luckyBanner.querySelector("[data-lucky-teaser]");
      if (teaser) teaser.hidden = true;
      if (drawBtn) drawBtn.hidden = true;
      luckyBanner.querySelector("[data-lucky-summary]").hidden = false;
      if (animate) setMin(false);
      reveal(luckyBanner);
      var start = performance.now();
      var id = setInterval(function () {
        var left = Math.max(0, c.remainingMs - (performance.now() - start));
        all("[data-lucky-countdown]").forEach(function (e) {
          e.textContent = fmt(left);
        });
        if (left === 0) {
          clearInterval(id);
          luckyBanner.hidden = true;
          if (badge) badge.hidden = true;
          if (luckyModal && luckyModal.open) luckyModal.close();
        }
      }, 1000);
      all("[data-lucky-countdown]").forEach(function (e) {
        e.textContent = fmt(c.remainingMs);
      });
      if (!animate || !luckyModal || typeof luckyModal.showModal !== "function") return;
      var roll = luckyModal.querySelector("[data-lucky-roll]");
      var result = luckyModal.querySelector("[data-lucky-result]");
      result.hidden = true;
      luckyModal.showModal();
      // Animação puramente visual: o valor final é o que o servidor sorteou e gravou.
      var steps = 0;
      var spin = setInterval(function () {
        roll.textContent = 20 + Math.floor(Math.random() * 21);
        if (++steps >= 18) {
          clearInterval(spin);
          roll.textContent = c.percent;
          result.hidden = false;
        }
      }, 70);
    }

    fetch("/api/cupom-sorte", { credentials: "same-origin" })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (c) {
        if (!c) return;
        if (c.status === "active") {
          show(c, false);
          return;
        }
        if (c.status !== "available" || !drawBtn) return;
        reveal(luckyBanner);
        drawBtn.addEventListener("click", function () {
          drawBtn.disabled = true;
          fetch("/api/cupom-sorte", { method: "POST", credentials: "same-origin" })
            .then(function (r) {
              return r.ok ? r.json() : null;
            })
            .then(function (d) {
              show(d, true);
            })
            .catch(function () {
              drawBtn.disabled = false;
            });
        });
      })
      .catch(function () {
        /* indisponível: nada aparece */
      });
  }
})();
