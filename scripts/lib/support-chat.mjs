// Help chat (P11, Dan 1 Nov 2026): the SiteGuard support assistant on every page.
//
// The assistant's back end is NOT in this public static site: it runs on the SiteGuard app API
// (siteguard-audit, POST /api/support/public/chat), which holds the AI key, answers only from
// SiteGuard's published help content, and passes anything else to the support team. This site
// carries only the widget and its config (data/support-chat.json).
//
// Until the API base is set (api_base, or SUPPORT_CHAT_API_BASE at build time), the widget shows
// the support email instead of a chat, and the Content-Security-Policy is unchanged. Once it is
// set, connect-src opens to that one origin and nothing else.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { esc } from "./md.mjs";

const BASE_RE = /^https:\/\/[a-z0-9.-]+(:\d+)?$/;

/** The chat config: the API base (or empty) and the reply email. Throws on a bad base. */
export async function loadSupportChat(root, env = process.env) {
  const cfg = JSON.parse(await readFile(path.join(root, "data/support-chat.json"), "utf8"));
  const base = String(env.SUPPORT_CHAT_API_BASE ?? cfg.api_base ?? "").trim().replace(/\/+$/, "");
  if (base && !BASE_RE.test(base)) throw new Error(`support chat: api_base must be an https origin, got ${base}`);
  return { base, endpoint: base ? `${base}/api/support/public` : "" };
}

/** connect-src additions for the chat: its API origin, or nothing. */
export const supportChatConnect = (chat) => (chat.base ? [new URL(chat.base).origin] : []);

/**
 * The widget's markup. The chat itself is built by /assets/support-chat.js; without JavaScript,
 * or before the API is set, the panel offers the support email.
 */
export function supportChatWidget(chat, email) {
  const live = Boolean(chat.endpoint);
  return `<aside class="help-chat" data-support-chat${live ? ` data-endpoint="${esc(chat.endpoint)}"` : ""} data-email="${esc(email)}" aria-label="Help">
  <button class="help-chat-toggle" type="button" aria-expanded="false" aria-controls="help-chat-panel">Questions?</button>
  <div class="help-chat-panel" id="help-chat-panel" hidden>
    <p class="help-chat-title">Ask SiteGuard</p>
    ${live
      ? `<p class="help-chat-note">Answers come from an AI assistant using our published help pages and questions, and show where they came from. It can't advise on your own site or legal obligations; it passes those, and anything it can't answer, to our team. We keep questions, without contact details, to improve answers: see our <a href="/legal/privacy/">privacy policy</a>.</p>
    <ol class="help-chat-log" data-chat-log aria-live="polite"></ol>
    <form class="help-chat-form" data-chat-form novalidate><label class="sr-only" for="help-chat-q">Your question</label><input id="help-chat-q" name="q" maxlength="1000" autocomplete="off" placeholder="Ask a question"><button class="btn" type="submit">Ask</button></form>
    <form class="help-chat-form" data-chat-contact hidden novalidate><label for="help-chat-email">Your email, for a reply</label><input id="help-chat-email" name="email" type="email" maxlength="200" autocomplete="email"><button class="btn" type="submit">Send</button></form>
    <p class="help-chat-status" data-chat-status role="status"></p>`
      : ""}
    <p class="help-chat-fallback">Email <a href="mailto:${esc(email)}">${esc(email)}</a> and we'll reply within one business day.</p>
  </div>
</aside>`;
}
