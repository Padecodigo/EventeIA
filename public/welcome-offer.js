/* EventeIA — oferta de boas-vindas (vanilla, sem dependências).
 * O prazo vem do servidor (tempo restante calculado com o relógio do banco) e avança com
 * performance.now(): mudar o relógio do aparelho não estende nada. Nada é guardado no client. */
(function () {
  "use strict";
  var banner = document.getElementById("ev-welcome-banner");
  var modal = document.getElementById("ev-welcome-modal");
  var planos = document.getElementById("ev-welcome-planos");
  var luckyBanner = document.getElementById("ev-lucky-banner");
  var luckyModal = document.getElementById("ev-lucky-modal");
  if (!banner && !planos && !luckyBanner) return;

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
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (o) {
      if (!o || o.status !== "active" || !(o.remainingMs > 0)) {
        // Boas-vindas expirada/usada: oferece o cupom sorteado (nunca as duas juntas).
        if (o && (o.status === "expired" || o.status === "redeemed")) lucky();
        return;
      }
      var clocks = document.querySelectorAll("[data-welcome-countdown]");
      var start = performance.now();
      function tick() {
        var left = Math.max(0, o.remainingMs - (performance.now() - start));
        clocks.forEach(function (c) {
          c.textContent = fmt(left);
          c.setAttribute("datetime", "PT" + Math.floor(left / 1000) + "S");
        });
        if (left === 0) {
          clearInterval(id);
          hideAll();
        }
      }
      var id = setInterval(tick, 1000);
      tick();

      // Prova social: só dado real (ofertas pagas nos últimos 30 dias); zero => oculto.
      if (o.recentRedemptions > 0) {
        var text =
          o.recentRedemptions === 1
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
        if (dismiss)
          dismiss.addEventListener("click", function () {
            banner.hidden = true;
          });
      }
      if (planos) planos.hidden = false;
      if (modal && o.created && typeof modal.showModal === "function") {
        var close = modal.querySelector("[data-welcome-close]");
        if (close)
          close.addEventListener("click", function () {
            modal.close();
          });
        modal.showModal();
      }
    })
    .catch(function () {
      /* oferta indisponível: nada aparece */
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
        luckyBanner.hidden = true;
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
      luckyBanner.hidden = false;
      var start = performance.now();
      var id = setInterval(function () {
        var left = Math.max(0, c.remainingMs - (performance.now() - start));
        all("[data-lucky-countdown]").forEach(function (e) {
          e.textContent = fmt(left);
        });
        if (left === 0) {
          clearInterval(id);
          luckyBanner.hidden = true;
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
        luckyBanner.hidden = false;
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
