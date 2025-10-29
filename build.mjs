// build.mjs — HSM v7 móvil (DEV/PROD) → dist/
// Uso: node build.mjs [--dev | --prod]
//  - --prod (default): BASE=/panel-html-msm/, manifest.json, sw.prod.js
//  - --dev:           BASE=./,                 manifest.dev.json, sw.js

import { readFile, writeFile, mkdir, cp, stat, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { minify as minifyHTML } from "html-minifier-terser";
import terser from "terser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = __dirname;
const OUT = join(__dirname, "dist");

const MODE = process.argv.includes("--dev") ? "dev" : "prod";
const BASE = MODE === "prod" ? "/panel-html-msm/" : "./";

// ===== helpers =====
async function ensureOut() { if (!existsSync(OUT)) await mkdir(OUT, { recursive: true }); }
const z = (n) => String(n).padStart(2, "0");
function stamp() { const d = new Date(); return `${d.getFullYear()}${z(d.getMonth()+1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}` }
const TAG = `v7.0.0-${stamp()}`;
const bust = (s) => (s && !s.includes("?v=") ? `${s}?v=${TAG}` : s);

function logHead() {
  console.log(`\nHSM v7 build → ${TAG}`);
  console.log(`Mode: ${MODE.toUpperCase()}  BASE=${BASE}\n`);
}

// ===== index.html transform =====
async function buildHTML() {
  const src = await readFile(join(SRC, "index.html"), "utf8");
  let html = src;

  if (MODE === "prod") {
    // manifest.dev.json -> /panel-html-msm/manifest.json?v=TAG
    html = html.replace(/(<link\s+rel="manifest"\s+href=")[^"]+(")/i,
      (_m, a, b) => a + bust("/panel-html-msm/manifest.json") + b);

    // favicons/apple-touch absolutas bajo BASE con bust
    html = html
      .replace(/<link\s+rel="icon"\s+href="\.?\/icons\/favicon-32\.png"[^>]*>/i,
        () => `<link rel="icon" href="${bust(BASE + "icons/favicon-32.png")}" type="image/png" sizes="32x32">`)
      .replace(/<link\s+rel="icon"\s+href="\.?\/icons\/favicon-16\.png"[^>]*>/i,
        () => `<link rel="icon" href="${bust(BASE + "icons/favicon-16.png")}" type="image/png" sizes="16x16">`)
      .replace(/<link\s+rel="apple-touch-icon"\s+href="\.?\/icons\/apple-touch-icon\.png"[^>]*>/i,
        () => `<link rel="apple-touch-icon" href="${bust(BASE + "icons/apple-touch-icon.png")}" sizes="180x180">`);

    // logo cabecera si está relativo
    html = html.replace(/(<img[^>]+id="logo"[^>]+src=")(\.?\/icons\/icon-512\.png)(")/i,
      (_m, a, _src, b) => a + bust(BASE + "icons/icon-512.png") + b);

    // registro de SW con scope BASE
    html = html.replace(
      /navigator\.serviceWorker\.register\([^)]*\)/i,
      `navigator.serviceWorker.register('${BASE}sw.js', { scope: '${BASE}' })`
    );
  } else {
    // DEV: forzar manifest.dev.json relativo + iconos relativos (opcional bust para evitar cache duro)
    html = html
      .replace(/(<link\s+rel="manifest"\s+href=")[^"]+(")/i,
        (_m, a, b) => a + "./manifest.dev.json" + b)
      .replace(/<link\s+rel="icon"\s+href="[^"]*favicon-32\.png"[^>]*>/i,
        () => `<link rel="icon" href="${bust("./icons/favicon-32.png")}" type="image/png" sizes="32x32">`)
      .replace(/<link\s+rel="icon"\s+href="[^"]*favicon-16\.png"[^>]*>/i,
        () => `<link rel="icon" href="${bust("./icons/favicon-16.png")}" type="image/png" sizes="16x16">`)
      .replace(/<link\s+rel="apple-touch-icon"\s+href="[^"]*apple-touch-icon\.png"[^>]*>/i,
        () => `<link rel="apple-touch-icon" href="${bust("./icons/apple-touch-icon.png")}" sizes="180x180">`)
      .replace(/(<img[^>]+id="logo"[^>]+src=")[^"]+(")/i,
        (_m, a, _src, b) => a + bust("./icons/icon-512.png") + b)
      .replace(/navigator\.serviceWorker\.register\([^)]*\)/i,
        `navigator.serviceWorker.register('./sw.js', { scope: './' })`);
  }

  html = await minifyHTML(html, {
    collapseWhitespace: true, removeComments: true,
    removeRedundantAttributes: true, removeEmptyAttributes: true,
    sortAttributes: true, sortClassName: true,
    minifyCSS: true, minifyJS: true, keepClosingSlash: true, quoteCharacter: '"',
  });

  await writeFile(join(OUT, "index.html"), html);
  console.log("✓ index.html");
}

// ===== 404.html =====
async function build404() {
  let html;
  try {
    const raw = await readFile(join(SRC, "404.html"), "utf8");
    html = await minifyHTML(raw, { collapseWhitespace: true, removeComments: true, minifyCSS: true, minifyJS: true });
  } catch {
    const dest = MODE === "prod" ? "/panel-html-msm/" : "./";
    html = `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${dest}"><title>HSM • Redireccionando…</title>`;
  }
  await writeFile(join(OUT, "404.html"), html);
  console.log("✓ 404.html");
}

// ===== SW =====
async function buildSW() {
  const file = MODE === "prod" ? "sw.prod.js" : "sw.js";
  const src = await readFile(join(SRC, file), "utf8");
  // estampar versión de cache
  const stamped = src.replace(/const\s+CACHE_VER\s*=\s*['"`][^'"`]+['"`]\s*;/,
                              `const CACHE_VER = 'hsmv7-${MODE}-${TAG}';`);
  const min = await terser.minify(stamped, { compress: { passes: 2, drop_console: false }, mangle: true, ecma: 2020 });
  if (min.error) throw min.error;
  await writeFile(join(OUT, "sw.js"), min.code);
  console.log("✓ sw.js");
}

// ===== Manifests =====
async function handleManifest() {
  if (MODE === "prod") {
    const raw = await readFile(join(SRC, "manifest.json"), "utf8");
    const j = JSON.parse(raw);
    const bump = (s) => bust(s);
    if (Array.isArray(j.icons)) j.icons = j.icons.map((it) => ({ ...it, src: bump(it.src) }));
    if (Array.isArray(j.screenshots)) j.screenshots = j.screenshots.map((it) => ({ ...it, src: bump(it.src) }));
    if (typeof j.start_url === "string") j.start_url = bump(j.start_url);
    await writeFile(join(OUT, "manifest.json"), JSON.stringify(j));
  } else {
    // DEV: copiar tal cual manifest.dev.json (y dejar el <link> apuntando a ese)
    const raw = await readFile(join(SRC, "manifest.dev.json"), "utf8");
    await writeFile(join(OUT, "manifest.dev.json"), raw);
  }
  console.log(`✓ manifest (${MODE})`);
}

// ===== icons/ =====
async function copyIcons() {
  const srcIcons = join(SRC, "icons");
  if (existsSync(srcIcons)) { await cp(srcIcons, join(OUT, "icons"), { recursive: true }); console.log("✓ icons/"); }
  else { console.log("⚠ icons/ no existe — se omite"); }
}

// ===== reporte =====
async function report() {
  const sizes = [];
  async function walk(dir) {
    const items = await readdir(dir, { withFileTypes: true });
    for (const it of items) {
      const p = join(dir, it.name);
      if (it.isDirectory()) await walk(p);
      else { const st = await stat(p); sizes.push([p.replace(OUT + "/", ""), st.size]); }
    }
  }
  await walk(OUT);
  sizes.sort((a, b) => b[1] - a[1]);
  const fmt = (n) => (n < 1024 ? n + " B" : (n / 1024).toFixed(1) + " KiB");
  console.log("\n— Build report —");
  for (const [f, s] of sizes.slice(0, 15)) console.log(fmt(s).padStart(8), " ", f);
  const total = sizes.reduce((a, b) => a + b[1], 0);
  console.log("Total:", fmt(total), "en", sizes.length, "archivos");
}

// ===== run =====
async function run() {
  logHead();
  await ensureOut();
  await Promise.all([buildHTML(), build404(), buildSW(), handleManifest(), copyIcons()]);
  await report();
  console.log("\nBuild OK → dist/");
}

run().catch((e) => { console.error(e); process.exit(1); });

