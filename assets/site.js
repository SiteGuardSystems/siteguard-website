// SiteGuard Systems — menu and enquiry form. No inline script (CSP).
(function () {
  "use strict";
  var toggle = document.querySelector(".menu-toggle");
  if (toggle) toggle.addEventListener("click", function () {
    var nav = document.getElementById("site-nav");
    var open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.querySelectorAll("[data-lead-form]").forEach(function (f) {
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var status = f.querySelector("[data-status]");
      if (!f.name.value.trim() || !f.email.value.trim() || !f.need.value.trim()) {
        status.className = "form-status err"; status.textContent = "Add your name, email and what you need."; return;
      }
      var data = { source: "systems", name: f.name.value, email: f.email.value, company: f.company.value,
        phone: f.phone.value, need: f.need.value, website: f.website.value };
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
})();
