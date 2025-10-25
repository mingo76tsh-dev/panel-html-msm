#!/usr/bin/env bash
set -euo pipefail

# Requiere ImageMagick (convert/identify).
THEME_BG="#0b1220"
DIR="icons"

keep=(
  "icon-192.png"
  "icon-512.png"
  "maskable-192.png"
  "maskable-512.png"
  "apple-touch-icon.png"
  "favicon-16.png"
  "favicon-32.png"
  "screen-1080x1920.png"
  "screen-1920x1080.png"
  ".gitkeep"
)

say(){ printf "\033[1;36m%s\033[0m\n" "$*"; }
fail(){ echo "::error::$*"; exit 1; }
have(){ command -v "$1" >/dev/null 2>&1; }

[ -d "$DIR" ] || fail "No existe la carpeta $DIR/"
have identify || fail "Falta ImageMagick (identify)"
have convert   || fail "Falta ImageMagick (convert)"

say "1) Borrando archivos que no usamos…"
shopt -s nullglob
for f in "$DIR"/*; do
  base=$(basename "$f"); ok=0
  for k in "${keep[@]}"; do [[ "$base" == "$k" ]] && ok=1 && break; done
  [[ $ok -eq 1 ]] || { rm -f "$f"; echo "  - delete $base"; }
done
shopt -u nullglob

say "2) Verificando/ajustando tamaños…"
fix_size () {
  local f="$1" want="$2"; [[ -f "$f" ]] || fail "Falta $f"
  local got; got="$(identify -format "%wx%h" "$f")"
  if [[ "$got" != "$want" ]]; then
    echo "  - resize $f ($got → $want)"
    convert "$f" -resize "$want" -gravity center -extent "$want" "$f"
  fi
}
fix_size "$DIR/icon-192.png"         "192x192"
fix_size "$DIR/icon-512.png"         "512x512"
fix_size "$DIR/maskable-192.png"     "192x192"
fix_size "$DIR/maskable-512.png"     "512x512"
fix_size "$DIR/screen-1080x1920.png" "1080x1920"
fix_size "$DIR/screen-1920x1080.png" "1920x1080"

say "3) apple-touch-icon (180x180, sin alpha)…"
convert "$DIR/icon-192.png" -resize 180x180 -background "$THEME_BG" -alpha remove -alpha off -gravity center -extent 180x180 "$DIR/apple-touch-icon.png"

say "4) favicons 16/32…"
convert "$DIR/icon-192.png" -resize 16x16 "$DIR/favicon-16.png"
convert "$DIR/icon-192.png" -resize 32x32 "$DIR/favicon-32.png"

# (Opcional fuerte para Lighthouse) generar WebP sólo para screenshots
if command -v cwebp >/dev/null 2>&1; then
  say "5) Generando screenshots .webp (calidad 85)…"
  cwebp -q 85 "$DIR/screen-1080x1920.png" -o "$DIR/screen-1080x1920.webp" >/dev/null 2>&1 || true
  cwebp -q 85 "$DIR/screen-1920x1080.png" -o "$DIR/screen-1920x1080.webp" >/dev/null 2>&1 || true
fi

say "OK ✔ icons/"

