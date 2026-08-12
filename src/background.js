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
    type: "inplace-transformer:command",
    command: info.menuItemId,
    srcUrl: info.srcUrl,
    frameId: info.frameId
  }).catch((err) => {
    // Content script may not be injected yet (e.g. chrome:// pages) — ignore.
    console.debug("[InPlace Transformer] message failed:", err.message);
  });
});
