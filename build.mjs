// build.mjs — HSM v7 móvil (PROD for GitHub Pages)
// Genera dist/ listo para deploy bajo /panel-html-msm/

import { readFile, writeFile, mkdir, cp, stat, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { minify as minifyHTML } from "html-minifier-terser";
import terser from "terser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = __dirname;                 // raíz del proyecto
const OUT = join(__dirname, "dist");   // salida
const BASE = "/panel-html-msm/";

// ===== helpers =====
async function ensureOut() {
  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });
}
const z = (n) => String(n).padStart(2, "0");
function stamp() {
  const d = new Date();
  return (
    d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + "-" + z(d.getHours()) + z(d.getMinutes())
  );
}
const TAG = "v7.0.0-" + stamp(); // cambia el prefijo si querés
const bust = (s) => (s && !s.includes("?v=") ? `${s}?v=${TAG}` : s);

// ===== index.html (DEV → PROD) =====
// - Reescribe manifest.dev.json -> /panel-html-msm/manifest.json?v=TAG
// - Añade ?v=TAG a favicons y apple-touch con rutas absolutas bajo BASE
// - Minifica
async function buildHTML() {
  const src = await readFile(join(SRC, "index.html"), "utf8");

  let html = src
    // manifest.dev.json -> manifest.json (absoluto con bust)
    .replace(
      /(<link\s+rel="manifest"\s+href=")[^"]+(")/i,
      (_m, a, b) => a + bust(BASE + "manifest.json") + b
    )
    // favicon 32
    .replace(
      /<link\s+rel="icon"\s+href="\.?\/icons\/favicon-32\.png"([^>]*)>/i,
      () => `<link rel="icon" href="${bust(BASE + "icons/favicon-32.png")}" type="image/png" sizes="32x32">`
    )
    // favicon 16
    .replace(
      /<link\s+rel="icon"\s+href="\.?\/icons\/favicon-16\.png"([^>]*)>/i,
      () => `<link rel="icon" href="${bust(BASE + "icons/favicon-16.png")}" type="image/png" sizes="16x16">`
    )
    // apple-touch
    .replace(
      /<link\s+rel="apple-touch-icon"\s+href="\.?\/icons\/apple-touch-icon\.png"([^>]*)>/i,
      () => `<link rel="apple-touch-icon" href="${bust(BASE + "icons/apple-touch-icon.png")}" sizes="180x180">`
    )
    // Ajuste prudente de logos en <img> de cabecera si usa ruta relativa
    .replace(
      /(<img[^>]+id="logo"[^>]+src=")(\.?\/icons\/icon-512\.png)(")/i,
      (_m, a, _src, b) => a + bust(BASE + "icons/icon-512.png") + b
    )
    // Registro SW: forzamos ruta absoluta prod (scope BASE)
    .replace(
      /navigator\.serviceWorker\.register\(['"`].*?['"`],\s*\{scope\}?\s*\{?[^}]*\}?/i,
      `navigator.serviceWorker.register('${BASE}sw.js', { scope: '${BASE}' }`
    );

  html = await minifyHTML(html, {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeEmptyAttributes: true,
    sortAttributes: true,
    sortClassName: true,
    minifyCSS: true,
    minifyJS: true,
    keepClosingSlash: true,
    quoteCharacter: '"',
  });

  await writeFile(join(OUT, "index.html"), html);
  console.log("✓ index.html → PROD (+ cache-bust y rutas absolutas)");
}

// ===== 404.html =====
async function build404() {
  let html;
  try {
    const raw = await readFile(join(SRC, "404.html"), "utf8");
    html = await minifyHTML(raw, {
      collapseWhitespace: true,
      removeComments: true,
      minifyCSS: true,
      minifyJS: true,
    });
  } catch {
    html =
      '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/panel-html-msm/"><title>HSM • Redireccionando…</title>';
  }
  await writeFile(join(OUT, "404.html"), html);
  console.log("✓ 404.html listo");
}

// ===== sw.prod.js → dist/sw.js =====
// Inyecta VERSION/TAG y minifica. Mantiene tu lógica (nav preload incluido).
async function buildSW() {
  const src = await readFile(join(SRC, "sw.prod.js"), "utf8");
  const stamped = src
    // Cache version con TAG (evita servir código viejo)
    .replace(
      /const\s+CACHE_VER\s*=\s*['"`][^'"`]+['"`]\s*;/,
      `const CACHE_VER = 'hsmv7-${TAG}';`
    );
  const min = await terser.minify(stamped, {
    compress: { passes: 2, drop_console: false },
    mangle: true,
    ecma: 2020
  });
  if (min.error) throw min.error;
  await writeFile(join(OUT, "sw.js"), min.code);
  console.log("✓ sw.js (prod) minificado →", TAG);
}

// ===== manifest.json (PROD) =====
// Añade ?v=TAG a icons, screenshots y start_url
async function copyManifest() {
  const raw = await readFile(join(SRC, "manifest.json"), "utf8");
  const j = JSON.parse(raw);

  const bumpSrc = (s) => bust(s);

  if (Array.isArray(j.icons)) j.icons = j.icons.map((it) => ({ ...it, src: bumpSrc(it.src) }));
  if (Array.isArray(j.screenshots))
    j.screenshots = j.screenshots.map((it) => ({ ...it, src: bumpSrc(it.src) }));
  if (typeof j.start_url === "string") j.start_url = bumpSrc(j.start_url);

  await writeFile(join(OUT, "manifest.json"), JSON.stringify(j));
  console.log("✓ manifest.json (+ cache-bust icons/screenshots/start_url)");
}

// ===== icons/ =====
async function copyIcons() {
  const srcIcons = join(SRC, "icons");
  if (existsSync(srcIcons)) {
    await cp(srcIcons, join(OUT, "icons"), { recursive: true });
    console.log("✓ icons/ copiados");
  } else {
    console.log("⚠ icons/ no existe — se omite");
  }
}

// ===== small report =====
async function report() {
  const sizes = [];
  async function walk(dir) {
    const items = await readdir(dir, { withFileTypes: true });
    for (const it of items) {
      const p = join(dir, it.name);
      if (it.isDirectory()) await walk(p);
      else {
        const st = await stat(p);
        sizes.push([p.replace(OUT + "/", ""), st.size]);
      }
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
  console.log("HSM v7 build →", TAG);
  await ensureOut();
  await Promise.all([buildHTML(), build404(), buildSW(), copyManifest(), copyIcons()]);
  await report();
  console.log("\nBuild OK → dist/");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

