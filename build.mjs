import { minify } from 'html-minifier-terser';
import { promises as fs } from 'fs';
import path from 'path';

const SRC = 'panel-html-msm';
const DST = 'dist/panel-html-msm';

async function copyDir(src, dst){
  await fs.mkdir(dst, { recursive:true });
  const entries = await fs.readdir(src, { withFileTypes:true });
  for(const e of entries){
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if(e.isDirectory()){ await copyDir(s,d); }
    else{
      if(e.name.endsWith('.html')){
        const html = await fs.readFile(s,'utf8');
        const out = await minify(html, {
          collapseWhitespace:true, removeComments:true, minifyCSS:true, minifyJS:true
        });
        await fs.writeFile(d, out);
      }else{
        await fs.copyFile(s,d);
      }
    }
  }
}

await fs.rm('dist', { recursive:true, force:true });
await copyDir(SRC, DST);
console.log('OK build →', DST);
