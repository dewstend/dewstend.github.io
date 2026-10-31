// Loose visual spot check of the built site (dist/). Not a pixel diff: for every
// page it records a few computed styles and rough layout widths, and compares
// them with tests/look.json. Also fails on missing assets and console errors.
//
//   pnpm spot-check            compare against tests/look.json
//   pnpm spot-check --update   rewrite tests/look.json after an intended change
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const DIST = "dist";
const SNAPSHOT = "tests/look.json";
const UPDATE = process.argv.includes("--update");

const VIEWS = {
  "desktop-light": { viewport: { width: 1280, height: 800 }, colorScheme: "light" },
  "desktop-dark": { viewport: { width: 1280, height: 800 }, colorScheme: "dark" },
  "mobile-light": { viewport: { width: 390, height: 844 }, colorScheme: "light" },
};
const ELEMENTS = ["body", "header", "main", "footer", "h1", "main a", "main p"];
const STYLES = ["fontFamily", "fontSize", "fontWeight", "color", "backgroundColor"];
const BOXES = ["header", "main", "footer"]; // widths only; heights move with content
const SIZE_SLACK = 1; // px, for font sizes
const WIDTH_SLACK = 0.1; // 10%, for layout widths

const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".json": "application/json" };

function serve() {
  const server = createServer(async (req, res) => {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    for (const p of [path, path + ".html", path + "/index.html"]) {
      try {
        const body = await readFile(join(DIST, p));
        res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream" });
        return res.end(body);
      } catch {}
    }
    res.writeHead(404).end();
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

async function pages(dir = DIST, base = "/") {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...(await pages(join(dir, e.name), base + e.name + "/")));
    else if (e.name === "index.html") out.push(base);
    else if (e.name.endsWith(".html")) out.push(base + e.name);
  }
  return out.sort();
}

async function look(browser, origin, url, view, problems) {
  const page = await browser.newPage(VIEWS[view]);
  page.on("console", (m) => m.type() === "error" && problems.push(`${url} [${view}] console: ${m.text()}`));
  page.on("pageerror", (e) => problems.push(`${url} [${view}] script error: ${e.message}`));
  page.on("response", (r) => {
    if (r.url().startsWith(origin) && r.status() >= 400 && r.url() !== origin + url)
      problems.push(`${url} [${view}] ${r.status()} ${r.url().slice(origin.length)}`);
  });
  await page.goto(origin + url, { waitUntil: "load" });
  const result = await page.evaluate(({ ELEMENTS, STYLES, BOXES }) => {
    const out = {};
    for (const sel of ELEMENTS) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const cs = getComputedStyle(el);
      out[sel] = Object.fromEntries(STYLES.map((s) => [s, cs[s]]));
      if (BOXES.includes(sel)) out[sel].width = Math.round(el.getBoundingClientRect().width);
    }
    return out;
  }, { ELEMENTS, STYLES, BOXES });
  await page.close();
  return result;
}

function compare(where, want, got, problems) {
  for (const [sel, props] of Object.entries(want)) {
    if (!got[sel]) { problems.push(`${where}: '${sel}' is gone`); continue; }
    for (const [prop, w] of Object.entries(props)) {
      const g = got[sel][prop];
      const close = prop === "width" ? Math.abs(g - w) <= w * WIDTH_SLACK
        : prop === "fontSize" ? Math.abs(parseFloat(g) - parseFloat(w)) <= SIZE_SLACK
        : g === w;
      if (!close) problems.push(`${where} ${sel} ${prop}: was ${w}, now ${g}`);
    }
  }
}

const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const problems = [];
const current = {};
try {
  for (const url of await pages()) {
    current[url] = {};
    for (const view of Object.keys(VIEWS)) current[url][view] = await look(browser, origin, url, view, problems);
  }
} finally {
  await browser.close();
  server.close();
}

if (UPDATE) {
  await writeFile(SNAPSHOT, JSON.stringify(current, null, 2) + "\n");
  console.log(`wrote ${SNAPSHOT} (${Object.keys(current).length} pages)`);
} else {
  const saved = JSON.parse(await readFile(SNAPSHOT, "utf8"));
  for (const [url, views] of Object.entries(saved)) {
    if (!current[url]) { problems.push(`${url}: page is gone`); continue; }
    for (const [view, want] of Object.entries(views)) compare(`${url} [${view}]`, want, current[url][view], problems);
  }
  for (const url of Object.keys(current)) if (!saved[url]) console.log(`note: new page ${url} (run --update to include it)`);
}
if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} difference(s). If the change is intended, run: pnpm spot-check --update`);
  process.exit(1);
}
console.log(`spot check ok: ${Object.keys(current).length} pages x ${Object.keys(VIEWS).length} views`);
