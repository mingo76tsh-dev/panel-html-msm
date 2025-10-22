#!/usr/bin/env bash
set -euo pipefail

# Requisitos: ImageMagick (convert/identify). Opcional: oxipng para optimizar PNG.
# Ubuntu/Debian: sudo apt-get update && sudo apt-get install -y imagemagick
# Opcional:      sudo apt-get install -y oxipng   (o usa kirillt/oxipng-action en el workflow)

THEME_BG="#0b1220"   # Color sólido de fondo para apple-touch (sin transparencia)
DIR="icons"
keep=(
  "icon-192.png"
  "icon-512.png"
  "maskable-192.png"
  "maskable-512.png"
  "apple-touch-icon.png"
  "favicon.png"
  "screen-1080x1920.png"
  "screen-1920x1080.png"
  ".gitkeep"
)

say(){ printf "\033[1;36m%s\033[0m\n" "$*"; }
fail(){ echo "::error::$*"; exit 1; }
have(){ command -v "$1" >/dev/null 2>&1; }

[ -d "$DIR" ] || fail "No existe la carpeta $DIR/"

if ! have convert || ! have identify; then
  fail "Falta ImageMagick (comandos convert/identify). Instálalo y reintenta."
fi

# --- Utilidades de imagen ---
ensure_square() { # $1 in $2 out $3 size (p.ej. 512x512) $4 background (none|#hex)
  local in="$1" out="$2" size="$3" bg="${4:-none}"
  if [[ "$bg" == "none" ]]; then
    convert "$in" -resize "$size" -gravity center -background none -extent "$size" "PNG32:$out"
  else
    convert "$in" -resize "$size" -gravity center -background "$bg" -extent "$size" \
      -alpha remove -alpha off "PNG24:$out"
  fi
}

check_size(){ # $1 file $2 WxH
  local got
  got="$(identify -format "%wx%h" "$1" 2>/dev/null || echo "0x0")"
  [[ "$got" == "$2" ]] || fail "Tamaño inválido para $1 (esperado $2, real $got)"
}

# --- Detectar “mejor fuente” disponible ---
src_flat=""        # icono plano para 'icon-*.png' y favicon
src_maskable=""    # icono con padding seguro para 'maskable-*.png'

[[ -f "$DIR/icon-512.png"       ]] && src_flat="$DIR/icon-512.png"
[[ -z "$src_flat" && -f "$DIR/icon-192.png"       ]] && src_flat="$DIR/icon-192.png"
[[ -z "$src_flat" ]] && fail "No encuentro icono plano base (icon-512.png / icon-192.png)."

[[ -f "$DIR/maskable-512.png"   ]] && src_maskable="$DIR/maskable-512.png"
[[ -z "$src_maskable" && -f "$DIR/maskable-192.png" ]] && src_maskable="$DIR/maskable-192.png"
# Si no hay maskable, usamos el plano como fallback (no ideal, pero funcional).
[[ -z "$src_maskable" ]] && src_maskable="$src_flat"

say "Regenerando íconos estándar y maskables…"
ensure_square "$src_flat"     "$DIR/icon-512.png"       "512x512"  "none"
ensure_square "$src_flat"     "$DIR/icon-192.png"       "192x192"  "none"
ensure_square "$src_maskable" "$DIR/maskable-512.png"   "512x512"  "none"
ensure_square "$src_maskable" "$DIR/maskable-192.png"   "192x192"  "none"

say "Generando apple-touch-icon (sin transparencia, 180×180)…"
ensure_square "$src_flat"     "$DIR/apple-touch-icon.png" "180x180" "$THEME_BG"

say "Generando favicon (32×32)…"
ensure_square "$src_flat"     "$DIR/favicon.png"         "32x32"    "none"

# --- Validaciones de tamaño exacto ---
say "Validando tamaños…"
check_size "$DIR/icon-192.png"          "192x192"
check_size "$DIR/icon-512.png"          "512x512"
check_size "$DIR/maskable-192.png"      "192x192"
check_size "$DIR/maskable-512.png"      "512x512"
check_size "$DIR/apple-touch-icon.png"  "180x180"
check_size "$DIR/favicon.png"           "32x32"
[[ -f "$DIR/screen-1080x1920.png" ]] && check_size "$DIR/screen-1080x1920.png" "1080x1920" || true
[[ -f "$DIR/screen-1920x1080.png" ]] && check_size "$DIR/screen-1920x1080.png" "1920x1080" || true

# --- Borrar todo lo que no sea necesario (y nombres raros) ---
say "Limpiando archivos no usados en icons/…"
shopt -s extglob dotglob
for f in "$DIR"/*; do
  base="$(basename "$f")"
  keep_this=false
  for k in "${keep[@]}"; do [[ "$base" == "$k" ]] && keep_this=true && break; done
  $keep_this || rm -f -- "$f"
done
shopt -u extglob dotglob

# --- Optimización lossless si está oxipng disponible ---
if have oxipng; then
  say "Optimizando PNG (oxipng)…"
  oxipng -o3 -strip safe "$DIR"/*.png >/dev/null || true
else
  say "Sugerencia: instala oxipng para comprimir sin pérdidas (opcional)."
fi

say "✅ Listo. Carpeta icons/ limpia, normalizada y validada."
