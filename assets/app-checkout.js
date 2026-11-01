// SiteGuard App checkout on the Systems site (WP-S10): founding places
// (presale) and app subscriptions (live), through the storefront's checkout
// engine (P2's routes: /api/founding/*, /api/subscribe, /api/app/prices). No
// inline script (CSP). The engine re-prices from its config and refuses
// anything its gates (app_status, P2's dates, the platform launch endpoint)
// don't allow; this file only collects the choice and the terms tick.
(function () {
  "use strict";
  var forms = document.querySelectorAll("[data-app-checkout]");
  function status(f, msg, cls) { var s = f.querySelector("[data-status]"); s.className = "form-status" + (cls ? " " + cls : ""); s.textContent = msg; }
  function getJSON(url) { return window.fetch(url, { headers: { Accept: "application/json" }, credentials: "omit" }).then(function (r) { return r.ok ? r.json() : null; }); }
  forms.forEach(function (f) {
    var engine = f.getAttribute("data-engine");
    var kind = f.getAttribute("data-app-checkout"); // "founding" or "subscribe"
    var btn = f.querySelector('button[type="submit"]');
    var termsVersion = "";
    // The terms version the engine expects, and (founding) the places left.
    getJSON(engine + (kind === "founding" ? "/api/founding/status" : "/api/app/prices")).then(function (j) {
      if (!j || !j.notice) { status(f, "Checkout can't load right now. Try again shortly.", "err"); btn.disabled = true; return; }
      termsVersion = j.notice.terms_version;
      var places = f.querySelector("[data-places]");
      if (kind === "founding" && places && typeof j.places_remaining === "number") {
        places.textContent = j.places_remaining === 0 ? "All founding places are taken." : j.places_remaining + " of " + j.places_total + " founding places left.";
        if (j.places_remaining === 0 || j.open === false) btn.disabled = true;
      }
      if (kind === "subscribe" && j.app_subscriptions_open === false) { status(f, "Subscriptions aren't open yet.", "err"); btn.disabled = true; }
    }).catch(function () { status(f, "Checkout can't load right now. Try again shortly.", "err"); });
    // Trade packages need a trade; AUDIT seats take a quantity.
    var product = f.productId, trade = f.querySelector("[data-trade-field]"), seats = f.querySelector("[data-seats-field]");
    function sync() {
      var v = product.value;
      if (trade) trade.hidden = v.indexOf("app:trade:") !== 0;
      if (seats) seats.hidden = v !== "app:audit:seat";
    }
    product.addEventListener("change", sync); sync();
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!f.accept.checked) { status(f, "Tick the box to accept the terms.", "err"); f.accept.focus(); return; }
      var v = product.value;
      if (v.indexOf("app:trade:") === 0 && !f.trade.value) { status(f, "Choose your trade.", "err"); f.trade.focus(); return; }
      var body = { productId: v, acceptedTerms: true, termsVersion: termsVersion, returnOrigin: window.location.origin, source_site: "systems" };
      if (v.indexOf("app:trade:") === 0) body.trade = f.trade.value;
      if (v === "app:audit:seat") body.quantity = Number(f.quantity.value) || 1;
      if (kind === "subscribe" && f.cadence) body.cadence = f.cadence.value;
      if (kind === "founding" && f.email && f.email.value) body.email = f.email.value;
      status(f, "Opening secure checkout…"); btn.disabled = true;
      window.fetch(engine + (kind === "founding" ? "/api/founding/checkout" : "/api/subscribe"), {
        method: "POST", mode: "cors", credentials: "omit", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
        .then(function (res) {
          if (res.ok && res.body.url) { window.location.href = res.body.url; return; }
          status(f, (res.body && res.body.reason) || "Checkout couldn't start. Try again in a moment.", "err"); btn.disabled = false;
        })
        .catch(function () { status(f, "Checkout couldn't start. Check your connection and try again.", "err"); btn.disabled = false; });
    });
  });
  // Founding cancelled page: give the place back at once (otherwise it is
  // released when the Stripe session expires).
  var cancel = document.querySelector("[data-founding-cancel]");
  if (cancel) {
    var m = /[?&]session_id=(cs_(?:test|live)_[A-Za-z0-9]+)/.exec(window.location.search);
    if (m) window.fetch(cancel.getAttribute("data-engine") + "/api/founding/checkout/cancel", { method: "POST", mode: "cors", credentials: "omit",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: m[1] }) }).catch(function () {});
  }
})();
