function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === "object") {
    return { mapValue: { fields: toFirestoreFields(value) } };
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FIRESTORE_WRITE") {
    const { endpoint, payload } = message;
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: toFirestoreFields(payload) })
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          sendResponse({ ok: false, error: `Firestore write failed (${res.status}): ${text}` });
        } else {
          const data = await res.json();
          sendResponse({ ok: true, data });
        }
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === "FIRESTORE_DELETE") {
    const { endpoint } = message;
    fetch(endpoint, { method: "DELETE" })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          sendResponse({ ok: false, error: `Firestore delete failed (${res.status}): ${text}` });
        } else {
          sendResponse({ ok: true });
        }
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});
