# Nostr Like Extension

A Manifest V3 browser extension that injects a **Nostr Like ⚡** button into individual X/Twitter tweet pages and persists interactions to Firebase Firestore. Includes a profile scraper that extracts Nostr pubkeys from X bio pages using multi-surface analysis and local bech32 conversion.

---

## Repository layout

```
extension/
  manifest.json        Chrome MV3 manifest
  firebase-config.js   Firebase project credentials
  firebase-client.js   Firestore REST API client (no SDK)
  pubkey-scraper.js    Profile scraper + bech32 encoder/decoder
  content.js           Button injection + SPA navigation handler
  style.css            Button styles

docs/
  PUBKEY_CRAWLING_STRATEGY.md   Full crawling strategy write-up
  COMPETENCY_TEST_SUBMISSION.md Submission summary

data/
  demo_profiles.csv    10 real Bitcoin/Nostr profiles with extracted pubkeys

COMPETENCY_TEST.md     Full technical walkthrough of the extension
```

---

## Install

1. Open `chrome://extensions` in Chrome, Brave, or Edge.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `extension/` folder.
4. Visit any individual tweet, e.g. `https://x.com/callebtc/status/2035005333899190288`.

A **Nostr Like ⚡** button appears in the tweet action row next to the native like button.

---

## What the extension does

### Nostr Like button

- Injects only on individual status pages (`/handle/status/id`) — not on timelines, home, or profile pages.
- Handles X's React SPA: uses a MutationObserver and `popstate`/`hashchange` listeners so the button survives client-side navigation.
- On a thread page (main tweet + replies), the button injects only into the action bar of the tweet matching the URL — not into replies.
- **Click once** → saves a like event to Firestore, button turns green (Saved ✅).
- **Click again** → deletes the Firestore document, button resets to idle.
- State is persisted in `localStorage` so a saved tweet shows green on the next visit without a Firestore read.

### Button states

| State | Icon | Colour |
|---|---|---|
| Idle | ⚡ | Grey |
| Saving / Unsaving | … | Blue |
| Saved | ✅ | Green |
| Error | ⚠ | Red |

### Profile pubkey scraper

On any X profile page, the scraper collects identity signals from multiple surfaces (bio, display name, profile URL, pinned tweet, visible timeline tweets, page title, location) and extracts Nostr identifiers using regex:

- `npub1...` — decoded locally to `pubkey_hex` via bech32
- `did:nostr:<hex>` — hex extracted and re-encoded to `npub`
- Raw 64-char hex pubkeys — encoded to `npub`
- NIP-05 addresses (`name@domain`) — kept only when domain or context confirms Nostr identity

Profiles are scored for Bitcoin/Nostr relevance and assigned a confidence level (`high / medium / low`).

---

## Firebase setup

1. In the [Firebase Console](https://console.firebase.google.com), create a project and enable **Firestore Database**.
2. Open `extension/firebase-config.js` and fill in your project values:

```js
window.NOSTR_FIREBASE_CONFIG = {
  enabled: true,
  apiKey: "YOUR_API_KEY",
  projectId: "YOUR_PROJECT_ID",
  authDomain: "YOUR_AUTH_DOMAIN",
  firestoreDatabase: "(default)",
  collections: {
    likes: "nostr_like_events",
    profiles: "nostr_profile_scrapes"
  }
};
```

3. Reload the extension at `chrome://extensions`.
4. Click **Nostr Like ⚡** on any tweet — a successful write shows **Saved ✅**.

### Firestore rules (dev only)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

Lock these down with proper auth rules before any production use.

---

## Scraper usage

Navigate to an X profile page and open DevTools console:

```js
// Full analysis + Firestore save + console.table output
window.scrapeProfileNpub()

// Analysis only, no Firestore write
window.analyzeProfilePubkeySignals()

// Raw source collection (debug)
window.collectProfilePubkeySources()
```

Example output fields: `handle`, `npub`, `pubkey_hex`, `identifier_type`, `relevance_tag`, `confidence`, `keep_profile`, `source_evidence`.

---

## Demo profiles

`data/demo_profiles.csv` contains 10 real Bitcoin/Nostr profiles covering all four identifier types (npub, NIP-05, hex, did:nostr) with `high` or `medium` confidence. All pubkey values are structurally validated.

---

## Docs

- [COMPETENCY_TEST.md](COMPETENCY_TEST.md) — full technical walkthrough: injection logic, Firebase client, bech32 implementation, scraper pipeline, known limitations.
- [docs/PUBKEY_CRAWLING_STRATEGY.md](docs/PUBKEY_CRAWLING_STRATEGY.md) — crawling strategy with source weighting, filtering rules, resolution order, and ethical notes.
