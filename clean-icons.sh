#!/usr/bin/env bash
set -euo pipefail

# Requisitos: ImageMagick (convert/identify).
# Ubuntu/Debian: sudo apt-get update && sudo apt-get install -y imagemagick

THEME_BG="#0b1220"   # color sólido para apple-touch (sin alpha)
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

have identify || fail "Falta ImageMagick (identify)"
have convert   || fail "Falta ImageMagick (convert)"

say "1) Borrando archivos basura o duplicados…"
shopt -s nullglob
for f in "$DIR"/*; do
  base=$(basename "$f")
  ok=0
  for k in "${keep[@]}"; do
    [[ "$base" == "$k" ]] && ok=1 && break
  done
  [[ $ok -eq 1 ]] || { rm -f "$f"; echo "  - delete $base"; }
done
shopt -u nullglob

say "2) Verificando tamaños y corrigiendo si aplica…"
fix_size () {
  local f="$1" want="$2"
  if [[ ! -f "$f" ]]; then fail "Falta $f"; fi
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

say "3) Generando apple-touch-icon (180x180, sin transparencia, fondo theme)…"
if [[ -f "$DIR/icon-192.png" ]]; then
  convert "$DIR/icon-192.png" -resize 180x180 -background "$THEME_BG" -alpha remove -alpha off -gravity center -extent 180x180 "$DIR/apple-touch-icon.png"
fi

say "4) Generando favicon.png (32x32, desde icon-192)…"
if [[ -f "$DIR/icon-192.png" ]]; then
  convert "$DIR/icon-192.png" -resize 32x32 "$DIR/favicon.png"
fi

say "OK ✔ icons/"
