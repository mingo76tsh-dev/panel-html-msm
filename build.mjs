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

function stamp() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    z(d.getMonth() + 1) +
    z(d.getDate()) +
    z(d.getHours()) +
    z(d.getMinutes())
  );
}

async function buildHTML() {
  const src = await readFile(join(SRC, "index.html"), "utf8");
  const html = await minifyHTML(src, {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeEmptyAttributes: true,
    removeOptionalTags: false,
    sortAttributes: true,
    sortClassName: true,
    minifyCSS: true,
    minifyJS: true,
    keepClosingSlash: true,
    // Mantener comillas para compat de atributos ARIA
    quoteCharacter: '"'
  });
  await writeFile(join(OUT, "index.html"), html);
  console.log("✓ index.html minificado");
}

async function build404() {
  // Si tenés 404.html, lo minificamos; si no, generamos uno estándar para Project Pages
  let html;
  try {
    const raw = await readFile(join(SRC, "404.html"), "utf8");
    html = await minifyHTML(raw, {
      collapseWhitespace: true,
      removeComments: true,
      minifyCSS: true,
      minifyJS: true
    });
  } catch {
    html =
      '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/panel-html-msm/"><title>HSM • Redireccionando…</title>';
  }
  await writeFile(join(OUT, "404.html"), html);
  console.log("✓ 404.html listo");
}

async function buildSW() {
  const src = await readFile(join(SRC, "sw.js"), "utf8");
  // Bumpeamos VERSION si existe la constante en el archivo
  const tag = "v1.5.1-" + stamp();
  const stamped = src.replace(
    /const\s+VERSION\s*=\s*['"`]([^'"`]+)['"`]\s*;/,
    `const VERSION = '${tag}';`
  );
  const min = await terser.minify(stamped, {
    compress: { passes: 2, drop_console: false },
    mangle: true
  });
  if (min.error) throw min.error;
  await writeFile(join(OUT, "sw.js"), min.code);
  console.log("✓ sw.js minificado y versionado →", tag);
}

async function copyManifest() {
  const raw = await readFile(join(SRC, "manifest.json"), "utf8");
  // Minificado simple (preserva rutas absolutas /panel-html-msm/*)
  const min = JSON.stringify(JSON.parse(raw));
  await writeFile(join(OUT, "manifest.json"), min);
  console.log("✓ manifest.json");
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
