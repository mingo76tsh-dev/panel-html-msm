// build.mjs
import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { minify as minifyHTML } from "html-minifier-terser";
import terser from "terser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = __dirname;
const OUT = join(__dirname, "dist");

async function ensureOut() {
  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });
}
const z = (n) => String(n).padStart(2, "0");
function stamp() {
  const d = new Date();
  return (
    d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + z(d.getHours()) + z(d.getMinutes())
  );
}
const TAG = "v1.5.1-" + stamp(); // ⚠️ se usa en todo el build

function withIconBustInHTML(html) {
  // agrega ?v=TAG a los href de iconos conocidos (sin romper rutas absolutas)
  return html
    .replace(/href="\/panel-html-msm\/icons\/apple-touch-icon\.png"/g,
             `href="/panel-html-msm/icons/apple-touch-icon.png?v=${TAG}"`)
    .replace(/href="\/panel-html-msm\/icons\/favicon\.png"/g,
             `href="/panel-html-msm/icons/favicon.png?v=${TAG}"`)
    .replace(/href="\/panel-html-msm\/icons\/maskable-192\.png"/g,
             `href="/panel-html-msm/icons/maskable-192.png?v=${TAG}"`)
    .replace(/href="\/panel-html-msm\/icons\/maskable-512\.png"/g,
             `href="/panel-html-msm/icons/maskable-512.png?v=${TAG}"`);
}

async function buildHTML() {
  const src = await readFile(join(SRC, "index.html"), "utf8");
  const prebusted = withIconBustInHTML(src);
  const html = await minifyHTML(prebusted, {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeEmptyAttributes: true,
    sortAttributes: true,
    sortClassName: true,
    minifyCSS: true,
    minifyJS: true,
    keepClosingSlash: true,
    quoteCharacter: '"'
  });
  await writeFile(join(OUT, "index.html"), html);
  console.log("✓ index.html minificado (+ cache-bust íconos)");
}

async function build404() {
  let html;
  try {
    const raw = await readFile(join(SRC, "404.html"), "utf8");
    html = await minifyHTML(raw, { collapseWhitespace: true, removeComments: true, minifyCSS: true, minifyJS: true });
  } catch {
    html = '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/panel-html-msm/"><title>HSM • Redireccionando…</title>';
  }
  await writeFile(join(OUT, "404.html"), html);
  console.log("✓ 404.html listo");
}

async function buildSW() {
  const src = await readFile(join(SRC, "sw.js"), "utf8");
  const stamped = src.replace(/const\s+VERSION\s*=\s*['"`][^'"`]+['"`]\s*;/, `const VERSION = '${TAG}';`);
  const min = await terser.minify(stamped, { compress: { passes: 2, drop_console: false }, mangle: true });
  if (min.error) throw min.error;
  await writeFile(join(OUT, "sw.js"), min.code);
  console.log("✓ sw.js minificado y versionado →", TAG);
}

async function copyManifest() {
  const raw = await readFile(join(SRC, "manifest.json"), "utf8");
  const j = JSON.parse(raw);
  // cache-bust en cada icon.src
  if (Array.isArray(j.icons)) {
    j.icons = j.icons.map((it) => ({
      ...it,
      src: it.src?.includes("?v=") ? it.src : `${it.src}?v=${TAG}`
    }));
  }
  // (opcional) actualizamos start_url para bust de PWA shell
  if (typeof j.start_url === "string" && !j.start_url.includes("?v=")) {
    j.start_url = `${j.start_url}${j.start_url.includes("?") ? "&" : "?"}v=${TAG}`;
  }
  await writeFile(join(OUT, "manifest.json"), JSON.stringify(j));
  console.log("✓ manifest.json (+ cache-bust íconos)");
}

async function copyIcons() {
  const srcIcons = join(SRC, "icons");
  if (existsSync(srcIcons)) {
    await cp(srcIcons, join(OUT, "icons"), { recursive: true });
    console.log("✓ icons/");
  }
}

async function run() {
  await ensureOut();
  await Promise.all([buildHTML(), build404(), buildSW(), copyManifest(), copyIcons()]);
  console.log("\nBuild OK → dist/");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
