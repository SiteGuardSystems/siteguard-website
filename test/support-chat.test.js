// Help chat (P11): the widget is on every page, its back end stays off this site, and the CSP
// opens only to the configured API.
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { wordingHits } from "../build.mjs";
import { loadSupportChat, supportChatConnect, supportChatWidget } from "../scripts/lib/support-chat.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const MODE = JSON.parse(await readFile(path.join(ROOT, "data/site-mode.json"), "utf8"));
const EMAIL = "hello@siteguardsystems.com.au";

test("default build: the widget offers the support email, and the CSP is unchanged", async () => {
  const home = await readFile(path.join(DIST, "index.html"), "utf8");
  assert.match(home, /data-support-chat/);
  assert.ok(!/data-endpoint="https:\/\/[^"]*\/api\/support/.test(home));
  assert.match(home, /<script src="\/assets\/support-chat\.js" defer><\/script>/);
  assert.match(home, /mailto:hello@siteguardsystems\.com\.au/);
  const headers = await readFile(path.join(DIST, "_headers"), "utf8");
  const connect = /connect-src ([^;]+);/.exec(headers)[1].trim().split(/\s+/);
  assert.deepEqual(connect, ["'self'", "https://www.siteguardforms.com.au"]);
});

test("every page carries the widget", async () => {
  for (const f of ["index.html", "app/index.html", "audit/index.html", "contact/index.html", "education/index.html"])
    assert.match(await readFile(path.join(DIST, f), "utf8"), /data-support-chat/, f);
});

test("configured: the endpoint is the app API, and connect-src opens to that origin only", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "chat-"));
  await mkdir(path.join(dir, "data"));
  await writeFile(path.join(dir, "data/support-chat.json"), JSON.stringify({ api_base: "https://api.example.com.au/" }));
  const chat = await loadSupportChat(dir, {});
  assert.deepEqual(chat, { base: "https://api.example.com.au", endpoint: "https://api.example.com.au/api/support/public" });
  assert.deepEqual(supportChatConnect(chat), ["https://api.example.com.au"]);
  const html = supportChatWidget(chat, EMAIL);
  assert.match(html, /data-endpoint="https:\/\/api\.example\.com\.au\/api\/support\/public"/);
  assert.match(html, /AI assistant/);
  assert.match(html, /privacy policy/);
  // The visible wording passes the site's banned and gated word check.
  assert.deepEqual(wordingHits(`<p>${html}</p>`, MODE), []);
  // An env override wins; a non-https base is refused.
  assert.equal((await loadSupportChat(dir, { SUPPORT_CHAT_API_BASE: "https://other.example" })).base, "https://other.example");
  await assert.rejects(loadSupportChat(dir, { SUPPORT_CHAT_API_BASE: "http://insecure.example" }));
});

test("the script builds text only, and holds no key or AI provider call", async () => {
  const js = await readFile(path.join(ROOT, "assets/support-chat.js"), "utf8");
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(js));
  assert.ok(!/anthropic|api\.anthropic|x-api-key|sk-ant/i.test(js));
  assert.ok(!/credentials:\s*["']include/.test(js));
});
