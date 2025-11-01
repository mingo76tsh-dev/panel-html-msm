// build.mjs (versión final) — pega este archivo completo
// build.mjs
import { promises as fs } from "fs";
import path from "path";
import { minify as minifyHtml } from "html-minifier-terser";
import terser from "terser";

const args = process.argv.slice(2);
const isProd = args.includes("--prod");
const isDev  = args.includes("--dev") || !isProd;
const DIST = "dist";

async function rimraf(p){ try{ await fs.rm(p,{recursive:true,force:true}); }catch{} }
async function mkdirp(p){ await fs.mkdir(p,{recursive:true}); }
async function cp(src,dst){ await mkdirp(path.dirname(dst)); await fs.copyFile(src,dst); }

async function build(){
  await rimraf(DIST); await mkdirp(DIST);

  // 1) index.html (minificado)
  let html = await fs.readFile("index.html","utf8");
  if(isProd){
    html = html.replace(/manifest\.dev\.json/g, "manifest.json");
  }
  html = await minifyHtml(html,{
    collapseWhitespace:true, removeComments:true, removeRedundantAttributes:true,
    minifyCSS:true, minifyJS:true
  });
  await fs.writeFile(path.join(DIST,"index.html"), html, "utf8");

  // 2) manifest
  if(isProd) await cp("manifest.json", path.join(DIST,"manifest.json"));
  else       await cp("manifest.dev.json", path.join(DIST,"manifest.dev.json"));

  // 3) service worker -> siempre se llama sw.js en dist
  const swSrc = isProd ? "sw.prod.js" : "sw.js";
  let sw = await fs.readFile(swSrc,"utf8");
  const min = await terser.minify(sw, { compress:true, mangle:true });
  await fs.writeFile(path.join(DIST,"sw.js"), min.code || sw, "utf8");

  // 4) íconos (carpeta completa)
  await copyDir("icons", path.join(DIST,"icons"));

  console.log(`[BUILD] ${isProd ? "PROD" : "DEV"} listo en ${DIST}/`);
}

async function copyDir(srcDir, dstDir){
  await mkdirp(dstDir);
  const entries = await fs.readdir(srcDir, { withFileTypes:true });
  for(const e of entries){
    const s = path.join(srcDir, e.name);
    const d = path.join(dstDir, e.name);
    if(e.isDirectory()) await copyDir(s,d); else await cp(s,d);
  }
}

if (isProd || isDev) build();
else {
  console.log("Uso: node build.mjs --dev  |  node build.mjs --prod");
}

