# InPlace Transformer

Rotate, flip, zoom, and extract text from web images — right where they are, no downloads required.

## The Problem

Sideways scans, upside-down phone photos, misaligned screenshots — the usual fix is
downloading the file, opening it in an editor, rotating it, and going back to
your browser tab. InPlace Transformer skips all of that: right-click, transform, done.

## Features

- 🔄 **Rotate** any image 90° / 180° / 270° via right-click context menu
- ↔️ **Flip** horizontally or vertically, in place
- 🌙 **Invert colors** for night reading
- 🔍 **Zoom modal** for inspecting fine detail without leaving the page
- 📝 **OCR text extraction** (via Tesseract.js) — pulls text out of rotated or
  scanned images, entirely client-side, and copies it to your clipboard
- ↩️ **Reset** any image back to its original orientation

All transforms are canvas-based (not just CSS), so rotated images actually
resize correctly on the page instead of overflowing their original box.

## Install (from source, until published)

### Chrome / Edge / Brave
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select this project's root folder

### Firefox
1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on** → select `manifest.json`

(Temporary add-ons are removed on browser restart — for persistent testing,
use `npm run dev:firefox`, which requires `npm install` first.)

## OCR Setup (optional)

OCR is lazy-loaded and **not required** for rotate/flip/zoom to work. Because
Manifest V3 extensions can't load remote scripts, Tesseract.js must be
vendored locally rather than pulled from a CDN:

1. Download the following from the [Tesseract.js releases](https://github.com/naptha/tesseract.js/releases):
   - `tesseract.min.js`
   - `worker.min.js`
   - `tesseract-core.wasm.js`
   - `eng.traineddata.gz`
2. Place them in `src/tesseract/`
3. Reload the extension

Without these files, every menu item works except "Extract Text (OCR)," which
will show a toast pointing back here.

## How It Works

- `background.js` registers the right-click context menu (Manifest V3 service worker)
- `content.js` tracks which `<img>` was right-clicked, then redraws it on an
  off-screen `<canvas>` from the **original** bitmap on every transform (so
  repeated rotations/flips never degrade quality or drift out of sync)
- The canvas output replaces the image's `src` as a data URL
- `ocr.js` is dynamically imported only when OCR is invoked, keeping the
  multi-MB Tesseract.js payload out of the default page load

## Privacy

InPlace Transformer never sends your images anywhere. All rotation, flipping,
color inversion, and OCR run locally in the browser. No network requests, no
analytics, no tracking.

## Known Limitations

- **CORS-protected images**: sites that don't serve images with permissive
  cross-origin headers will block canvas pixel access entirely (a browser
  security restriction, not a bug in this extension). Affected images will
  show a toast explaining this instead of failing silently.
- Right-click on an image inside a same-origin `<iframe>` should work; deeply
  nested cross-origin iframes may not receive the content script depending on
  site CSP.

## Development

```bash
npm install
npm run dev:firefox   # launches Firefox with the extension loaded
npm run lint          # runs web-ext lint against manifest + source
npm run build         # packages a distributable .zip into dist/
```

## Tech Stack

- WebExtensions API (Manifest V3, cross-browser via `browser_specific_settings`)
- Canvas API for pixel-level transforms
- [Tesseract.js](https://github.com/naptha/tesseract.js) for optional OCR

## License

MIT
