// build.mjs — HSM v7 móvil
import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { minify as minifyHTML } from "html-minifier-terser";
import terser from "terser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = __dirname;                 // raíz del proyecto
const OUT = join(__dirname, "dist");   // salida

// ===== helpers =====
async function ensureOut() {
  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });
}
const z = (n) => String(n).padStart(2, "0");
function stamp() {
  const d = new Date();
  return (
    d.getFullYear() +
    z(d.getMonth() + 1) +
    z(d.getDate()) +
    z(d.getHours()) +
    z(d.getMinutes())
  );
}
const TAG = "v7.0.0-" + stamp(); // cambia el prefijo si querés

// añade ?v=… si no lo tiene
const bust = (s) => (s && !s.includes("?v=") ? `${s}?v=${TAG}` : s);

// ===== index.html =====
// - minifica
// - añade cache-busting a manifest y favicons/apple-touch (en el HTML)
//   (NO tocamos el <link rel="preload"> para evitar mismatch)
async function buildHTML() {
  const src = await readFile(join(SRC, "index.html"), "utf8");

  let html = src
    // manifest
    .replace(
      /(<link\s+rel="manifest"\s+href=")([^"]+)(")/,
      (_m, a, href, b) => a + bust(href) + b
    )
    // favicons 16/32 y apple-touch
    .replace(
      /(<link\s+rel="icon"\s+href="\/panel-html-msm\/icons\/favicon-32\.png")/g,
      (_m) => `<link rel="icon" href="/panel-html-msm/icons/favicon-32.png?v=${TAG}"`
    )
    .replace(
      /(<link\s+rel="icon"\s+href="\/panel-html-msm\/icons\/favicon-16\.png")/g,
      (_m) => `<link rel="icon" href="/panel-html-msm/icons/favicon-16.png?v=${TAG}"`
    )
    .replace(
      /(<link\s+rel="apple-touch-icon"\s+href="\/panel-html-msm\/icons\/apple-touch-icon\.png")/g,
      (_m) =>
        `<link rel="apple-touch-icon" href="/panel-html-msm/icons/apple-touch-icon.png?v=${TAG}"`
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
  console.log("✓ index.html minificado (+ cache-bust básico)");
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

// ===== sw.js =====
// Cambia automáticamente la constante VERSION y minifica
async function buildSW() {
  const src = await readFile(join(SRC, "sw.js"), "utf8");
  const stamped = src.replace(
    /const\s+VERSION\s*=\s*['"`][^'"`]+['"`]\s*;/,
    `const VERSION = '${TAG}';`
  );
  const min = await terser.minify(stamped, {
    compress: { passes: 2, drop_console: false },
    mangle: true,
  });
  if (min.error) throw min.error;
  await writeFile(join(OUT, "sw.js"), min.code);
  console.log("✓ sw.js minificado y versionado →", TAG);
}

// ===== manifest.json =====
// añade ?v=TAG a icons y screenshots, y a start_url
async function copyManifest() {
  const raw = await readFile(join(SRC, "manifest.json"), "utf8");
  const j = JSON.parse(raw);

  if (Array.isArray(j.icons))
    j.icons = j.icons.map((it) => ({ ...it, src: bust(it.src) }));

  if (Array.isArray(j.screenshots))
    j.screenshots = j.screenshots.map((it) => ({ ...it, src: bust(it.src) }));

  if (typeof j.start_url === "string") {
    j.start_url = bust(j.start_url);
  }

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

// ===== run =====
async function run() {
  console.log("HSM v7 build →", TAG);
  await ensureOut();
  await Promise.all([buildHTML(), build404(), buildSW(), copyManifest(), copyIcons()]);
  console.log("\nBuild OK → dist/");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
