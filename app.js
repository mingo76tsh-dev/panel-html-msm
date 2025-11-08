/* === app.js — Cliente GitHub Pages (sin preflight, con cola offline) === */
const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyqvAkFP2tf_lT6BXNcMNJ0esY0MajUTsI91wXRItW6RGhJguR4VwdG9wUkLWf1EC7u/exec';
const API_KEY    = 'HSM2025KEY';

const LS={get:(k,d=null)=>{try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(_){return localStorage.getItem(k)||d;}},set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch(_){localStorage.setItem(k,v);}},del:(k)=>localStorage.removeItem(k)};
const $=s=>document.querySelector(s);
const nowDate=()=>new Date().toISOString().slice(0,10);
const nowTime=()=>new Date().toTimeString().slice(0,5);
const dniClean=v=>String(v||'').replace(/\D/g,'').slice(0,9);
const dniOK=v=>/^\d{7,9}$/.test(String(v||'').trim());
function setStatus(t,c){ const st=$('#status'); if(st){ st.textContent=t; st.className='badge '+(c||'mut'); } }
function setMsg(el,t,ok=true){ if(el){ el.style.color=ok?'var(--ok)':'var(--err)'; el.textContent=t; } }
function postForm(url, params){
  const qs=new URLSearchParams(params);
  return fetch(url+(url.includes('?')?'&':'?')+'apiKey='+encodeURIComponent(API_KEY),{method:'POST',mode:'cors',credentials:'omit',cache:'no-cache',body:qs}).then(r=>r.json());
}
const API={
  ping: async()=> (await fetch(WEBAPP_URL)).json(),
  saveIngreso: async(p)=> postForm(WEBAPP_URL,{
    tipo:'ing', DNI:p.DNI, Sexo:p.Sexo,
    FechaIngresoManual:p.FechaIngresoManual, HoraIngresoManual:p.HoraIngresoManual,
    IdeacionIntento:p.IdeacionIntento||'', MetodoLetalidad:p.MetodoLetalidad||'',
    Consumo:p.Consumo||'', TipoSustancia:p.TipoSustancia||'', Frecuencia:p.Frecuencia||'',
    DxProvisorio_CIE10:(p.DxProvisorio_CIE10||p.DxCIE10||'').toUpperCase(),
    Observaciones:p.Observaciones||'', AppVersion:'v7-panel'
  }),
  saveAlta: async(p)=> postForm(WEBAPP_URL,{
    tipo:'alta', DNI:p.DNI, Sexo:p.Sexo||'',
    EstadoEgreso:p.EstadoEgreso||'Alta', FechaAltaManual:p.FechaAltaManual||'', HoraAltaManual:p.HoraAltaManual||'',
    FechaIngresoManual:p.FechaIngresoManual||'', HoraIngresoManual:p.HoraIngresoManual||'',
    Observaciones:p.Observaciones||'', AppVersion:'v7-panel'
  })
};
window.API=API;

async function flushOutbox(key, kind){
  const box=LS.get(key,[]); if(!box.length) return;
  const remain=[]; for(const it of box){
    const now=Date.now(); if(it.retryAt && now<it.retryAt){ remain.push(it); continue; }
    try{ const out=(kind==='ing')? await API.saveIngreso(it.payload) : await API.saveAlta(it.payload);
         if(!(out&&out.ok)) throw new Error(out&&out.message||'ERR'); }
    catch(e){ it.retries=(it.retries||0)+1; it.retryAt=now+Math.min(60000,2000*Math.pow(2,it.retries)); remain.push(it); }
  }
  LS.set(key,remain);
}
setInterval(()=>{ flushOutbox('HSM_OUT_ING','ing'); flushOutbox('HSM_OUT_ALT','alt'); },15000);
addEventListener('online', ()=>setStatus('Online','ok'));
addEventListener('offline',()=>setStatus('Offline','mut'));

function bindIngreso(){
  const btn=$('#submitIng'); if(!btn) return;
  $('#dni')?.addEventListener('input', e=> e.target.value=dniClean(e.target.value));
  btn.addEventListener('click', async(ev)=>{
    ev.preventDefault(); const m=$('#msgIng');
    const p={
      DNI:dniClean($('#dni')?.value), Sexo:$('#sexo')?.value||'',
      FechaIngresoManual:$('#fi')?.value||'', HoraIngresoManual:$('#hi')?.value||'',
      IdeacionIntento:$('#ii')?.value||'', MetodoLetalidad:$('#met')?.value||'',
      Consumo:$('#cons')?.value||'', TipoSustancia:$('#sust')?.value||'',
      DxProvisorio_CIE10:($('#cie')?.value||'').toUpperCase(), Observaciones:$('#obs')?.value||''
    };
    if(!dniOK(p.DNI)){ setMsg(m,'DNI inválido (7–9 dígitos)',false); return; }
    if(!p.Sexo){ setMsg(m,'Seleccioná sexo',false); return; }
    if(!p.FechaIngresoManual){ $('#fi').value=nowDate(); p.FechaIngresoManual=$('#fi').value; }
    if(!p.HoraIngresoManual){  $('#hi').value=nowTime(); p.HoraIngresoManual=$('#hi').value; }
    btn.disabled=true; setMsg(m,'Guardando…',true);
    try{ const out=await API.saveIngreso(p);
         if(out&&out.ok) setMsg(m,'Guardado ✔ (fila '+(out.row||'?')+')',true);
         else throw new Error(out&&out.message||'Error'); }
    catch(e){ const box=LS.get('HSM_OUT_ING',[]); box.push({payload:p,retries:0}); LS.set('HSM_OUT_ING',box);
              setMsg(m,'Sin red. En cola ('+box.length+')',false); }
    finally{ btn.disabled=false; }
  });
}
function bindAlta(){
  const btn=$('#submitAlta'); if(!btn) return;
  $('#dni2')?.addEventListener('input', e=> e.target.value=dniClean(e.target.value));
  btn.addEventListener('click', async(ev)=>{
    ev.preventDefault(); const m=$('#msgAlta');
    const p={
      DNI:dniClean($('#dni2')?.value), Sexo:$('#sexo2')?.value||'',
      FechaAltaManual:$('#fa')?.value||'', HoraAltaManual:$('#ha')?.value||'',
      EstadoEgreso:$('#estado')?.value||'Alta', Observaciones:$('#obs2')?.value||''
    };
    if(!dniOK(p.DNI)){ setMsg(m,'DNI inválido',false); return; }
    if(!p.FechaAltaManual){ $('#fa').value=nowDate(); p.FechaAltaManual=$('#fa').value; }
    if(!p.HoraAltaManual){  $('#ha').value=nowTime(); p.HoraAltaManual=$('#ha').value; }
    btn.disabled=true; setMsg(m,'Guardando alta…',true);
    try{ const out=await API.saveAlta(p);
         if(out&&out.ok) setMsg(m,'Alta guardada ✔ (fila '+(out.row||'?')+')',true);
         else throw new Error(out&&out.message||'Error'); }
    catch(e){ const box=LS.get('HSM_OUT_ALT',[]); box.push({payload:p,retries:0}); LS.set('HSM_OUT_ALT',box);
              setMsg(m,'Sin red. En cola ('+box.length+')',false); }
    finally{ btn.disabled=false; }
  });
}
(async function init(){
  try{ const j=await API.ping(); setStatus('Online','ok');
       if(j&&j.version) { const s=$('#status'); if(s) s.title='Core '+j.version; } }
  catch(_){ setStatus('Offline','mut'); }
  if($('#fi') && !$('#fi').value) $('#fi').value=nowDate();
  if($('#hi') && !$('#hi').value) $('#hi').value=nowTime();
  bindIngreso(); bindAlta();
  flushOutbox('HSM_OUT_ING','ing'); flushOutbox('HSM_OUT_ALT','alt');
})();
