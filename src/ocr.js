// ocr.js
// Lazy-loaded only when the user clicks "Extract Text (OCR)" — Tesseract.js
// plus its wasm core is several MB, so it's never part of the main bundle.
//
// MV3 constraint: extensions can't load remote scripts, so Tesseract.js and
// its worker/core/language files are vendored locally under src/tesseract/
// (see README "OCR Setup" for exactly how these were generated — they come
// straight from the `tesseract.js`, `tesseract.js-core`, and
// `@tesseract.js-data/eng` npm packages, not a CDN).

let tesseractLoadPromise = null;

// Same rationale as content.js: content scripts (and workers they spawn)
// are subject to the page's CORS policy in MV3, but the background service
// worker isn't. We resolve the image to a data URL via background.js before
// ever handing it to the Tesseract worker, so the worker never has to fetch
// a cross-origin image itself.
function fetchImageAsDataUrl(url) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "pixflip:fetch-image", url },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response?.ok) {
          resolve(response.dataUrl);
        } else {
          reject(new Error(response?.error || "fetch-failed"));
        }
      }
    );
  });
}

function loadTesseractScript() {
  // tesseract.min.js is a UMD bundle that attaches `Tesseract` to the global
  // scope. A plain <script> tag is the most reliable way to load it into a
  // content-script's page world across both Chrome and Firefox.
  if (tesseractLoadPromise) return tesseractLoadPromise;

  tesseractLoadPromise = new Promise((resolve, reject) => {
    if (self.Tesseract) {
      resolve(self.Tesseract);
      return;
    }
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("src/tesseract/tesseract.min.js");
    script.onload = () => resolve(self.Tesseract);
    script.onerror = () => reject(new Error("tesseract-script-load-failed"));
    document.documentElement.appendChild(script);
  });

  return tesseractLoadPromise;
}

export async function runOcr(img, showToast) {
  showToast("Reading text from image\u2026");

  let Tesseract;
  try {
    Tesseract = await loadTesseractScript();
  } catch {
    showToast(
      "OCR engine files are missing \u2014 see README \u201cOCR Setup\u201d to enable text extraction."
    );
    return;
  }

  let worker;
  try {
    // If the image hasn't been rotated/flipped yet, img.src may still be a
    // remote URL — resolve it to a data URL first rather than letting the
    // Tesseract worker try to fetch it (and hit the same CORS wall).
    let source = img.src;
    if (!source.startsWith("data:")) {
      try {
        source = await fetchImageAsDataUrl(source);
      } catch {
        showToast(
          "Couldn't load this image for OCR \u2014 it may be unreachable or blocked by the site."
        );
        return;
      }
    }

    worker = await Tesseract.createWorker("eng", 1, {
      workerPath: chrome.runtime.getURL("src/tesseract/worker.min.js"),
      corePath: chrome.runtime.getURL("src/tesseract/tesseract-core.wasm.js"),
      langPath: chrome.runtime.getURL("src/tesseract/"),
      // Trained-data + core are vendored locally, never fetched from a CDN.
      cacheMethod: "readOnly",
      gzip: true
    });

    const {
      data: { text }
    } = await worker.recognize(source);

    if (!text || !text.trim()) {
      showToast("No text detected in this image.");
      return;
    }

    await navigator.clipboard.writeText(text.trim());
    showToast("Text extracted and copied to clipboard.");
    console.log("[PixFlip] OCR result:\n", text);
  } catch (err) {
    console.error("[PixFlip] OCR failed:", err);
    showToast("Text extraction failed. See console for details.");
  } finally {
    if (worker) await worker.terminate();
  }
}
