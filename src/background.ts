/**
 * Service worker — open Options on first install so ChatGPT/Gemini users can
 * paste an API key before they try a bubble.
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== "install") return;
  try {
    void chrome.runtime.openOptionsPage();
  } catch {
    /* ignore */
  }
});

// Toolbar click → Options (same place as the install welcome).
chrome.action.onClicked.addListener(() => {
  try {
    void chrome.runtime.openOptionsPage();
  } catch {
    /* ignore */
  }
});
