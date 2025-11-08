/* HSM v7 • app.js (cliente optimizado para GitHub Pages)
   - Envía con application/x-www-form-urlencoded (sin headers → sin preflight)
   - Encola offline en localStorage con reintentos (backoff exponencial)
   - Se integra con el HTML del panel (IDs existentes)
   Autor: Domingo + asistente
*/

/* ====== CONFIG EDITABLE ====== */
const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyqvAkFP2tf_lT6BXNcMNJ0esY0MajUTsI91wXRItW6RGhJguR4VwdG9wUkLWf1EC7u/exec';
const API_KEY    = 'HSM2025KEY';

/* ====== Utiles base ====== */
const LS = {
  get(k, d=null){ try{ const v=localStorage.getItem(k); return v==null?d:JSON.parse(v);}catch(_){ return localStorage.getItem(k)||d; } },
  set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(_){ localStorage.setItem(k, v); } },
  del(k){ localStorage.removeItem(k); }
};
const $  = (s)=>document.querySelector(s);
const nowDate = ()=> new Date().toISOString().slice(0,10);
const nowTime = ()=> new Date().toTimeString().slice(0,5);
const uuid    = ()=> (crypto.randomUUID?.() || (Date.now()+'-'+Math.random().toString(16).slice(2)));
const dniClean= (v)=> String(v||'').replace(/\D/g,'').slice(0,9);
const dniOK   = (v)=> /^\d{7,9}$/.test(String(v||'').trim());

function setStatus(text, cls){
  const st = $('#status'); if(!st) return;
  st.textContent = text;
  st.className = 'badge ' + (cls||'mut');
}
function setMsg(el, text, ok=true){
  if(!el) return;
  el.style.color = ok ? 'var(--ok)' : 'var(--err)';
  el.textContent = text;
}

/* ====== Transporte SIN preflight ======
   Enviamos siempre como URLSearchParams y pasamos la apiKey por query (?apiKey=...)
   NUNCA mandamos headers custom.
*/
function postForm(url, params){
  const qs = new URLSearchParams(params);
  return fetch(url + (url.includes('?')?'&':'?') + 'apiKey=' + encodeURIComponent(API_KEY), {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-cache',
    body: qs
  }).then(r => r.json());
}

/* ====== API “plana” compatible con tu CORE ======
   - doGet() → ping
   - doPost(e) → escribe fila en RAW con:
       tipo='ing' (ingresos)  o  tipo='alta' (egresos)
*/
const API = {
  async ping(){ const r = await fetch(WEBAPP_URL); return r.json(); },

  async saveIngreso(payload){
    // Mapea a los nombres que espera tu doPost()
    const data = {
      tipo: 'ing',
      DNI: payload.DNI,
      Sexo: payload.Sexo,
      FechaIngresoManual: payload.FechaIngresoManual,
      HoraIngresoManual:  payload.HoraIngresoManual,
      IdeacionIntento:    payload.IdeacionIntento || '',
      MetodoLetalidad:    payload.MetodoLetalidad || '',
      Consumo:            payload.Consumo || '',
      TipoSustancia:      payload.TipoSustancia || '',
      Frecuencia:         payload.Frecuencia || '',
      DxProvisorio_CIE10: (payload.DxProvisorio_CIE10||payload.DxCIE10||'').toUpperCase(),
      Observaciones:      payload.Observaciones || '',
      AppVersion:         'v7-panel'
    };
    return postForm(WEBAPP_URL, data);
  },

  async saveAlta(payload){
    const data = {
      tipo: 'alta',
      DNI:              payload.DNI,
      Sexo:             payload.Sexo || '',
      EstadoEgreso:     payload.EstadoEgreso || 'Alta',
      FechaAltaManual:  payload.FechaAltaManual || '',
      HoraAltaManual:   payload.HoraAltaManual  || '',
      // compat opcional
      FechaIngresoManual: payload.FechaIngresoManual || '',
      HoraIngresoManual:  payload.HoraIngresoManual  || '',
      Observaciones:     payload.Observaciones || '',
      AppVersion:        'v7-panel'
    };
    return postForm(WEBAPP_URL, data);
  }
};
// Exponer por si querés probar en consola
window.API = API;

/* ====== Cola offline + backoff ====== */
async function flushOutbox(key, kind){
  const box = LS.get(key, []);
  if(!box.length) return;
  const remain=[];
  for(const it of box){
    const now = Date.now();
    if(it.retryAt && now < it.retryAt){ remain.push(it); continue; }
    try{
      const out = (kind==='ing') ? await API.saveIngreso(it.payload)
                                 : await API.saveAlta(it.payload);
      if(!(out && out.ok)){ throw new Error(out && out.message || 'ERR'); }
    }catch(e){
      it.retries = (it.retries||0)+1;
      it.retryAt = now + Math.min(60000, 2000*Math.pow(2, it.retries)); // máx 60s
      remain.push(it);
    }
  }
  LS.set(key, remain);
}
// Flush periódico
setInterval(()=>{ flushOutbox('HSM_OUT_ING','ing'); flushOutbox('HSM_OUT_ALT','alt'); }, 15000);
// Event listeners de conectividad
addEventListener('online',  ()=> setStatus('Online','ok'));
addEventListener('offline', ()=> setStatus('Offline','mut'));

/* ====== Binding a tu UI ======
   INgreso:  #submitIng, campos: dni, sexo, fi, hi, ii, met, cons, sust, cie, obs
   Alta:     #submitAlta, campos: dni2, fnac2, sexo2, fa, ha, estado, obs2
*/
function bindIngreso(){
  const btn = $('#submitIng'); if(!btn) return;

  $('#dni')?.addEventListener('input', e=> e.target.value = dniClean(e.target.value));

  btn.addEventListener('click', async (ev)=>{
    ev.preventDefault();
    const m = $('#msgIng');

    const payload = {
      DNI: dniClean($('#dni')?.value),
      Sexo: $('#sexo')?.value || '',
      FechaIngresoManual: $('#fi')?.value || '',
      HoraIngresoManual:  $('#hi')?.value || '',
      IdeacionIntento: $('#ii')?.value || '',
      MetodoLetalidad: $('#met')?.value || '',
      Consumo: $('#cons')?.value || '',
      TipoSustancia: $('#sust')?.value || '',
      DxProvisorio_CIE10: ($('#cie')?.value || '').toUpperCase(),
      Observaciones: $('#obs')?.value || ''
    };

    // Validaciones mínimas
    if(!dniOK(payload.DNI)){ setMsg(m,'DNI inválido (7–9 dígitos)', false); return; }
    if(!payload.Sexo){ setMsg(m,'Seleccioná sexo', false); return; }
    if(!payload.FechaIngresoManual){ $('#fi').value = nowDate(); payload.FechaIngresoManual = $('#fi').value; }
    if(!payload.HoraIngresoManual){  $('#hi').value = nowTime(); payload.HoraIngresoManual  = $('#hi').value; }

    btn.disabled = true; setMsg(m,'Guardando…', true);
    try{
      const out = await API.saveIngreso(payload);
      if(out && out.ok){
        setMsg(m, 'Guardado ✔ (fila ' + (out.row||'?') + ')', true);
      }else{
        throw new Error(out && out.message || 'Error desconocido');
      }
    }catch(e){
      // Encolar y avisar
      const box = LS.get('HSM_OUT_ING', []);
      box.push({payload, retries:0});
      LS.set('HSM_OUT_ING', box);
      setMsg(m, 'Sin red. En cola ('+box.length+')', false);
    }finally{
      btn.disabled = false;
    }
  });
}

function bindAlta(){
  const btn = $('#submitAlta'); if(!btn) return;

  $('#dni2')?.addEventListener('input', e=> e.target.value = dniClean(e.target.value));

  btn.addEventListener('click', async (ev)=>{
    ev.preventDefault();
    const m = $('#msgAlta');

    const payload = {
      DNI:  dniClean($('#dni2')?.value),
      Sexo: $('#sexo2')?.value || '',
      FechaAltaManual: $('#fa')?.value || '',
      HoraAltaManual:  $('#ha')?.value || '',
      EstadoEgreso: $('#estado')?.value || 'Alta',
      Observaciones: $('#obs2')?.value || ''
    };

    if(!dniOK(payload.DNI)){ setMsg(m,'DNI inválido', false); return; }
    if(!payload.FechaAltaManual){ $('#fa').value = nowDate(); payload.FechaAltaManual = $('#fa').value; }
    if(!payload.HoraAltaManual){  $('#ha').value = nowTime(); payload.HoraAltaManual  = $('#ha').value; }

    btn.disabled = true; setMsg(m,'Guardando alta…', true);
    try{
      const out = await API.saveAlta(payload);
      if(out && out.ok){
        setMsg(m, 'Alta guardada ✔ (fila ' + (out.row||'?') + ')', true);
      }else{
        throw new Error(out && out.message || 'Error desconocido');
      }
    }catch(e){
      const box = LS.get('HSM_OUT_ALT', []);
      box.push({payload, retries:0});
      LS.set('HSM_OUT_ALT', box);
      setMsg(m, 'Sin red. En cola ('+box.length+')', false);
    }finally{
      btn.disabled = false;
    }
  });
}

/* ====== Bootstrap ====== */
(async function init(){
  try{
    const j = await API.ping();
    setStatus('Online','ok');
    if(j && j.version){ $('#status') && ($('#status').title = 'Core ' + j.version); }
  }catch(_){
    setStatus('Offline','mut');
  }

  // Prefill “ahora” por UX
  if($('#fi') && !$('#fi').value) $('#fi').value = nowDate();
  if($('#hi') && !$('#hi').value) $('#hi').value = nowTime();

  bindIngreso();
  bindAlta();

  // Primer flush por si había pendientes
  flushOutbox('HSM_OUT_ING','ing');
  flushOutbox('HSM_OUT_ALT','alt');
})();
