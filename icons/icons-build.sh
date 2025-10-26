
#!/usr/bin/env bash
set -euo pipefail

BG="#0b1220"
SRC_DIR="${1:-./icons}"
OUT_DIR="./icons-pack"
ZIP_NAME="icons-pack.zip"

have() { command -v "$1" >/dev/null 2>&1; }
fail(){ echo "ERROR: $*" >&2; exit 1; }
say(){ printf "\033[1;36m%s\033[0m\n" "$*"; }

[[ -d "$SRC_DIR" ]] || fail "Icons folder not found: $SRC_DIR"

# Check requirements
have identify || fail "ImageMagick (identify) is required"
have convert  || fail "ImageMagick (convert) is required"
CWEBP_OK=1
if ! have cwebp; then
  CWEBP_OK=0
  echo "WARN: cwebp not found -> WebP screenshots will be skipped"
fi

mkdir -p "$OUT_DIR"

# Helper to ensure a PNG exists at wanted size (resize/extent if needed)
ensure_png () {
  local in="$1" out="$2" size="$3"
  [[ -f "$in" ]] || fail "Missing input: $in"
  local got; got="$(identify -format "%wx%h" "$in" 2>/dev/null || true)"
  if [[ "$got" != "$size" ]]; then
    say "resize $in ($got -> $size)"
    convert "$in" -resize "$size" -gravity center -extent "$size" "$OUT_DIR/$(basename "$out")"
  else
    cp -f "$in" "$OUT_DIR/$(basename "$out")"
  fi
}

say "1) Copy/normalize base PNG icons"
ensure_png "$SRC_DIR/icon-192.png"         "$OUT_DIR/icon-192.png"         "192x192"
ensure_png "$SRC_DIR/icon-512.png"         "$OUT_DIR/icon-512.png"         "512x512"
ensure_png "$SRC_DIR/maskable-192.png"     "$OUT_DIR/maskable-192.png"     "192x192"
ensure_png "$SRC_DIR/maskable-512.png"     "$OUT_DIR/maskable-512.png"     "512x512"
ensure_png "$SRC_DIR/screen-1080x1920.png" "$OUT_DIR/screen-1080x1920.png" "1080x1920"
ensure_png "$SRC_DIR/screen-1920x1080.png" "$OUT_DIR/screen-1920x1080.png" "1920x1080"

# apple-touch-icon (180x180, solid BG, no alpha) -> built from icon-192.png
say "2) Build apple-touch-icon.png (180x180, no alpha, BG $BG)"
convert "$OUT_DIR/icon-192.png" -resize 180x180 -background "$BG" -alpha remove -alpha off -gravity center -extent 180x180 "$OUT_DIR/apple-touch-icon.png"

# favicons 16/32
say "3) Ensure favicon-16.png / favicon-32.png"
convert "$OUT_DIR/icon-192.png" -resize 16x16 "$OUT_DIR/favicon-16.png"
convert "$OUT_DIR/icon-192.png" -resize 32x32 "$OUT_DIR/favicon-32.png"

# Optional PNG lossless optimization
if have oxipng; then
  say "4) Optimize PNGs (oxipng)"
  oxipng -o3 --strip safe "$OUT_DIR"/*.png >/dev/null || true
fi

# WebP screenshots
if [[ "$CWEBP_OK" -eq 1 ]]; then
  say "5) Create WebP screenshots"
  cwebp -q 82 "$OUT_DIR/screen-1080x1920.png" -o "$OUT_DIR/screen-1080x1920.webp" >/dev/null
  cwebp -q 82 "$OUT_DIR/screen-1920x1080.png" -o "$OUT_DIR/screen-1920x1080.webp" >/dev/null
else
  echo "Skipping WebP (cwebp not found)."
fi

# Pack ZIP
say "6) Create ZIP: $ZIP_NAME"
rm -f "$ZIP_NAME"
( cd "$OUT_DIR" && zip -q -r "../$ZIP_NAME" . )

say "Done! -> $ZIP_NAME"
ls -lh "$ZIP_NAME"
