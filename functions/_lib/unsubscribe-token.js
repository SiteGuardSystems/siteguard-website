// U1 (Remaining build queue Rev01): the unsubscribe token, checked exactly as siteguard-ai's
// siteguard_org/unsubscribe.py makes it:
//   token = base64url(prospect_id) + "." + base64url(HMAC-SHA256(secret, "unsub:" + prospect_id)[:16])
// base64url without "=" padding; secret = SITEGUARD_UNSUBSCRIBE_SECRET, 32+ characters, the
// same value on VM101 (agent.env) and here (a Cloudflare Pages secret). No email address is in
// the token. test/unsubscribe.test.js holds vectors made by the Python side.

const enc = new TextEncoder();

export const MIN_SECRET = 32;

function unb64(s) {
  if (typeof s !== "string" || !/^[A-Za-z0-9_-]*$/.test(s)) return null;
  const pad = s + "=".repeat((4 - (s.length % 4)) % 4);
  try {
    const bin = atob(pad.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

export function secretReady(secret) {
  return typeof secret === "string" && secret.trim().length >= MIN_SECRET;
}

// The prospect id in a valid token, else null. Throws only when the secret isn't set.
export async function readToken(token, secret) {
  if (!secretReady(secret)) throw new Error("SITEGUARD_UNSUBSCRIBE_SECRET is not set (32+ characters)");
  const parts = String(token ?? "").split(".");
  if (parts.length !== 2) return null;
  const pid = unb64(parts[0]);
  const sig = unb64(parts[1]);
  if (!pid || !sig || pid.length === 0 || pid.length > 200) return null;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret.trim()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const msg = new Uint8Array([...enc.encode("unsub:"), ...pid]);
  const want = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg)).slice(0, 16);
  if (!sameBytes(sig, want)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(pid);
  } catch {
    return null;
  }
}
