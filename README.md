# PixFlip

Rotate, flip, zoom, and extract text from web images — right where they are, no downloads required.

## The Problem

Sideways scans, upside-down phone photos, misaligned screenshots — the usual fix is
downloading the file, opening it in an editor, rotating it, and going back to
your browser tab. PixFlip skips all of that: right-click, transform, done.

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

## OCR Setup

OCR is lazy-loaded and **not required** for rotate/flip/zoom/invert/zoom to
work — those run with zero setup. Because Manifest V3 extensions can't load
scripts from a CDN at runtime, Tesseract.js is vendored locally instead:

```bash
npm run vendor-ocr
```

This pulls `tesseract.js`, `tesseract.js-core` (LSTM-only build — smaller,
matches the library's default OCR engine mode), and the English trained-data
package (`@tesseract.js-data/eng`) from npm and copies the runtime files
into `src/tesseract/`:

```
src/tesseract/
├── tesseract.min.js       # main library (UMD, injected via <script>)
├── worker.min.js          # web worker that runs recognition off the main thread
├── tesseract-core.wasm.js # emscripten glue for the wasm binary
├── tesseract-core.wasm    # the actual OCR engine, compiled to WebAssembly
└── eng.traineddata.gz     # English character/language model (~2.9MB)
```

Reload the extension after running the script. Total added size is roughly
6MB — this is why it's fetched on demand rather than bundled by default.

Without these files, every other menu item still works; "Extract Text (OCR)"
will show a toast pointing back here instead of failing silently.

**Swapping languages**: run `npm install @tesseract.js-data/<lang-code>`
(e.g. `fra` for French) in a scratch directory, copy that package's
`4.0.0_best_int/<lang>.traineddata.gz` into `src/tesseract/`, and change the
language code passed to `Tesseract.createWorker(...)` in `src/ocr.js`.

## How It Works

- `background.js` registers the right-click context menu (Manifest V3 service worker)
- `content.js` tracks which `<img>` was right-clicked, then redraws it on an
  off-screen `<canvas>` from the **original** bitmap on every transform (so
  repeated rotations/flips never degrade quality or drift out of sync)
- Images are fetched **through the background script**, not the content
  script directly — this is what makes editing work reliably on sites like
  Wikipedia. In Manifest V3, content scripts are subject to the exact same
  CORS policy as the page they run in, so a content script re-requesting an
  image with `crossorigin="anonymous"` can still produce a tainted canvas
  even when the image server genuinely supports CORS. The background service
  worker isn't bound by the page's CORS policy — with `host_permissions`
  covering all sites, it fetches the raw bytes and hands them to the content
  script as a data URL, which never taints a canvas.
- The canvas output replaces the image's `src` as a data URL
- `ocr.js` is dynamically imported only when OCR is invoked, keeping the
  multi-MB Tesseract.js payload out of the default page load, and resolves
  images through the same background-fetch path before handing them to the
  OCR worker

## Privacy

PixFlip never sends your images anywhere. All rotation, flipping,
color inversion, and OCR run locally in the browser. No network requests, no
analytics, no tracking.

## Known Limitations

- **Truly unreachable images**: a small number of sites still block requests
  that don't look like they came from a real browser tab (e.g. requiring
  specific cookies or a matching `Referer`). Since the background script's
  fetch doesn't carry the page's cookies, images gated behind a login or a
  strict referrer check may still fail to load, showing a toast rather than
  failing silently.
- Right-click on an image inside a same-origin `<iframe>` should work; deeply
  nested cross-origin iframes may not receive the content script depending on
  site CSP.
- OCR accuracy depends on image quality — small, blurry, or heavily
  stylized text (e.g. logos, handwriting) will be less reliable than clean
  scanned or screenshotted text.

## Development

```bash
npm install
npm run vendor-ocr     # one-time: pulls Tesseract.js files (see OCR Setup)
npm run dev:firefox    # launches Firefox with the extension loaded
npm run lint           # runs web-ext lint against manifest + source
npm run build          # packages a distributable .zip into dist/
```

## Tech Stack

- WebExtensions API (Manifest V3, cross-browser via `browser_specific_settings`)
- Canvas API for pixel-level transforms
- [Tesseract.js](https://github.com/naptha/tesseract.js) for optional OCR

## License

MIT
