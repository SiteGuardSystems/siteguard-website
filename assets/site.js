// SiteGuard Systems — menu and enquiry form. No inline script (CSP).
(function () {
  "use strict";
  var toggle = document.querySelector(".menu-toggle");
  if (toggle) toggle.addEventListener("click", function () {
    var nav = document.getElementById("site-nav");
    var open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
  // Referral attribution: a partner's link carries ?ref=CODE. Keep it for this
  // visit only (sessionStorage, no cookie) and send it with an enquiry, so the
  // CRM can credit the partner. Invalid codes are ignored.
  var ref = "";
  try {
    var m = /[?&]ref=([A-Za-z0-9][A-Za-z0-9-]{1,23})(?:&|$)/.exec(window.location.search);
    if (m) sessionStorage.setItem("sg_ref", m[1]);
    ref = sessionStorage.getItem("sg_ref") || "";
  } catch (e) { ref = ""; }
  document.querySelectorAll("[data-ref-field]").forEach(function (i) { i.value = ref; });
  function val(f, n) { return f[n] && typeof f[n].value === "string" ? f[n].value : ""; }
  document.querySelectorAll("[data-lead-form]").forEach(function (f) {
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var status = f.querySelector("[data-status]");
      if (!f.name.value.trim() || !f.email.value.trim() || !f.need.value.trim()) {
        status.className = "form-status err"; status.textContent = "Add your name, email and what you need."; return;
      }
      var data = { source: "systems", name: f.name.value, email: f.email.value, company: f.company.value,
        phone: f.phone.value, need: f.need.value, website: f.website.value,
        enquiry_type: val(f, "enquiry_type") || "enquiry", ref: ref,
        partner_url: val(f, "partner_url"), partner_kind: val(f, "partner_kind") };
      status.className = "form-status"; status.textContent = "Sending…";
      fetch(f.getAttribute("data-endpoint"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
        .then(function (res) {
          if (res.ok) { f.reset(); status.className = "form-status ok"; status.textContent = "Sent. We'll reply within one business day."; }
          else { status.className = "form-status err"; status.textContent = (res.body && res.body.reason) || "Your enquiry didn't send. Try again, or email hello@siteguardsystems.com.au."; }
        })
        .catch(function () { status.className = "form-status err"; status.textContent = "Your enquiry didn't send. Email hello@siteguardsystems.com.au instead."; });
    });
  });
  // Intro video (scripts/lib/video.mjs): the YouTube player loads only when
  // someone presses play. Without JavaScript the poster is a link to YouTube.
  document.querySelectorAll("[data-yt]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      var id = a.getAttribute("data-yt");
      if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return;
      e.preventDefault();
      var f = document.createElement("iframe");
      f.src = "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0&modestbranding=1";
      f.title = a.getAttribute("data-yt-title") || "Video";
      f.width = "1280"; f.height = "720";
      f.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture; fullscreen");
      f.setAttribute("allowfullscreen", "");
      f.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      a.parentNode.replaceChild(f, a);
      f.focus();
    });
  });
  // Planning calendar (scripts/lib/planning.mjs): category and workplace
  // filters. Without JavaScript every entry shows.
  (function () {
    var today = new Date().toISOString().slice(0, 10);
    document.querySelectorAll("[data-plan-filter]").forEach(function (f) { f.addEventListener("submit", function (e) { e.preventDefault(); }); });
    var list = document.querySelector("[data-plan-list]");
    var cats = document.querySelectorAll("[data-plan-cat]");
    function run() {
      var on = {};
      cats.forEach(function (c) { on[c.value] = c.checked; });
      list.querySelectorAll(".plan-month").forEach(function (m) {
        var shown = 0;
        m.querySelectorAll(".plan-event").forEach(function (li) {
          var t = li.querySelector("time");
          var past = t && t.getAttribute("datetime") < today && !li.querySelector(".plan-range");
          var ok = !past && on[li.getAttribute("data-cat")] !== false;
          li.hidden = !ok; if (ok) shown++;
        });
        m.querySelector(".plan-empty").hidden = shown > 0;
      });
    }
    if (list) { cats.forEach(function (c) { c.addEventListener("change", run); }); run(); }
    var applies = document.querySelector("[data-plan-applies]");
    function runApplies() {
      var v = applies.value;
      document.querySelectorAll(".plan-group").forEach(function (g) {
        var shown = 0;
        g.querySelectorAll("tbody tr").forEach(function (tr) {
          var a = tr.getAttribute("data-applies");
          var ok = !v || a === v || a === "All workplaces";
          tr.hidden = !ok; if (ok) shown++;
        });
        g.hidden = shown === 0;
      });
    }
    if (applies) { applies.addEventListener("change", runApplies); runApplies(); }
  })();
  // SiteGuard Education: "Copy link" buttons (scripts/lib/education.mjs).
  document.querySelectorAll("[data-copy]").forEach(function (b) {
    b.addEventListener("click", function () {
      var url = b.getAttribute("data-copy");
      var done = function () { var t = b.textContent; b.textContent = "Link copied"; setTimeout(function () { b.textContent = t; }, 2000); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { window.prompt("Copy this link:", url); });
      else window.prompt("Copy this link:", url);
    });
  });
})();
