// ocr.js
// Lazy-loaded only when the user clicks "Extract Text (OCR)" — Tesseract.js
// plus its wasm core is several MB, so we never ship it in the main bundle.
//
// IMPORTANT (MV3 constraint): extensions cannot load remote scripts, so
// Tesseract.js and its worker/core/lang files must be vendored locally
// under src/tesseract/. Download from:
//   https://github.com/naptha/tesseract.js  (dist files + tesseract-core.wasm.js)
// and place as:
//   src/tesseract/tesseract.min.js
//   src/tesseract/worker.min.js
//   src/tesseract/tesseract-core.wasm.js
//   src/tesseract/eng.traineddata.gz

export async function runOcr(img, showToast) {
  showToast("Reading text from image...");

  try {
    // Dynamically imported so it's only fetched when actually used.
    await import(chrome.runtime.getURL("src/tesseract/tesseract.min.js"));

    // Tesseract.js attaches itself to self.Tesseract when loaded this way.
    const Tesseract = self.Tesseract;
    if (!Tesseract) {
      throw new Error("tesseract-not-loaded");
    }

    const worker = await Tesseract.createWorker("eng", 1, {
      workerPath: chrome.runtime.getURL("src/tesseract/worker.min.js"),
      corePath: chrome.runtime.getURL("src/tesseract/tesseract-core.wasm.js"),
      langPath: chrome.runtime.getURL("src/tesseract/")
    });

    const {
      data: { text }
    } = await worker.recognize(img.src);
    await worker.terminate();

    if (!text || !text.trim()) {
      showToast("No text detected in this image.");
      return;
    }

    await navigator.clipboard.writeText(text.trim());
    showToast("Text extracted and copied to clipboard.");
    console.log("[InPlace Transformer] OCR result:\n", text);
  } catch (err) {
    console.error("[InPlace Transformer] OCR failed:", err);
    if (err.message === "tesseract-not-loaded") {
      showToast(
        "OCR engine not installed \u2014 see README to enable text extraction."
      );
    } else {
      showToast("Text extraction failed. This image may be CORS-protected.");
    }
  }
}
