// content.js
// Runs on every page. Two jobs:
//   1. Remember which <img> was last right-clicked (context menu events
//      don't give us a DOM reference, only a URL, and URLs can repeat).
//   2. Apply canvas-based transforms to that image when told to by background.js.

let lastRightClickedImg = null;

document.addEventListener(
  "contextmenu",
  (e) => {
    if (e.target instanceof HTMLImageElement) {
      lastRightClickedImg = e.target;
    }
  },
  true
);

// Per-image transform state, keyed by element. We always redraw from the
// ORIGINAL bitmap rather than compounding transforms on already-transformed
// pixels — otherwise repeated rotate/flip degrades quality and drifts.
const stateMap = new WeakMap();

function getState(img) {
  if (!stateMap.has(img)) {
    stateMap.set(img, {
      originalSrc: img.src,
      rotation: 0, // 0 | 90 | 180 | 270
      flipH: false,
      flipV: false,
      inverted: false
    });
  }
  return stateMap.get(img);
}

function loadOriginalBitmap(img) {
  return new Promise((resolve, reject) => {
    const state = getState(img);
    const source = new Image();
    source.crossOrigin = "anonymous"; // best-effort; may fail on strict CORS
    source.onload = () => resolve(source);
    source.onerror = () => reject(new Error("image-load-failed"));
    source.src = state.originalSrc;
  });
}

async function redraw(img) {
  const state = getState(img);
  let bitmap;
  try {
    bitmap = await loadOriginalBitmap(img);
  } catch {
    showToast("Couldn't load image for editing.");
    return;
  }

  const swapDims = state.rotation === 90 || state.rotation === 270;
  const canvas = document.createElement("canvas");
  canvas.width = swapDims ? bitmap.naturalHeight : bitmap.naturalWidth;
  canvas.height = swapDims ? bitmap.naturalWidth : bitmap.naturalHeight;

  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((state.rotation * Math.PI) / 180);
  ctx.scale(state.flipH ? -1 : 1, state.flipV ? -1 : 1);
  ctx.drawImage(bitmap, -bitmap.naturalWidth / 2, -bitmap.naturalHeight / 2);
  ctx.restore();

  if (state.inverted) {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255 - d[i];
      d[i + 1] = 255 - d[i + 1];
      d[i + 2] = 255 - d[i + 2];
    }
    ctx.putImageData(imgData, 0, 0);
  }

  try {
    const dataUrl = canvas.toDataURL("image/png");
    img.src = dataUrl;
    img.removeAttribute("width");
    img.removeAttribute("height");
    img.style.width = "";
    img.style.height = "";
  } catch (err) {
    // Tainted canvas — this domain doesn't serve permissive CORS headers.
    showToast(
      "This image can't be edited in-place (cross-origin restriction)."
    );
  }
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "inplace-transformer-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function openZoomModal(img) {
  const overlay = document.createElement("div");
  overlay.className = "inplace-transformer-overlay";

  const clone = document.createElement("img");
  clone.src = img.src;
  clone.className = "inplace-transformer-zoomed";

  overlay.appendChild(clone);
  overlay.addEventListener("click", () => overlay.remove());
  document.addEventListener(
    "keydown",
    function onEsc(e) {
      if (e.key === "Escape") {
        overlay.remove();
        document.removeEventListener("keydown", onEsc);
      }
    }
  );

  document.body.appendChild(overlay);
}

async function handleCommand(command, img) {
  const state = getState(img);

  switch (command) {
    case "rotate-90":
      state.rotation = (state.rotation + 90) % 360;
      await redraw(img);
      break;
    case "rotate-180":
      state.rotation = (state.rotation + 180) % 360;
      await redraw(img);
      break;
    case "rotate-270":
      state.rotation = (state.rotation + 270) % 360;
      await redraw(img);
      break;
    case "flip-h":
      state.flipH = !state.flipH;
      await redraw(img);
      break;
    case "flip-v":
      state.flipV = !state.flipV;
      await redraw(img);
      break;
    case "invert-colors":
      state.inverted = !state.inverted;
      await redraw(img);
      break;
    case "reset-image":
      stateMap.delete(img);
      img.src = getState(img).originalSrc; // re-seeds fresh default state
      break;
    case "zoom-image":
      openZoomModal(img);
      break;
    case "extract-text":
      // Lazy-loaded so Tesseract.js (several MB) never loads unless used.
      const { runOcr } = await import(
        chrome.runtime.getURL("src/ocr.js")
      );
      await runOcr(img, showToast);
      break;
    default:
      console.debug("[InPlace Transformer] unknown command:", command);
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "inplace-transformer:command") return;

  // Prefer the exact element the user right-clicked. Fall back to matching
  // by src if for some reason we lost the reference (e.g. SPA re-render
  // between the contextmenu event and the click).
  let target = lastRightClickedImg;
  if (!target || target.src !== message.srcUrl) {
    const candidates = document.querySelectorAll("img");
    target = Array.from(candidates).find((el) => el.src === message.srcUrl) || target;
  }
  if (!target) return;

  handleCommand(message.command, target);
});
