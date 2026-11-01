// SiteGuard help chat (P11). No inline script (CSP); builds text nodes only. The assistant runs
// on the SiteGuard app API (data-endpoint); without it, the panel shows the support email.
(function () {
  "use strict";
  var root = document.querySelector("[data-support-chat]");
  if (!root) return;
  var toggle = root.querySelector(".help-chat-toggle");
  var panel = root.querySelector(".help-chat-panel");
  toggle.addEventListener("click", function () {
    var open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) { var q = root.querySelector("#help-chat-q"); if (q) q.focus(); }
  });
  var endpoint = root.getAttribute("data-endpoint");
  if (!endpoint) return;

  var email = root.getAttribute("data-email");
  var log = root.querySelector("[data-chat-log]");
  var form = root.querySelector("[data-chat-form]");
  var contact = root.querySelector("[data-chat-contact]");
  var status = root.querySelector("[data-chat-status]");
  var history = [];
  var conversationId = null;
  var ticket = null;

  function say(text) { status.textContent = text || ""; }
  function fallback() { say("The assistant isn't available right now. Email " + email + " and we'll reply within one business day."); }

  function add(role, text, sources, note) {
    var li = document.createElement("li");
    li.className = "help-chat-" + role;
    var p = document.createElement("p");
    p.textContent = text;
    li.appendChild(p);
    if (sources && sources.length) {
      var s = document.createElement("p");
      s.className = "help-chat-sources";
      s.appendChild(document.createTextNode("AI answer from: "));
      sources.forEach(function (src, i) {
        if (i) s.appendChild(document.createTextNode("; "));
        // Only https links from our own sites; anything else is shown as text.
        if (src.url && /^https:\/\/(www\.)?siteguard(systems|forms)\.com\.au\//.test(src.url)) {
          var a = document.createElement("a");
          a.href = src.url;
          a.textContent = src.title;
          s.appendChild(a);
        } else s.appendChild(document.createTextNode(src.title));
      });
      li.appendChild(s);
    }
    if (note) { var n = document.createElement("p"); n.className = "help-chat-sources"; n.textContent = note; li.appendChild(n); }
    log.appendChild(li);
    li.scrollIntoView({ block: "nearest" });
  }

  function post(path, body) {
    return fetch(endpoint + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.status === 204 ? { ok: true, status: 204, body: null } : r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; }, function () { return { ok: r.ok, status: r.status, body: null }; }); });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var input = form.q;
    var q = input.value.trim();
    if (q.length < 2) return;
    add("user", q);
    input.value = "";
    say("Looking that up…");
    var body = { question: q, history: history.slice(-6), page: window.location.pathname };
    if (conversationId) body.conversationId = conversationId;
    post("/chat", body).then(function (res) {
      if (!res.ok || !res.body) { if (res.status === 429) say("That's a lot of questions at once. Wait a few minutes, or email " + email + "."); else fallback(); return; }
      var r = res.body;
      conversationId = r.conversationId;
      history.push({ role: "user", text: q }, { role: "assistant", text: r.reply });
      ticket = r.ticket && r.ticket.contactToken ? r.ticket : null;
      add("assistant", r.reply, r.sources, r.ticket ? "Passed to our team (ref " + r.ticket.ref + ")." : "");
      contact.hidden = !ticket;
      say("");
    }, fallback);
  });

  contact.addEventListener("submit", function (e) {
    e.preventDefault();
    var addr = contact.email.value.trim();
    if (!ticket || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) { say("Add your email address."); return; }
    post("/tickets/" + encodeURIComponent(ticket.ref) + "/contact", { token: ticket.contactToken, email: addr }).then(function (res) {
      if (res.ok) { contact.hidden = true; ticket = null; say("Thanks. We'll reply to " + addr + "."); }
      else fallback();
    }, fallback);
  });
})();
