# HSM v7 • Móvil

[![Build & Pages](https://github.com/mingo76tsh-dev/panel-html-msm/actions/workflows/pages.yml/badge.svg)](../../actions/workflows/pages.yml)
[![GitHub Pages](https://img.shields.io/badge/Pages-Online-2ea44f?logo=github)](https://mingo76tsh-dev.github.io/panel-html-msm/)
[![PWA](https://img.shields.io/badge/PWA-Ready-5a0fc8?logo=pwa)](#)

App móvil (PWA) para ingreso y alta rápida con soporte offline y cola de pendientes.

- **Abrir la app**: https://mingo76tsh-dev.github.io/panel-html-msm/
- **Atajos**: `#/ing`, `#/alta`, `#/pend`, `#/util`

# panel-html-msm

## Configuración inicial
- La app trae defaults embebidos (EXEC_URL + API_KEY).
- Podés cambiarlos en ⚙️ (se guardan en `localStorage`).

## Atajos
- `#/ing`, `#/alta`, `#/pend`, `#/util`

## Desarrollo local
```bash
npm ci
node build.mjs --dev
npx http-server dist -p 4173 -s
# abrir http://localhost:4173/
node build.mjs --prod
# genera dist/ listo para GitHub Pages

---

# 🧪 Cómo probar rápido

1) **Local**  
```bash
npm ci
node build.mjs --dev
npx http-server dist -p 4173 -s
