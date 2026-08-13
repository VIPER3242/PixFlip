// background.js
// Owns the right-click context menu. Doesn't touch the DOM directly —
// it just tells the content script (which has the actual <img> reference)
// what to do via chrome.tabs.sendMessage.

const MENU_ITEMS = [
  { id: "rotate-90", title: "Rotate 90\u00b0", parent: "rotate-root" },
  { id: "rotate-180", title: "Rotate 180\u00b0", parent: "rotate-root" },
  { id: "rotate-270", title: "Rotate 270\u00b0", parent: "rotate-root" },
  { id: "flip-h", title: "Flip Horizontal" },
  { id: "flip-v", title: "Flip Vertical" },
  { id: "invert-colors", title: "Invert Colors (night mode)" },
  { id: "zoom-image", title: "Zoom In..." },
  { id: "extract-text", title: "Extract Text (OCR)" },
  { id: "reset-image", title: "Reset to Original" }
];

function buildMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "rotate-root",
      title: "Rotate",
      contexts: ["image"]
    });

    for (const item of MENU_ITEMS) {
      chrome.contextMenus.create({
        id: item.id,
        title: item.title,
        contexts: ["image"],
        parentId: item.parent || undefined
      });
    }
  });
}

chrome.runtime.onInstalled.addListener(buildMenus);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;

  // srcUrl is the actual image URL the user right-clicked on.
  // We pass it along so the content script can locate the right <img>
  // even if there are duplicates on the page.
  chrome.tabs.sendMessage(tab.id, {
    type: "pixflip:command",
    command: info.menuItemId,
    srcUrl: info.srcUrl,
    frameId: info.frameId
  }).catch((err) => {
    // Content script may not be injected yet (e.g. chrome:// pages) — ignore.
    console.debug("[PixFlip] message failed:", err.message);
  });
});

// --- Cross-origin image fetching -------------------------------------
//
// Content scripts are, by design in Manifest V3, subject to the exact same
// CORS policy as the page they're injected into — they get no special
// treatment even though the extension itself has host_permissions. This
// means a content script re-requesting an image with crossOrigin="anonymous"
// can still end up with a tainted canvas on sites like Wikipedia, where the
// original <img> was loaded without that attribute — even when the image
// server genuinely supports CORS.
//
// A background service worker, by contrast, is NOT subject to the page's
// CORS policy. With host_permissions covering the target origin, it can
// fetch any image regardless of whether the server sends CORS headers at
// all. So: content script asks background to fetch, background hands back
// the bytes as a data URL (which never taints a canvas), content script
// draws that instead.
async function fetchImageAsDataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const blob = await response.blob();
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Convert to base64 in chunks to avoid blowing the call stack on large
  // images (String.fromCharCode(...hugeArray) can exceed argument limits).
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const base64 = btoa(binary);
  const mime = blob.type || "image/png";
  return `data:${mime};base64,${base64}`;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "pixflip:fetch-image") {
    fetchImageAsDataUrl(message.url)
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // keep the message channel open for the async response
  }
  return false;
});
