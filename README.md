1) Apps Script (backend):
   - Pegar CORE_v7_lite.gs y menus_y_mirror.gs.
   - Propiedades del script:
       HSM_API_KEY = HSM2025KEY
       HSM_CORS_ORIGIN = https://mingo76tsh-dev.github.io
   - Desplegar como WebApp (Acceso: Cualquiera con el enlace) y copiar la URL /exec.

2) Frontend (GitHub Pages):
   - En app.js setear WEBAPP_URL a la URL /exec y confirmar API_KEY = HSM2025KEY.
   - Subir los 3 archivos a /panel-html-msm/ (o al root si preferís).
   - Abrir: https://mingo76tsh-dev.github.io/panel-html-msm/

3) Planilla:
   - Abrir la planilla una vez para que aparezca el menú "HSM • Utilidades".
   - Usar "Mirror RAW → RAW_EXT" (manual o programar cada 15 min).

Notas:
- El cliente usa application/x-www-form-urlencoded (sin headers custom) → sin preflight.
- Cola offline: si no hay red, guarda en localStorage y reintenta con backoff.
- Normalización de fecha/hora a TZ AR en el servidor.

