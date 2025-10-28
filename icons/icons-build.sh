#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# icons-build.sh  —  Generador de íconos/screenshot para PWA
# Carpeta destino: este mismo directorio (panel-html-msm/icons/)
# Requiere: ImageMagick (convert/identify). Opcional: optipng.
# Uso:
#   ./icons-build.sh                # usa icons/logo-base.png
#   ./icons-build.sh path/a/logo.png path/a/screenshot.png
# ============================================================

# --- Paths
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

SRC_LOGO="${1:-$SCRIPT_DIR/logo-base.png}"           # cuadrado, transparente
SRC_SCREEN="${2:-}"                                  # opcional screenshot base

OUT_DIR="$SCRIPT_DIR"
TMP_DIR="$SCRIPT_DIR/.tmp-icons"
mkdir -p "$TMP_DIR"

# --- Check deps
have() { command -v "$1" >/dev/null 2>&1; }
if ! have convert || ! have identify; then
  echo "❌ Requiere ImageMagick (convert/identify)"; exit 1
fi
if ! have optipng; then
  echo "ℹ️  optipng no encontrado; se omitirá la optimización final."
fi

# --- Helpers
pad_maskable () {
  # Crea un PNG 'maskable' con área de seguridad (safe zone ~20%)
  # $1: input, $2: salida, $3: tamaño final
  local in="$1" out="$2" size="$3"
  local pad_ratio=0.20                      # 20% safe area
  local inner
  inner=$(python - <<PY
size=$size
pad=int(size*${pad_ratio})
print(size-2*pad)
PY
)
  convert -background none -gravity center "$in" -resize "${inner}x${inner}" \
    -extent "${size}x${size}" -define png:color-type=6 "$out"
}

round_corners () {
  # Apple-touch con esquinas redondeadas sutiles (12%)
  # $1 in, $2 out, $3 size
  local in="$1" out="$2" size="$3"
  local r
  r=$(python - <<PY
size=$size
print(int(size*0.12))
PY
)
  convert "$in" -resize "${size}x${size}" PNG32:"$TMP_DIR/tmp_in.png"
  convert -size ${size}x${size} xc:none -draw "roundrectangle 0,0,$((size-1)),$((size-1)),$r,$r" \
    "$TMP_DIR/mask.png"
  convert "$TMP_DIR/tmp_in.png" "$TMP_DIR/mask.png" -compose DstIn -composite "$out"
}

ensure () {
  # $1: etiqueta, $2: cmd...
  echo "• $1"
  "${@:2}"
}

optimize () {
  have optipng && optipng -quiet -o7 "$1" || true
}

require_square_png () {
  local f="$1"
  if [[ ! -f "$f" ]]; then
    echo "❌ Archivo no encontrado: $f"; exit 1
  fi
  local wh
  wh=$(identify -format "%w %h %[mime]" "$f")
  read -r w h mime <<<"$wh"
  if [[ "$mime" != "image/png" ]]; then
    echo "❌ Debe ser PNG: $f"; exit 1
  fi
  if [[ "$w" -ne "$h" ]]; then
    echo "❌ Debe ser cuadrado (WxH iguales): $f  ($w x $h)"; exit 1
  fi
}

require_square_png "$SRC_LOGO"

echo "==> Generando íconos a partir de: $SRC_LOGO"
[[ -n "$SRC_SCREEN" ]] && echo "==> Screenshot base: $SRC_SCREEN"

# ------------------------------------------------------------
# FAVICONS / APP ICONS
# ------------------------------------------------------------
ensure "favicon-16.png"  convert "$SRC_LOGO" -resize 16x16   PNG32:"$OUT_DIR/favicon-16.png"
ensure "favicon-32.png"  convert "$SRC_LOGO" -resize 32x32   PNG32:"$OUT_DIR/favicon-32.png"
ensure "icon-96.png"     convert "$SRC_LOGO" -resize 96x96   PNG32:"$OUT_DIR/icon-96.png"
ensure "icon-192.png"    convert "$SRC_LOGO" -resize 192x192 PNG32:"$OUT_DIR/icon-192.png"
ensure "icon-512.png"    convert "$SRC_LOGO" -resize 512x512 PNG32:"$OUT_DIR/icon-512.png"

# ------------------------------------------------------------
# APPLE TOUCH (redondeado)
# ------------------------------------------------------------
ensure "apple-touch-icon.png (180x180 redondeado)" \
  round_corners "$SRC_LOGO" "$OUT_DIR/apple-touch-icon.png" 180

# ------------------------------------------------------------
# MASKABLE ICONS (safe area)
# ------------------------------------------------------------
ensure "maskable-192.png" pad_maskable "$SRC_LOGO" "$OUT_DIR/maskable-192.png" 192
ensure "maskable-512.png" pad_maskable "$SRC_LOGO" "$OUT_DIR/maskable-512.png" 512

# ------------------------------------------------------------
# SCREENSHOTS (si no pasás imagen base, se genera compositado)
# ------------------------------------------------------------
make_screenshot () {
  # $1: salida WxH
  local out="$1" w h
  IFS="x" read -r w h <<<"$(basename "$out" .png | sed 's/.*-\([0-9]\+x[0-9]\+\)$/\1/')"
  if [[ -n "$SRC_SCREEN" && -f "$SRC_SCREEN" ]]; then
    convert "$SRC_SCREEN" -resize "${w}x${h}^" -gravity center -extent "${w}x${h}" "$OUT_DIR/$out"
  else
    # Composición simple: degradado + logo centrado + leyenda
    convert -size ${w}x${h} \
      gradient:'#0b1220-#0f172a' \
      \( "$SRC_LOGO" -resize "$((w/3))x$((w/3))" \) -gravity center -composite \
      -gravity south -fill '#cbd5e1' -pointsize $((w/28)) -annotate +0+60 'HSM v7 • Móvil' \
      "$OUT_DIR/$out"
  fi
}

ensure "screen-1080x1920.png (vertical)" make_screenshot "screen-1080x1920.png"
ensure "screen-1920x1080.png (horizontal)" make_screenshot "screen-1920x1080.png"

# ------------------------------------------------------------
# Optimización
# ------------------------------------------------------------
for f in \
  favicon-16.png favicon-32.png icon-96.png icon-192.png icon-512.png \
  apple-touch-icon.png maskable-192.png maskable-512.png \
  screen-1080x1920.png screen-1920x1080.png
do
  optimize "$OUT_DIR/$f"
done

# ------------------------------------------------------------
# Resumen
# ------------------------------------------------------------
echo ""
echo "✅ Íconos generados en: $OUT_DIR"
ls -lh "$OUT_DIR"/favicon-16.png "$OUT_DIR"/favicon-32.png \
       "$OUT_DIR"/icon-96.png "$OUT_DIR"/icon-192.png "$OUT_DIR"/icon-512.png \
       "$OUT_DIR"/apple-touch-icon.png "$OUT_DIR"/maskable-192.png "$OUT_DIR"/maskable-512.png \
       "$OUT_DIR"/screen-1080x1920.png "$OUT_DIR"/screen-1920x1080.png || true
echo ""
echo "Sugerencia: agrega/actualiza referencias en manifest.json si fuera necesario."
