// site-mode-check: the one FORMS beta switch (Dan, 1 Nov 2026, #94).
//
// The storefront's data/site-mode.json beta is the source of truth (it is the
// checkout engine). This site vendors that file and mirrors beta to hide its
// buy buttons and cart, so the two sites can't diverge:
//
//   node scripts/site-mode-check.mjs             offline: the vendored file
//       matches site-mode.lock (sha256 and beta) and data/site-mode.json has
//       no beta of its own
//   node scripts/site-mode-check.mjs --upstream  also fetches the storefront's
//       file at the lock's ref (public repo, no secrets) and fails if beta
//       differs (drift: run --sync, commit, rebuild)
//   node scripts/site-mode-check.mjs --sync      vendors the storefront's file
//       at the lock's ref and rewrites site-mode.lock (npm run sync-site-mode)
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadFormsBeta, FORMS_MODE_LOCK } from "./lib/site-mode.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const rawUrl = (lock) => `https://raw.githubusercontent.com/${lock.repo}/${lock.ref}/${lock.path}`;

async function fetchUpstream(lock) {
  const r = await fetch(rawUrl(lock), { headers: { "Cache-Control": "no-cache" } });
  if (!r.ok) throw new Error(`${rawUrl(lock)}: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  let commit = null;
  try {
    const c = await fetch(`https://api.github.com/repos/${lock.repo}/commits?sha=${encodeURIComponent(lock.ref)}&path=${encodeURIComponent(lock.path)}&per_page=1`, { headers: { Accept: "application/vnd.github+json" } });
    if (c.ok) commit = (await c.json())[0]?.sha ?? null;
  } catch { /* the commit is a note only */ }
  return { buf, beta: JSON.parse(buf.toString("utf8")).beta, commit };
}

async function main() {
  const lockPath = path.join(ROOT, FORMS_MODE_LOCK);
  if (args.has("--sync")) {
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    const up = await fetchUpstream(lock);
    if (typeof up.beta !== "boolean") throw new Error(`${rawUrl(lock)}: beta must be true or false`);
    await writeFile(path.join(ROOT, lock.vendored_at), up.buf);
    const next = { ...lock, commit: up.commit ?? lock.commit, sha256: sha256(up.buf), beta: up.beta };
    await writeFile(lockPath, JSON.stringify(next, null, 1) + "\n");
    console.log(`site-mode-check: vendored ${lock.repo}@${lock.ref} ${lock.path}: beta ${up.beta}, sha256 ${next.sha256}. Commit, then rebuild.`);
    return 0;
  }

  const problems = [];
  const forms = await loadFormsBeta(ROOT);
  problems.push(...forms.problems);
  try {
    const own = JSON.parse(await readFile(path.join(ROOT, "data", "site-mode.json"), "utf8"));
    if ("beta" in own) problems.push("data/site-mode.json sets beta: it must not (the storefront's switch is the only one)");
  } catch (e) { problems.push(`data/site-mode.json: ${e.message}`); }
  const lock = forms.lock;
  console.log(`site-mode-check: FORMS beta ${forms.beta} from ${lock?.repo ?? "?"}@${lock?.ref ?? "?"} (${lock?.commit?.slice(0, 12) ?? "?"}), vendored sha256 ${lock?.sha256 ?? "?"}`);

  if (args.has("--upstream") && lock) {
    try {
      const up = await fetchUpstream(lock);
      const same = sha256(up.buf) === lock.sha256;
      console.log(`  upstream ${rawUrl(lock)}: beta ${up.beta}${up.commit ? `, last change ${up.commit.slice(0, 12)}` : ""}${same ? ", identical" : ", file differs"}`);
      if (up.beta !== forms.beta) problems.push(`DRIFT: the storefront's beta is ${up.beta} but this site mirrors ${forms.beta}. Run npm run sync-site-mode, commit and rebuild, so both sites open together.`);
      else if (!same) console.log("  (only the note or other keys differ; beta agrees. npm run sync-site-mode to refresh.)");
    } catch (e) {
      problems.push(`could not read the storefront's site-mode.json: ${e.message}`);
    }
  }
  for (const p of problems) console.log(`  FAIL ${p}`);
  if (!problems.length) console.log("  ok");
  return problems.length ? 1 : 0;
}

process.exitCode = await main();
