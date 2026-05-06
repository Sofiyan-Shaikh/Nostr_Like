(() => {
  const config = window.NOSTR_FIREBASE_CONFIG;

  function isConfigured() {
    return (
      config &&
      config.enabled &&
      config.apiKey &&
      config.projectId &&
      !config.apiKey.startsWith("YOUR_")
    );
  }

  function collectionUrl(collectionName) {
    const db = config.firestoreDatabase || "(default)";
    return (
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}` +
      `/databases/${encodeURIComponent(db)}/documents/${encodeURIComponent(collectionName)}` +
      `?key=${encodeURIComponent(config.apiKey)}&pageSize=100`
    );
  }

  function fromValue(v) {
    if (!v) return null;
    if ("stringValue" in v) return v.stringValue;
    if ("booleanValue" in v) return v.booleanValue;
    if ("integerValue" in v) return parseInt(v.integerValue, 10);
    if ("doubleValue" in v) return v.doubleValue;
    if ("nullValue" in v) return null;
    if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromValue);
    if ("mapValue" in v) return fromFields(v.mapValue.fields || {});
    return null;
  }

  function fromFields(fields) {
    const obj = {};
    for (const [key, val] of Object.entries(fields)) {
      obj[key] = fromValue(val);
    }
    return obj;
  }

  async function fetchDocs(collectionName) {
    const res = await fetch(collectionUrl(collectionName));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (!body.documents) return [];
    return body.documents
      .map((doc) => ({
        _id: doc.name.split("/").pop(),
        ...fromFields(doc.fields || {}),
        _createTime: doc.createTime
      }))
      .sort((a, b) => (b.created_at_ms || 0) - (a.created_at_ms || 0));
  }

  function fmt(iso) {
    if (!iso) return "";
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  }

  function truncate(str, max) {
    if (!str) return "";
    return str.length > max ? str.slice(0, max) + "…" : str;
  }

  function safe(val) {
    return val && val !== "(not found)" && val !== "(not resolved)" && val !== "unknown" && val !== "none";
  }

  // ── List cards ────────────────────────────────────────────────────────────

  function likesCard(doc) {
    const el = document.createElement("div");
    el.className = "card";
    const handle = doc.author_handle || "Unknown";
    const url = doc.tweet_url || doc.page_url || "";
    const shortUrl = url.replace("https://x.com/", "x.com/");
    el.innerHTML = `
      <div class="card-handle">${handle}</div>
      ${url ? `<a class="card-link" href="${url}" target="_blank">${truncate(shortUrl, 48)}</a>` : ""}
      <div class="card-date">${fmt(doc.created_at_iso)}</div>
    `;
    return el;
  }

  function profilesCard(doc) {
    const el = document.createElement("div");
    el.className = "card card--clickable";
    const handle = doc.handle || "Unknown";
    const name = doc.display_name ? `(${doc.display_name})` : "";
    const tag = doc.relevance_tag || "";
    const conf = doc.confidence || "";
    const idType = doc.identifier_type || "";
    const idVal = doc.identifier_value || "";
    const tagClass = tag.includes("bitcoin") ? "tag-btc" : "tag-nostr";
    el.innerHTML = `
      <div class="card-handle">${handle} <span class="card-name">${name}</span></div>
      ${safe(idVal) ? `<div class="card-identifier">${idType}: <code>${truncate(idVal, 28)}</code></div>` : ""}
      <div class="card-meta">
        ${tag && tag !== "unknown" ? `<span class="tag ${tagClass}">${tag}</span>` : ""}
        ${conf && conf !== "none" ? `<span class="confidence conf-${conf}">${conf}</span>` : ""}
      </div>
      <div class="card-date">${fmt(doc.created_at_iso)}</div>
      <div class="card-arrow">›</div>
    `;
    el.addEventListener("click", () => showDetail(doc));
    return el;
  }

  // ── Detail view ───────────────────────────────────────────────────────────

  function row(label, value, isCode = false, isFull = false) {
    if (!value && value !== false && value !== 0) return "";
    const displayVal = isCode
      ? `<code class="${isFull ? "code-full" : ""}">${value}</code>`
      : `<span>${value}</span>`;
    return `
      <div class="detail-row">
        <div class="detail-label">${label}</div>
        <div class="detail-value">${displayVal}</div>
      </div>
    `;
  }

  function copyRow(label, value) {
    if (!value || !safe(value)) return "";
    const short = truncate(value, 32);
    return `
      <div class="detail-row">
        <div class="detail-label">${label}</div>
        <div class="detail-value detail-value--copy">
          <code class="code-full">${short}</code>
          <button class="copy-btn" data-copy="${value}" title="Copy">⎘</button>
        </div>
      </div>
    `;
  }

  function linkRow(label, url) {
    if (!url) return "";
    return `
      <div class="detail-row">
        <div class="detail-label">${label}</div>
        <div class="detail-value">
          <a class="detail-link" href="${url}" target="_blank">${truncate(url.replace("https://", ""), 44)}</a>
        </div>
      </div>
    `;
  }

  function badgeRow(label, tag, conf) {
    const parts = [];
    if (tag && tag !== "unknown") {
      const cls = tag.includes("bitcoin") ? "tag-btc" : "tag-nostr";
      parts.push(`<span class="tag ${cls}">${tag}</span>`);
    }
    if (conf && conf !== "none") {
      parts.push(`<span class="confidence conf-${conf}">${conf}</span>`);
    }
    if (!parts.length) return "";
    return `
      <div class="detail-row">
        <div class="detail-label">${label}</div>
        <div class="detail-value detail-value--badges">${parts.join("")}</div>
      </div>
    `;
  }

  function evidenceSection(sourceEvidence) {
    if (!Array.isArray(sourceEvidence) || sourceEvidence.length === 0) return "";
    const items = sourceEvidence.map((e) => {
      const keywords = [
        ...(e.nostr_keywords || []).map((k) => `<span class="kw kw-nostr">${k}</span>`),
        ...(e.bitcoin_keywords || []).map((k) => `<span class="kw kw-btc">${k}</span>`)
      ].join("");
      const text = e.text ? `<div class="ev-text">${truncate(e.text, 80)}</div>` : "";
      return `
        <div class="ev-item">
          <div class="ev-label">${e.label || e.type}</div>
          ${text}
          ${keywords ? `<div class="ev-keywords">${keywords}</div>` : ""}
        </div>
      `;
    }).join("");
    return `
      <div class="detail-section-title">Source evidence</div>
      <div class="ev-list">${items}</div>
    `;
  }

  function showDetail(doc) {
    const mainView = document.getElementById("main-view");
    const detailView = document.getElementById("detail-view");
    const titleEl = document.getElementById("detail-title");
    const bodyEl = document.getElementById("detail-body");

    const handle = doc.handle || "Unknown";
    const name = doc.display_name || "";
    titleEl.textContent = name ? `${handle} (${name})` : handle;

    const tag = doc.relevance_tag || "";
    const conf = doc.confidence || "";
    const npub = doc.npub || "";
    const hex = doc.pubkey_hex || "";
    const idType = doc.identifier_type || "";
    const idVal = doc.identifier_value || "";
    const bio = doc.bio || "";
    const location = doc.location || "";
    const profileUrl = doc.profile_url || doc.linked_tweet_url || "";
    const linkedTweet = doc.linked_tweet_url || "";
    const source = doc.source || "";
    const nostrHits = doc.nostr_keyword_hits;
    const btcHits = doc.bitcoin_keyword_hits;
    const keepProfile = doc.keep_profile;
    const needsReview = doc.needs_manual_review;
    const sourceEvidence = doc.source_evidence;

    bodyEl.innerHTML = [
      `<div class="detail-section-title">Identity</div>`,
      row("Handle", handle),
      row("Display name", name),
      badgeRow("Relevance / Confidence", tag, conf),
      copyRow("npub", npub),
      copyRow("pubkey hex", hex),
      row("Identifier type", idType),
      copyRow("Identifier value", idVal),

      (bio || location || doc.profile_url) ? `<div class="detail-section-title">Profile</div>` : "",
      bio ? `<div class="detail-row detail-row--bio"><div class="detail-label">Bio</div><div class="detail-value detail-bio">${bio}</div></div>` : "",
      row("Location", location),
      linkRow("Profile URL", doc.profile_url),

      (nostrHits !== undefined || btcHits !== undefined || keepProfile !== undefined)
        ? `<div class="detail-section-title">Signals</div>` : "",
      row("Nostr keyword hits", nostrHits),
      row("Bitcoin keyword hits", btcHits),
      keepProfile !== undefined ? row("Keep profile", keepProfile ? "Yes" : "No") : "",
      needsReview ? row("Needs manual review", "Yes (NIP-05 unresolved)") : "",

      (linkedTweet || source) ? `<div class="detail-section-title">Source</div>` : "",
      row("Saved from", source === "like_auto_scrape" ? "Like button click" : source === "manual" ? "Manual scrape" : source),
      linkRow("Linked tweet", linkedTweet),
      row("Saved at", fmt(doc.created_at_iso)),

      evidenceSection(sourceEvidence)
    ].join("");

    // Wire up copy buttons
    bodyEl.querySelectorAll(".copy-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        navigator.clipboard.writeText(btn.dataset.copy).then(() => {
          btn.textContent = "✓";
          setTimeout(() => { btn.textContent = "⎘"; }, 1400);
        });
      });
    });

    mainView.classList.add("hidden");
    detailView.classList.remove("hidden");
  }

  function showMain() {
    document.getElementById("detail-view").classList.add("hidden");
    document.getElementById("main-view").classList.remove("hidden");
  }

  // ── Tab loading ───────────────────────────────────────────────────────────

  async function loadTab(tabName) {
    const cols = config.collections || {};
    const collectionName =
      tabName === "likes"
        ? cols.likes || "nostr_like_events"
        : cols.profiles || "nostr_profile_scrapes";

    const loadingEl = document.getElementById(`${tabName}-loading`);
    const listEl = document.getElementById(`${tabName}-list`);
    const emptyEl = document.getElementById(`${tabName}-empty`);
    const errorEl = document.getElementById(`${tabName}-error`);

    loadingEl.classList.remove("hidden");
    listEl.innerHTML = "";
    emptyEl.classList.add("hidden");
    errorEl.classList.add("hidden");

    try {
      const docs = await fetchDocs(collectionName);
      loadingEl.classList.add("hidden");
      if (docs.length === 0) {
        emptyEl.classList.remove("hidden");
        return;
      }
      docs.forEach((doc) => {
        listEl.appendChild(tabName === "likes" ? likesCard(doc) : profilesCard(doc));
      });
    } catch (err) {
      loadingEl.classList.add("hidden");
      errorEl.classList.remove("hidden");
      errorEl.textContent = `Error: ${err.message}`;
    }
  }

  function activateTab(tabName) {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.add("hidden"));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");
    document.getElementById(`${tabName}-panel`).classList.remove("hidden");
    loadTab(tabName);
  }

  // ── Boot ──────────────────────────────────────────────────────────────────

  function init() {
    if (!isConfigured()) {
      document.getElementById("app").innerHTML = `
        <div class="not-configured">
          <p>⚠ Firebase not configured.</p>
          <p>Set <code>enabled: true</code> and real credentials in <code>firebase-config.js</code>, then reload the extension.</p>
        </div>
      `;
      return;
    }

    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => activateTab(btn.dataset.tab));
    });

    document.getElementById("back-btn").addEventListener("click", showMain);

    activateTab("likes");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
