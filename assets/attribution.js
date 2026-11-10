// X2 utm carry-through (Rev09 W10; paired with the Storefront's S6: the same field names, the same
// storage key, the same tests). The landing URL's utm_* and gclid are kept for this visit only
// (sessionStorage, no cookie, no localStorage) and sent with an enquiry or Book a call form, so the
// campaign counts (#45) can attribute an enquiry, not only a landing. The first landing in a visit
// wins. Each value is trimmed; utm values are lower-cased and cut to 60 characters, and anything
// that looks like an email address or a phone number is dropped; a gclid is kept only if it looks
// like one. Nothing else about the visitor. Off unless the page says campaign counts are on
// (<body data-attribution="1">); assets/site.js decides. No inline script (CSP).
(function (root) {
  "use strict";
  var KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid"];
  var STORE = "sg_attribution";

  function clean(k, v) {
    var s = String(v === null || v === undefined ? "" : v).trim();
    if (k === "gclid") return /^[A-Za-z0-9_-]{10,200}$/.test(s) ? s : "";
    s = s.toLowerCase().slice(0, 60);
    if (s.indexOf("@") >= 0 || (s.match(/\d/g) || []).length >= 8) return "";
    return s;
  }

  /** The carried values in an object, cleaned; only keys with a value. */
  function pick(o) {
    var out = {};
    if (!o || typeof o !== "object") return out;
    KEYS.forEach(function (k) {
      var c = clean(k, o[k]);
      if (c) out[k] = c;
    });
    return out;
  }

  /** The values on a landing URL's query string, or null when it carries none. */
  function fromSearch(search) {
    var q = new URLSearchParams(search || "");
    var o = {};
    KEYS.forEach(function (k) { if (q.has(k)) o[k] = q.get(k); });
    o = pick(o);
    return Object.keys(o).length ? o : null;
  }

  /** This visit's values: the ones kept from its first landing, else this URL's (then kept). */
  function capture(search, storage) {
    var kept = null;
    try { kept = JSON.parse(storage.getItem(STORE) || "null"); } catch (e) { kept = null; }
    if (kept && typeof kept === "object" && Object.keys(pick(kept)).length) return pick(kept);
    var now = fromSearch(search);
    if (now) { try { storage.setItem(STORE, JSON.stringify(now)); } catch (e) { /* storage off: this page only */ } }
    return now || {};
  }

  root.SGAttribution = { KEYS: KEYS, STORE: STORE, clean: clean, pick: pick, fromSearch: fromSearch, capture: capture };
})(typeof self !== "undefined" ? self : this);
