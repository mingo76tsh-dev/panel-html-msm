import { minify as minifyHTML } from 'html-minifier-terser';
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';

const SRC = '.';
const OUT = 'dist';

async function ensureDir(p){ await fs.mkdir(p, { recursive: true }); }
async function copyFile(src, dst){
  await ensureDir(path.dirname(dst));
  await fs.copyFile(src, dst);
}

/* 1) Limpia dist */
await fs.rm(OUT, { recursive: true, force: true });
await ensureDir(OUT);

/* 2) Minifica/optimiza JS suelto (ej: sw.js) */
await build({
  entryPoints: ['sw.js'],
  outdir: OUT,
  minify: true,
  sourcemap: false,
  format: 'esm',
  target: 'es2020'
}).catch(() => process.exit(1));

/* 3) Minifica HTML (incluye CSS/JS inline) */
const html = await fs.readFile(path.join(SRC, 'index.html'), 'utf8');
const htmlMin = await minifyHTML(html, {
  collapseWhitespace: true,
  removeComments: true,
  minifyCSS: true,
  minifyJS: true,
  removeRedundantAttributes: true,
  keepClosingSlash: true
});
await fs.writeFile(path.join(OUT, 'index.html'), htmlMin);

/* 4) Copia estáticos tal cual */
for (const file of ['manifest.json']) {
  try { await copyFile(file, path.join(OUT, file)); } catch {}
}
const ICONS_DIR = 'icons';
try {
  const items = await fs.readdir(ICONS_DIR);
  for (const it of items) {
    await copyFile(path.join(ICONS_DIR, it), path.join(OUT, ICONS_DIR, it));
  }
} catch {}

/* 5) Nota de build */
await fs.writeFile(path.join(OUT, 'BUILD.txt'), `Build: ${new Date().toISOString()}\n`);
console.log('OK: build listo en /dist');
