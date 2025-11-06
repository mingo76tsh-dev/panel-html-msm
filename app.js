<script>
  // ==== Config ====
  const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyqvAkFP2tf_lT6BXNcMNJ0esY0MajUTsI91wXRItW6RGhJguR4VwdG9wUkLWf1EC7u/exec'; // <-- tu /exec actual
  const API_KEY    = 'HSM2025KEY'; // o el que pusiste en HSM_API_KEY

  // ---- helper que evita preflight ----
  async function postSimple(url, payload) {
    const res = await fetch(url, {
      method: 'POST',
      // NO headers (o podrías poner 'Content-Type': 'text/plain;charset=UTF-8')
      body: JSON.stringify(payload),   // string => simple request
      mode: 'cors',
      cache: 'no-cache',
      credentials: 'omit'
    });
    // Si Apps Script devuelve CORS, esto llega. Si no, el navegador lo corta antes.
    const txt = await res.text();
    try { return JSON.parse(txt); } catch { return { ok:false, parseError:true, raw:txt }; }
  }

  // ---- API cliente ----
  const API = {
    async ping() {
      return postSimple(WEBAPP_URL, { action: 'ping' });
    },
    async config() {
      return postSimple(WEBAPP_URL, { action: 'config' });
    },
    async saveIngreso(form) {
      // form: {DNI, Sexo, FechaIngresoManual, HoraIngresoManual, IdeacionIntento, ...}
      return postSimple(WEBAPP_URL, {
        action: 'save',
        apiKey: API_KEY,
        payload: form
      });
    },
    async saveAlta(form) {
      // form: {DNI, Sexo, FechaAltaManual, HoraAltaManual, EstadoEgreso, Observaciones}
      return postSimple(WEBAPP_URL, {
        action: 'alta',
        apiKey: API_KEY,
        payload: form
      });
    },
    async findByDni(dni, days=120) {
      return postSimple(WEBAPP_URL, { action: 'find', dni, days });
    },
    async cie10List() {
      return postSimple(WEBAPP_URL, { action: 'cie10_list' });
    }
  };

  // ---- wiring con tu UI (IDs como los del panel) ----
  function val(id){ return (document.getElementById(id)?.value ?? '').trim(); }

  // Ingreso
  async function onGuardarIngreso() {
    const payload = {
      DNI: val('dni'),
      Sexo: val('sexo'),
      FechaIngresoManual: val('fecha_ingreso'), // dd/mm/aaaa o yyyy-mm-dd, el Core normaliza
      HoraIngresoManual:  val('hora_ingreso'),  // hh:mm
      IdeacionIntento:    val('ideacion'),
      MetodoLetalidad:    val('metodo'),
      Consumo:            val('consumo'),
      TipoSustancia:      val('tipo_sustancia'),
      DxProvisorio_CIE10: val('dx_cie10'),
      Observaciones:      val('observaciones')
    };
    const out = await API.saveIngreso(payload);
    console.log('SAVE INGRESO →', out);
    alert(out.ok ? 'Ingreso guardado ✔' : `Error: ${out.message||'desconocido'}`);
  }

  // Alta / Egreso
  async function onGuardarAlta() {
    const payload = {
      DNI: val('dni'),                 // el mismo DNI
      Sexo: val('sexo'),
      FechaAltaManual: val('fecha_alta'), // dd/mm/aaaa o yyyy-mm-dd
      HoraAltaManual:  val('hora_alta'),  // hh:mm
      EstadoEgreso:    'Alta',
      Observaciones:   val('observaciones')
    };
    const out = await API.saveAlta(payload);
    console.log('SAVE ALTA →', out);
    alert(out.ok ? 'Alta guardada ✔' : `Error: ${out.message||'desconocido'}`);
  }

  // Helpers de prueba desde consola:
  window.API = API;
  window.onGuardarIngreso = onGuardarIngreso;
  window.onGuardarAlta = onGuardarAlta;
</script>
