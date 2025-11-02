// build.mjs — estampa versión (cache-busting) y publica
import { readFileSync, writeFileSync } from 'node:fs';

const stamp = new Date().toISOString().replace(/[:.]/g,'-');
const base  = '/panel-html-msm/';

function bust(s){
  return s
    .replace(/sw\.js\?v=[^'"]*/g, `sw.js?v=${stamp}`)
    .replace(/manifest\.json\?v=\d+/g, `manifest.json?v=${stamp}`)
    .replace(/icon-(?:192|512)\.png\?v=\d+/g, m=>{
      const n = m.split('?')[0];
      return `${n}?v=${stamp}`;
    });
}

const path = 'panel-html-msm/index.html';
const html = readFileSync(path,'utf8');
writeFileSync(path, bust(html), 'utf8');

const swp  = 'panel-html-msm/sw.js';
const sw   = readFileSync(swp,'utf8').replace(/CACHE_VER\s*=\s*'[^']*'/, `CACHE_VER='hsmv7-${stamp}'`);
writeFileSync(swp, sw, 'utf8');

console.log('Build OK:', stamp);

