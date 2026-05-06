// Isolated world relay: bridges postMessage from MAIN world to chrome.runtime (background worker).
window.addEventListener("message", (event) => {
  if (
    event.source !== window ||
    !event.data ||
    event.data.__nostrBridge !== "request"
  ) {
    return;
  }

  const { id, type, payload } = event.data;

  chrome.runtime.sendMessage({ type, ...payload })
    .then((response) => {
      window.postMessage({ __nostrBridge: "response", id, response }, "*");
    })
    .catch((error) => {
      window.postMessage({
        __nostrBridge: "response",
        id,
        response: { ok: false, error: error.message }
      }, "*");
    });
});
