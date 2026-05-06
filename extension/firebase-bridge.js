// MAIN world replacement for firebase-client.js.
// Uses postMessage → firebase-relay.js (isolated) → background.js → fetch.
(() => {
  const DEFAULT_DATABASE = "(default)";

  function getConfig() {
    return window.NOSTR_FIREBASE_CONFIG || null;
  }

  function isPlaceholderValue(value) {
    return typeof value === "string" && value.startsWith("YOUR_");
  }

  function isConfigured() {
    const config = getConfig();
    if (!config || !config.enabled) return false;
    if (!config.apiKey || !config.projectId) return false;
    if (isPlaceholderValue(config.apiKey) || isPlaceholderValue(config.projectId)) return false;
    return true;
  }

  function getCollectionName(kind) {
    const config = getConfig();
    const collections = (config && config.collections) || {};
    if (kind === "likes") return collections.likes || "nostr_like_events";
    if (kind === "profiles") return collections.profiles || "nostr_profile_scrapes";
    return "events";
  }

  function buildWriteEndpoint(kind) {
    const config = getConfig();
    const collection = getCollectionName(kind);
    const database = config.firestoreDatabase || DEFAULT_DATABASE;
    return (
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}` +
      `/databases/${encodeURIComponent(database)}/documents/${encodeURIComponent(collection)}` +
      `?key=${encodeURIComponent(config.apiKey)}`
    );
  }

  function buildDeleteEndpoint(documentName) {
    const config = getConfig();
    const encodedPath = documentName
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    return `https://firestore.googleapis.com/v1/${encodedPath}?key=${encodeURIComponent(config.apiKey)}`;
  }

  function sendToBackground(type, payload) {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2);

      function handler(event) {
        if (
          event.source !== window ||
          !event.data ||
          event.data.__nostrBridge !== "response" ||
          event.data.id !== id
        ) {
          return;
        }
        window.removeEventListener("message", handler);
        const { response } = event.data;
        if (!response || !response.ok) {
          reject(new Error((response && response.error) || "Background request failed"));
        } else {
          resolve(response.data);
        }
      }

      window.addEventListener("message", handler);
      window.postMessage({ __nostrBridge: "request", id, type, payload }, "*");
    });
  }

  function withMetadata(payload) {
    return {
      ...payload,
      created_at_iso: new Date().toISOString(),
      created_at_ms: Date.now()
    };
  }

  window.nostrFirebase = {
    isConfigured,
    saveLikeEvent(payload) {
      if (!isConfigured()) {
        return Promise.reject(new Error("Firebase is not configured. Update extension/firebase-config.js."));
      }
      return sendToBackground("FIRESTORE_WRITE", {
        endpoint: buildWriteEndpoint("likes"),
        payload: withMetadata(payload)
      });
    },
    deleteLikeEvent(documentName) {
      if (!isConfigured()) {
        return Promise.reject(new Error("Firebase is not configured. Update extension/firebase-config.js."));
      }
      return sendToBackground("FIRESTORE_DELETE", {
        endpoint: buildDeleteEndpoint(documentName)
      });
    },
    saveProfileScrape(payload) {
      if (!isConfigured()) {
        return Promise.reject(new Error("Firebase is not configured. Update extension/firebase-config.js."));
      }
      return sendToBackground("FIRESTORE_WRITE", {
        endpoint: buildWriteEndpoint("profiles"),
        payload: withMetadata(payload)
      });
    }
  };
})();
