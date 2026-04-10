const HOST_ATTR = "data-nostr-like-host";
const PROFILE_HOST_ATTR = "data-nostr-like-profile-host";
const PROFILE_INLINE_HOST_ATTR = "data-nostr-like-profile-inline-host";
const ACTION_CONTAINER_CLASS = "nostr-like-action-container";
const ACTION_BAR_SELECTOR = 'div[role="group"], div[role="toolbar"]';
const PROFILE_ACTIONS_SELECTOR = 'div[data-testid="userActions"]';
const PRIMARY_COLUMN_SELECTOR = 'div[data-testid="primaryColumn"]';
const PROFILE_HEADER_ANCHOR_SELECTORS = [
  '[data-testid="UserName"]',
  '[data-testid="UserDescription"]',
  '[data-testid="UserProfileHeader_Items"]'
];
const ACTION_BUTTON_SELECTOR =
  '[data-testid="reply"], [data-testid="retweet"], [data-testid="unretweet"], [data-testid="like"], [data-testid="unlike"]';
const PROFILE_TAB_SEGMENTS = new Set([
  "with_replies",
  "media",
  "likes",
  "highlights",
  "articles",
  "followers",
  "following",
  "verified_followers"
]);
const RESERVED_PROFILE_PATHS = new Set([
  "home",
  "explore",
  "notifications",
  "messages",
  "bookmarks",
  "lists",
  "communities",
  "premium",
  "verified-choose",
  "settings",
  "i",
  "search",
  "tos",
  "privacy",
  "about",
  "help",
  "compose",
  "intent"
]);
const SAVED_TWEETS_STORAGE_KEY = "nostr_like_saved_tweets_v1";
const SAVED_TWEET_DOCS_STORAGE_KEY = "nostr_like_saved_docs_v1";
const RELEVANT_HANDLES_STORAGE_KEY = "nostr_like_relevant_handles_v1";
const savedTweetKeys = loadSavedTweetKeys();
const savedTweetDocs = loadSavedTweetDocs();
const relevantHandles = loadRelevantHandles();
let cachedProfileSignalsKey = "";
let cachedProfileSignals = null;

function loadSavedTweetKeys() {
  try {
    const raw = window.localStorage.getItem(SAVED_TWEETS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item) => typeof item === "string" && item.length > 0));
  } catch (error) {
    return new Set();
  }
}

function persistSavedTweetKeys() {
  try {
    window.localStorage.setItem(SAVED_TWEETS_STORAGE_KEY, JSON.stringify([...savedTweetKeys]));
  } catch (error) {
    // Ignore localStorage failures (privacy mode/storage limits).
  }
}

function loadSavedTweetDocs() {
  try {
    const raw = window.localStorage.getItem(SAVED_TWEET_DOCS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, value]) => typeof key === "string" && typeof value === "string" && value.length > 0
      )
    );
  } catch (error) {
    return {};
  }
}

function persistSavedTweetDocs() {
  try {
    window.localStorage.setItem(SAVED_TWEET_DOCS_STORAGE_KEY, JSON.stringify(savedTweetDocs));
  } catch (error) {
    // Ignore localStorage failures (privacy mode/storage limits).
  }
}

function loadRelevantHandles() {
  try {
    const raw = window.localStorage.getItem(RELEVANT_HANDLES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, value]) =>
          typeof key === "string" &&
          key.startsWith("@") &&
          value &&
          typeof value === "object" &&
          typeof value.relevance_tag === "string"
      )
    );
  } catch (error) {
    return {};
  }
}

function persistRelevantHandles() {
  try {
    window.localStorage.setItem(RELEVANT_HANDLES_STORAGE_KEY, JSON.stringify(relevantHandles));
  } catch (error) {
    // Ignore localStorage failures (privacy mode/storage limits).
  }
}

function normalizeHandle(handle) {
  if (typeof handle !== "string" || !handle.trim()) return "";
  const value = handle.trim().toLowerCase();
  return value.startsWith("@") ? value : `@${value}`;
}

function rememberRelevantHandle(handle, relevanceTag) {
  const normalized = normalizeHandle(handle);
  if (!normalized) return;
  const tag = typeof relevanceTag === "string" ? relevanceTag : "";
  relevantHandles[normalized] = {
    relevance_tag: tag,
    updated_at_iso: new Date().toISOString()
  };
  persistRelevantHandles();
}

function isRememberedRelevantHandle(handle) {
  const normalized = normalizeHandle(handle);
  if (!normalized) return false;
  return Boolean(relevantHandles[normalized]);
}

function buildTweetStateKey(context) {
  if (context && context.tweet_id) return `tweet:${context.tweet_id}`;
  if (context && context.tweet_url) return `url:${context.tweet_url}`;
  return `page:${window.location.href}`;
}

function buildProfileStateKey(handle) {
  const normalized = normalizeHandle(handle);
  return normalized ? `profile:${normalized}` : `profile:${window.location.pathname}`;
}

function buildButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "nostr-like-button";
  button.setAttribute("aria-label", "Nostr Like");
  button.innerHTML = '<span class="nostr-like-icon">⚡</span><span class="nostr-like-label">Nostr Like</span>';
  return button;
}

function isolateEvent(event) {
  if (typeof event.stopImmediatePropagation === "function") {
    event.stopImmediatePropagation();
  }
  event.stopPropagation();
}

function isolateClickEvent(event) {
  event.preventDefault();
  if (typeof event.stopImmediatePropagation === "function") {
    event.stopImmediatePropagation();
  }
  event.stopPropagation();
}

function attachButtonIsolation(button) {
  const isolatedEvents = [
    "pointerdown",
    "pointerup",
    "mousedown",
    "mouseup",
    "touchstart",
    "touchend",
    "dblclick",
    "keydown",
    "keyup"
  ];

  isolatedEvents.forEach((eventName) => {
    button.addEventListener(eventName, isolateEvent, true);
  });
}

function setButtonState(button, state, labelText, titleText) {
  button.dataset.nostrState = state;
  button.classList.remove(
    "nostr-like-button--loading",
    "nostr-like-button--success",
    "nostr-like-button--error",
    "nostr-like-button--idle"
  );
  button.classList.add(`nostr-like-button--${state}`);

  const labelNode = button.querySelector(".nostr-like-label");
  if (labelNode) {
    labelNode.textContent = labelText;
  }

  const iconNode = button.querySelector(".nostr-like-icon");
  if (iconNode) {
    const iconMap = {
      idle: "⚡",
      loading: "…",
      success: "✅",
      error: "⚠"
    };
    iconNode.textContent = iconMap[state] || "⚡";
  }

  if (titleText) {
    button.title = titleText;
  } else {
    button.removeAttribute("title");
  }

  button.setAttribute("aria-pressed", state === "success" ? "true" : "false");
}

function resetButtonState(button) {
  button.disabled = false;
  delete button.dataset.saved;
  delete button.dataset.documentName;
  setButtonState(button, "idle", "Nostr Like", "Save this interaction to Firebase");
}

function setSavedButtonState(button, documentName, titleText) {
  button.disabled = false;
  button.dataset.saved = "true";
  if (documentName) {
    button.dataset.documentName = documentName;
  }
  setButtonState(button, "success", "Saved", titleText || "Saved to Firestore");
}

function isTweetActionBar(actionBar) {
  return Boolean(actionBar.querySelector(ACTION_BUTTON_SELECTOR));
}

function findLikeButton(actionBar) {
  return actionBar.querySelector('[data-testid="like"], [data-testid="unlike"]');
}

function findRetweetButton(actionBar) {
  return actionBar.querySelector('[data-testid="retweet"], [data-testid="unretweet"]');
}

function findTopLevelActionSlot(node, actionBar) {
  let current = node;
  while (current && current.parentElement && current.parentElement !== actionBar) {
    current = current.parentElement;
  }
  return current && current.parentElement === actionBar ? current : null;
}

function extractTweetContext(actionBar) {
  const fallback = {
    tweet_url: window.location.href,
    tweet_id: null,
    author_handle: null
  };

  const article = actionBar.closest("article");
  if (!article) return fallback;

  const statusAnchors = Array.from(article.querySelectorAll('a[href*="/status/"]'));
  if (statusAnchors.length === 0) return fallback;
  const statusAnchor =
    statusAnchors.find((anchor) => Boolean(anchor.querySelector("time"))) || statusAnchors[0];
  if (!statusAnchor) return fallback;

  try {
    const absoluteUrl = new URL(statusAnchor.getAttribute("href"), window.location.origin).toString();
    const match = absoluteUrl.match(/x\.com\/([^/]+)\/status\/(\d+)/i);
    if (!match) {
      return {
        tweet_url: absoluteUrl,
        tweet_id: null,
        author_handle: null
      };
    }

    return {
      tweet_url: absoluteUrl,
      tweet_id: match[2],
      author_handle: `@${match[1]}`
    };
  } catch (error) {
    return fallback;
  }
}

function getCurrentStatusRoute() {
  const match = window.location.pathname.match(/^\/([^/]+)\/status\/(\d+)/i);
  if (!match) return null;
  return {
    tweet_id: match[2],
    author_handle: `@${match[1]}`
  };
}

function isIndividualTweetPage() {
  return Boolean(getCurrentStatusRoute());
}

function getCurrentProfileRoute() {
  if (getCurrentStatusRoute()) return null;

  const match = window.location.pathname.match(/^\/([^/]+?)(?:\/([^/]+))?\/?$/i);
  if (!match) return null;

  const handle = match[1];
  const section = match[2] || "";
  if (!handle || RESERVED_PROFILE_PATHS.has(handle.toLowerCase())) return null;
  if (section && !PROFILE_TAB_SEGMENTS.has(section.toLowerCase())) return null;

  return {
    handle: `@${handle}`,
    tab: section || "posts"
  };
}

function isSupportedPage() {
  return Boolean(
    getCurrentStatusRoute() ||
      getCurrentProfileRoute() ||
      Object.keys(relevantHandles).length > 0
  );
}

function isRelevantProfileSignals(signals) {
  if (!signals || typeof signals !== "object") return false;
  if (signals.keep_profile) return true;
  return typeof signals.relevance_tag === "string" && signals.relevance_tag !== "unknown";
}

function readCurrentProfileSignals() {
  const route = getCurrentProfileRoute();
  if (!route) return null;

  const cacheKey = `${route.handle}:${window.location.pathname}`;
  if (cachedProfileSignalsKey === cacheKey && isRelevantProfileSignals(cachedProfileSignals)) {
    return cachedProfileSignals;
  }

  if (typeof window.analyzeProfilePubkeySignals !== "function") {
    return null;
  }

  try {
    cachedProfileSignals = window.analyzeProfilePubkeySignals({
      includeTimeline: true,
      maxTimelineTweets: 3
    });
    if (isRelevantProfileSignals(cachedProfileSignals)) {
      rememberRelevantHandle(route.handle, cachedProfileSignals.relevance_tag || "");
    }
    cachedProfileSignalsKey = cacheKey;
    return cachedProfileSignals;
  } catch (error) {
    console.error("Nostr profile analysis failed", error);
    cachedProfileSignals = null;
    cachedProfileSignalsKey = cacheKey;
    return null;
  }
}

function shouldInjectIntoActionBar(actionBar) {
  const context = extractTweetContext(actionBar);
  if (!context || !context.tweet_id) return false;
  const authorHandle = normalizeHandle(context.author_handle);

  const statusRoute = getCurrentStatusRoute();
  if (statusRoute) {
    return context.tweet_id === statusRoute.tweet_id;
  }

  const profileRoute = getCurrentProfileRoute();
  if (!profileRoute) {
    return isRememberedRelevantHandle(authorHandle);
  }

  if (!authorHandle) return false;
  if (authorHandle !== normalizeHandle(profileRoute.handle)) return false;

  const profileSignals = readCurrentProfileSignals();
  if (isRelevantProfileSignals(profileSignals)) return true;
  return isRememberedRelevantHandle(authorHandle);
}

function shouldInjectIntoProfile() {
  const route = getCurrentProfileRoute();
  if (!route) return false;
  const profileSignals = readCurrentProfileSignals();
  if (isRelevantProfileSignals(profileSignals)) {
    return true;
  }
  return isRememberedRelevantHandle(route.handle);
}

function syncNostrButtonState(actionBar, button, context) {
  if (!button) return;
  const stateKey = buildTweetStateKey(context || extractTweetContext(actionBar));
  button.dataset.tweetKey = stateKey;
  const documentName = savedTweetDocs[stateKey];

  if (button.dataset.saved === "true" || savedTweetKeys.has(stateKey)) {
    setSavedButtonState(button, documentName);
    return;
  }

  resetButtonState(button);
}

function findNostrButton(actionBar) {
  return actionBar.querySelector(`[${HOST_ATTR}="true"] .nostr-like-button`);
}

function findProfileNostrButton(profileActions) {
  return profileActions.querySelector(`[${PROFILE_HOST_ATTR}="true"] .nostr-like-button`);
}

function findInlineProfileNostrButton() {
  return document.querySelector(`[${PROFILE_INLINE_HOST_ATTR}="true"] .nostr-like-button`);
}

function isInsideTweet(node) {
  return Boolean(node && typeof node.closest === "function" && node.closest("article"));
}

function getPrimaryColumn() {
  return document.querySelector(PRIMARY_COLUMN_SELECTOR);
}

function findProfileInlineAnchor() {
  const primaryColumn = getPrimaryColumn();
  const searchRoot = primaryColumn || document;

  for (const selector of PROFILE_HEADER_ANCHOR_SELECTORS) {
    const candidates = Array.from(searchRoot.querySelectorAll(selector)).filter((node) => {
      if (isInsideTweet(node)) return false;
      if (primaryColumn && !primaryColumn.contains(node)) return false;
      return true;
    });

    if (candidates.length > 0) {
      return candidates[0];
    }
  }

  return null;
}

function getProfileIndicatorText(route, profileSignals) {
  const tag = profileSignals && typeof profileSignals.relevance_tag === "string"
    ? profileSignals.relevance_tag
    : "";

  if (tag === "bitcoin+nostr") return "Bitcoin + Nostr";
  if (tag === "nostr") return "Nostr User";
  if (tag === "bitcoin") return "Bitcoin User";
  if (route && isRememberedRelevantHandle(route.handle)) return "Known Nostr User";
  return "Relevant Profile";
}

function scheduleStateSync(actionBar) {
  const button = findNostrButton(actionBar);
  if (!button) return;
  requestAnimationFrame(() => syncNostrButtonState(actionBar, button));
}

async function handleNostrLikeClick(button, actionBar) {
  if (button.disabled) return;

  const context = extractTweetContext(actionBar);
  const stateKey = buildTweetStateKey(context);
  button.dataset.tweetKey = stateKey;
  const documentName = savedTweetDocs[stateKey] || button.dataset.documentName || "";

  if (savedTweetKeys.has(stateKey) || button.dataset.saved === "true") {
    if (!window.nostrFirebase || typeof window.nostrFirebase.deleteLikeEvent !== "function") {
      setButtonState(button, "error", "No Client", "firebase-client.js delete method was not loaded");
      setTimeout(() => syncNostrButtonState(actionBar, button, context), 2200);
      return;
    }

    if (!window.nostrFirebase.isConfigured()) {
      setButtonState(button, "error", "Configure", "Update extension/firebase-config.js and set enabled: true");
      setTimeout(() => syncNostrButtonState(actionBar, button, context), 2200);
      return;
    }

    if (!documentName) {
      setButtonState(button, "error", "No Doc", "No saved Firestore document was found for this tweet");
      setTimeout(() => syncNostrButtonState(actionBar, button, context), 2200);
      return;
    }

    button.disabled = true;
    setButtonState(button, "loading", "Unsaving...", "Removing saved event from Firestore");

    try {
      await window.nostrFirebase.deleteLikeEvent(documentName);
      savedTweetKeys.delete(stateKey);
      delete savedTweetDocs[stateKey];
      persistSavedTweetKeys();
      persistSavedTweetDocs();
      resetButtonState(button);
    } catch (error) {
      console.error("Nostr Like unsave failed", error);
      const message = error instanceof Error ? error.message : "Firestore delete failed";
      button.disabled = false;
      setButtonState(button, "error", "Retry", message);
      setTimeout(() => syncNostrButtonState(actionBar, button, context), 2200);
    }

    return;
  }

  if (!window.nostrFirebase || typeof window.nostrFirebase.saveLikeEvent !== "function") {
    setButtonState(button, "error", "No Client", "firebase-client.js was not loaded");
    setTimeout(() => resetButtonState(button), 1800);
    return;
  }

  if (!window.nostrFirebase.isConfigured()) {
    setButtonState(button, "error", "Configure", "Update extension/firebase-config.js and set enabled: true");
    setTimeout(() => resetButtonState(button), 2200);
    return;
  }

  const payload = {
    ...context,
    page_url: window.location.href,
    page_title: document.title
  };
  const profileSignals = readCurrentProfileSignals();
  if (isRelevantProfileSignals(profileSignals)) {
    payload.profile_handle = profileSignals.handle || "";
    payload.profile_relevance_tag = profileSignals.relevance_tag || "";
    payload.profile_identifier_type = profileSignals.identifier_type || "";
    payload.profile_identifier_value = profileSignals.identifier_value || "";
    payload.profile_npub =
      profileSignals.npub && profileSignals.npub !== "(not found)" ? profileSignals.npub : "";
    payload.profile_pubkey_hex =
      profileSignals.pubkey_hex && profileSignals.pubkey_hex !== "(not resolved)"
        ? profileSignals.pubkey_hex
        : "";
  }
  button.disabled = true;
  setButtonState(button, "loading", "Saving...", "Writing event to Firestore");

  try {
    const result = await window.nostrFirebase.saveLikeEvent(payload);
    savedTweetKeys.add(stateKey);
    if (result && result.name) {
      savedTweetDocs[stateKey] = result.name;
      button.dataset.documentName = result.name;
    }
    persistSavedTweetKeys();
    persistSavedTweetDocs();
    setSavedButtonState(
      button,
      result && result.name ? result.name : "",
      result && result.name ? result.name : "Saved to Firestore"
    );
  } catch (error) {
    console.error("Nostr Like save failed", error);
    const message = error instanceof Error ? error.message : "Firestore write failed";
    button.disabled = false;
    setButtonState(button, "error", "Retry", message);
    setTimeout(() => syncNostrButtonState(actionBar, button, context), 2200);
  }
}

function syncProfileNostrButtonState(button, route) {
  if (!button) return;
  const stateKey = buildProfileStateKey(route && route.handle);
  button.dataset.tweetKey = stateKey;
  const documentName = savedTweetDocs[stateKey];

  if (button.dataset.saved === "true" || savedTweetKeys.has(stateKey)) {
    setSavedButtonState(button, documentName, "Saved profile to Firestore");
    return;
  }

  button.disabled = false;
  delete button.dataset.saved;
  delete button.dataset.documentName;
  setButtonState(button, "idle", "Nostr Profile", "Save this profile to Firebase");
}

async function handleProfileNostrLikeClick(button) {
  if (button.disabled) return;

  const route = getCurrentProfileRoute();
  if (!route) {
    setButtonState(button, "error", "No Profile", "Open a profile page to save profile data");
    setTimeout(() => syncProfileNostrButtonState(button, route), 2200);
    return;
  }

  const stateKey = buildProfileStateKey(route.handle);
  button.dataset.tweetKey = stateKey;
  const documentName = savedTweetDocs[stateKey] || button.dataset.documentName || "";

  if (savedTweetKeys.has(stateKey) || button.dataset.saved === "true") {
    if (!window.nostrFirebase || typeof window.nostrFirebase.deleteLikeEvent !== "function") {
      setButtonState(button, "error", "No Client", "firebase-client.js delete method was not loaded");
      setTimeout(() => syncProfileNostrButtonState(button, route), 2200);
      return;
    }

    if (!window.nostrFirebase.isConfigured()) {
      setButtonState(button, "error", "Configure", "Update extension/firebase-config.js and set enabled: true");
      setTimeout(() => syncProfileNostrButtonState(button, route), 2200);
      return;
    }

    if (!documentName) {
      setButtonState(button, "error", "No Doc", "No saved Firestore document was found for this profile");
      setTimeout(() => syncProfileNostrButtonState(button, route), 2200);
      return;
    }

    button.disabled = true;
    setButtonState(button, "loading", "Unsaving...", "Removing saved profile from Firestore");

    try {
      await window.nostrFirebase.deleteLikeEvent(documentName);
      savedTweetKeys.delete(stateKey);
      delete savedTweetDocs[stateKey];
      persistSavedTweetKeys();
      persistSavedTweetDocs();
      syncProfileNostrButtonState(button, route);
    } catch (error) {
      console.error("Nostr profile unsave failed", error);
      const message = error instanceof Error ? error.message : "Firestore delete failed";
      button.disabled = false;
      setButtonState(button, "error", "Retry", message);
      setTimeout(() => syncProfileNostrButtonState(button, route), 2200);
    }

    return;
  }

  if (!window.nostrFirebase || typeof window.nostrFirebase.saveLikeEvent !== "function") {
    setButtonState(button, "error", "No Client", "firebase-client.js was not loaded");
    setTimeout(() => syncProfileNostrButtonState(button, route), 1800);
    return;
  }

  if (!window.nostrFirebase.isConfigured()) {
    setButtonState(button, "error", "Configure", "Update extension/firebase-config.js and set enabled: true");
    setTimeout(() => syncProfileNostrButtonState(button, route), 2200);
    return;
  }

  const profileSignals = readCurrentProfileSignals();
  if (isRelevantProfileSignals(profileSignals)) {
    rememberRelevantHandle(route.handle, profileSignals.relevance_tag || "");
  }

  const payload = {
    entity_type: "profile",
    profile_handle: route.handle || "",
    profile_url: window.location.href,
    page_title: document.title,
    profile_relevance_tag: profileSignals && profileSignals.relevance_tag ? profileSignals.relevance_tag : "",
    profile_identifier_type: profileSignals && profileSignals.identifier_type ? profileSignals.identifier_type : "",
    profile_identifier_value: profileSignals && profileSignals.identifier_value ? profileSignals.identifier_value : "",
    profile_npub:
      profileSignals && profileSignals.npub && profileSignals.npub !== "(not found)"
        ? profileSignals.npub
        : "",
    profile_pubkey_hex:
      profileSignals && profileSignals.pubkey_hex && profileSignals.pubkey_hex !== "(not resolved)"
        ? profileSignals.pubkey_hex
        : ""
  };

  button.disabled = true;
  setButtonState(button, "loading", "Saving...", "Writing profile event to Firestore");

  try {
    const result = await window.nostrFirebase.saveLikeEvent(payload);
    savedTweetKeys.add(stateKey);
    if (result && result.name) {
      savedTweetDocs[stateKey] = result.name;
      button.dataset.documentName = result.name;
    }
    persistSavedTweetKeys();
    persistSavedTweetDocs();
    setSavedButtonState(
      button,
      result && result.name ? result.name : "",
      result && result.name ? result.name : "Saved profile to Firestore"
    );
  } catch (error) {
    console.error("Nostr profile save failed", error);
    const message = error instanceof Error ? error.message : "Firestore write failed";
    button.disabled = false;
    setButtonState(button, "error", "Retry", message);
    setTimeout(() => syncProfileNostrButtonState(button, route), 2200);
  }
}

function buildActionHost(actionBar) {
  // Mirror X action-slot sizing so layout remains stable.
  const wrapper = document.createElement("div");
  wrapper.className = ACTION_CONTAINER_CLASS;
  wrapper.setAttribute(HOST_ATTR, "true");

  const inner = document.createElement("div");
  inner.className = "nostr-like-inner";

  const button = buildButton();
  attachButtonIsolation(button);
  const context = extractTweetContext(actionBar);
  syncNostrButtonState(actionBar, button, context);
  button.addEventListener("click", (event) => {
    isolateClickEvent(event);
    handleNostrLikeClick(button, actionBar);
  }, true);

  inner.appendChild(button);
  wrapper.appendChild(inner);
  return wrapper;
}

function buildProfileActionHost(profileActions) {
  const wrapper = document.createElement("div");
  wrapper.className = ACTION_CONTAINER_CLASS;
  wrapper.setAttribute(PROFILE_HOST_ATTR, "true");

  const inner = document.createElement("div");
  inner.className = "nostr-like-inner";

  const button = buildButton();
  attachButtonIsolation(button);
  const route = getCurrentProfileRoute();
  syncProfileNostrButtonState(button, route);
  button.addEventListener(
    "click",
    (event) => {
      isolateClickEvent(event);
      handleProfileNostrLikeClick(button);
    },
    true
  );

  inner.appendChild(button);
  wrapper.appendChild(inner);
  return wrapper;
}

function buildInlineProfileHost() {
  const wrapper = document.createElement("div");
  wrapper.className = "nostr-like-profile-inline-container";
  wrapper.setAttribute(PROFILE_INLINE_HOST_ATTR, "true");

  const route = getCurrentProfileRoute();
  const profileSignals = readCurrentProfileSignals();

  const badge = document.createElement("div");
  badge.className = "nostr-like-profile-badge";
  badge.textContent = getProfileIndicatorText(route, profileSignals);

  const button = buildButton();
  attachButtonIsolation(button);
  syncProfileNostrButtonState(button, route);
  button.addEventListener(
    "click",
    (event) => {
      isolateClickEvent(event);
      handleProfileNostrLikeClick(button);
    },
    true
  );

  wrapper.appendChild(badge);
  wrapper.appendChild(button);
  return wrapper;
}

function removeInjectedButtons() {
  const hosts = document.querySelectorAll(`[${HOST_ATTR}="true"]`);
  hosts.forEach((host) => host.remove());
  const profileHosts = document.querySelectorAll(`[${PROFILE_HOST_ATTR}="true"]`);
  profileHosts.forEach((host) => host.remove());
  const inlineProfileHosts = document.querySelectorAll(`[${PROFILE_INLINE_HOST_ATTR}="true"]`);
  inlineProfileHosts.forEach((host) => host.remove());
}

function injectIntoActionBar(actionBar) {
  if (!actionBar) return;
  if (!isTweetActionBar(actionBar)) return;
  if (!shouldInjectIntoActionBar(actionBar)) {
    const existingHost = actionBar.querySelector(`[${HOST_ATTR}="true"]`);
    if (existingHost) {
      existingHost.remove();
    }
    return;
  }

  if (actionBar.querySelector(`[${HOST_ATTR}="true"]`)) {
    scheduleStateSync(actionBar);
    return;
  }

  const likeButton = findLikeButton(actionBar);
  const retweetButton = findRetweetButton(actionBar);
  const anchorButton = likeButton || retweetButton;
  if (!anchorButton) return;

  const likeSlot = findTopLevelActionSlot(anchorButton, actionBar);
  const host = buildActionHost(actionBar);

  if (likeSlot && likeSlot.nextSibling) {
    actionBar.insertBefore(host, likeSlot.nextSibling);
  } else {
    actionBar.appendChild(host);
  }

  scheduleStateSync(actionBar);
}

function injectIntoProfileActions(profileActions) {
  if (!profileActions) return;
  const existingHost = profileActions.querySelector(`[${PROFILE_HOST_ATTR}="true"]`);

  if (!shouldInjectIntoProfile()) {
    if (existingHost) existingHost.remove();
    return;
  }

  if (existingHost) {
    const existingButton = findProfileNostrButton(profileActions);
    const route = getCurrentProfileRoute();
    syncProfileNostrButtonState(existingButton, route);
    return;
  }

  const host = buildProfileActionHost(profileActions);
  profileActions.appendChild(host);
}

function injectInlineProfileButton() {
  const existingHost = document.querySelector(`[${PROFILE_INLINE_HOST_ATTR}="true"]`);

  if (!shouldInjectIntoProfile()) {
    if (existingHost) existingHost.remove();
    return;
  }

  const anchor = findProfileInlineAnchor();
  if (!anchor || !anchor.parentElement) return;

  if (existingHost) {
    if (existingHost.parentElement !== anchor.parentElement || existingHost.previousElementSibling !== anchor) {
      anchor.parentElement.insertBefore(existingHost, anchor.nextSibling);
    }
    const route = getCurrentProfileRoute();
    const profileSignals = readCurrentProfileSignals();
    const badge = existingHost.querySelector(".nostr-like-profile-badge");
    if (badge) {
      badge.textContent = getProfileIndicatorText(route, profileSignals);
    }
    const existingButton = findInlineProfileNostrButton();
    syncProfileNostrButtonState(existingButton, route);
    return;
  }

  const host = buildInlineProfileHost();
  anchor.parentElement.insertBefore(host, anchor.nextSibling);
}

function processRoot(root) {
  if (!isSupportedPage()) return;
  if (!root || root.nodeType !== Node.ELEMENT_NODE) return;

  const element = root;
  if (element.matches && element.matches(ACTION_BAR_SELECTOR)) {
    injectIntoActionBar(element);
  }

  const actionBars = element.querySelectorAll
    ? element.querySelectorAll(ACTION_BAR_SELECTOR)
    : [];
  actionBars.forEach(injectIntoActionBar);

  if (element.matches && element.matches(PROFILE_ACTIONS_SELECTOR)) {
    injectIntoProfileActions(element);
  }

  const profileActionBars = element.querySelectorAll
    ? element.querySelectorAll(PROFILE_ACTIONS_SELECTOR)
    : [];
  profileActionBars.forEach(injectIntoProfileActions);

  injectInlineProfileButton();
}

function runInitialScan() {
  if (!isSupportedPage()) {
    removeInjectedButtons();
    return;
  }
  processRoot(document.body);
}

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      processRoot(node);
    });
  }
});
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener("hashchange", runInitialScan);
window.addEventListener("popstate", runInitialScan);
window.addEventListener("nostr-profile-scraper-ready", runInitialScan);

runInitialScan();
