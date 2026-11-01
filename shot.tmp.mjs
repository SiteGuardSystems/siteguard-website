import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
const [DIST, out, w, ...urls] = process.argv.slice(2);
const server = createServer(async (req, res) => { let p = decodeURIComponent(req.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
  try { const b = await readFile(path.join(DIST, p)); const t = {".css":"text/css",".js":"text/javascript",".png":"image/png",".woff2":"font/woff2",".jpg":"image/jpeg",".svg":"image/svg+xml"}[path.extname(p)] ?? "text/html"; res.writeHead(200, {"Content-Type": t}); res.end(b);} catch { res.writeHead(404); res.end(); } });
await new Promise((r) => server.listen(0, r));
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: +w, height: 900 } });
let i = 0;
for (const u of urls) { await pg.goto(`http://127.0.0.1:${server.address().port}${u}`); await pg.screenshot({ path: `${out}-${i++}.png`, fullPage: true }); }
await b.close(); server.close();
