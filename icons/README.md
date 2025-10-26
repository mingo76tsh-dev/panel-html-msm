
# Icons ZIP Maker (for /panel-html-msm/icons)

This kit creates **icons-pack.zip** from the icons you already have in your repo or local folder.
It keeps your **PNG** files and also generates **WebP** screenshots (for Lighthouse 100/100).

## What it produces

icons/
├─ favicon-16.png
├─ favicon-32.png
├─ icon-192.png
├─ icon-512.png
├─ maskable-192.png
├─ maskable-512.png
├─ apple-touch-icon.png  (180x180, no alpha, BG #0b1220)
├─ screen-1080x1920.png
├─ screen-1920x1080.png
├─ screen-1080x1920.webp  (optimized)
├─ screen-1920x1080.webp  (optimized)

Output ZIP: **icons-pack.zip** (ready to upload into `/panel-html-msm/icons/`).
_Manifest is NOT included (as requested)._

## Requirements
- Linux/macOS with **ImageMagick** (`convert`, `identify`)
- **cwebp** for WebP conversion (from `libwebp` tools)
- Optional: `oxipng` to losslessly optimize PNGs

## Usage

1) Place this folder alongside your existing `icons/` folder, or point it to your icons path.
   Required PNG inputs in `icons/`:
     - icon-192.png, icon-512.png
     - maskable-192.png, maskable-512.png
     - apple-touch-icon.png (will be regenerated, but source not strictly needed)
     - favicon-16.png, favicon-32.png (will be generated if missing)
     - screen-1080x1920.png, screen-1920x1080.png

2) Run:
   ```bash
   bash icons-build.sh ./icons
   ```

3) The script writes **icons-pack/** and **icons-pack.zip** in the current directory.
   Upload the contents of **icons-pack/** to `/panel-html-msm/icons/`,
   or upload the **icons-pack.zip** and unzip on the server.

## Notes
- The script validates sizes and resizes if needed.
- `apple-touch-icon.png` is rebuilt from `icon-192.png` with solid BG `#0b1220` and no alpha.
- If `cwebp` is not available, the script will skip WebP and still create the ZIP.
