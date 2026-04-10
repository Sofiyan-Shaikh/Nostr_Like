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
    if (isPlaceholderValue(config.apiKey) || isPlaceholderValue(config.projectId)) {
      return false;
    }
    return true;
  }

  function getCollectionName(kind) {
    const config = getConfig();
    const collections = (config && config.collections) || {};
    if (kind === "likes") return collections.likes || "nostr_like_events";
    if (kind === "profiles") return collections.profiles || "nostr_profile_scrapes";
    return "events";
  }

  function toFirestoreValue(value) {
    if (value === null || value === undefined) {
      return { nullValue: null };
    }

    if (typeof value === "string") {
      return { stringValue: value };
    }

    if (typeof value === "boolean") {
      return { booleanValue: value };
    }

    if (typeof value === "number") {
      if (Number.isInteger(value)) {
        return { integerValue: String(value) };
      }
      return { doubleValue: value };
    }

    if (Array.isArray(value)) {
      return {
        arrayValue: {
          values: value.map((item) => toFirestoreValue(item))
        }
      };
    }

    if (typeof value === "object") {
      return {
        mapValue: {
          fields: toFirestoreFields(value)
        }
      };
    }

    return { stringValue: String(value) };
  }

  function toFirestoreFields(payload) {
    const fields = {};
    for (const [key, value] of Object.entries(payload)) {
      fields[key] = toFirestoreValue(value);
    }
    return fields;
  }

  async function writeDocument(kind, payload) {
    if (!isConfigured()) {
      throw new Error("Firebase is not configured. Update extension/firebase-config.js.");
    }

    const config = getConfig();
    const collection = getCollectionName(kind);
    const database = config.firestoreDatabase || DEFAULT_DATABASE;
    const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      config.projectId
    )}/databases/${encodeURIComponent(database)}/documents/${encodeURIComponent(
      collection
    )}?key=${encodeURIComponent(config.apiKey)}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ fields: toFirestoreFields(payload) })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Firestore write failed (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  async function deleteDocumentByName(documentName) {
    if (!isConfigured()) {
      throw new Error("Firebase is not configured. Update extension/firebase-config.js.");
    }

    if (!documentName || typeof documentName !== "string") {
      throw new Error("A Firestore document name is required for delete.");
    }

    const config = getConfig();
    const encodedPath = documentName
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    const endpoint = `https://firestore.googleapis.com/v1/${encodedPath}?key=${encodeURIComponent(
      config.apiKey
    )}`;

    const response = await fetch(endpoint, {
      method: "DELETE"
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Firestore delete failed (${response.status}): ${errorText}`);
    }

    return response.text();
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
      return writeDocument("likes", withMetadata(payload));
    },
    deleteLikeEvent(documentName) {
      return deleteDocumentByName(documentName);
    },
    saveProfileScrape(payload) {
      return writeDocument("profiles", withMetadata(payload));
    }
  };
})();
