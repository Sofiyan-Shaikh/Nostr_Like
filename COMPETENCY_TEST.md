# Competency Test — Nostr Like Extension

## What was built

A Manifest V3 browser extension that:

1. Statically injects a **Nostr Like** button into the action row of any individual X/Twitter tweet page (e.g. `https://x.com/callebtc/status/2035005333899190288`).
2. Persists click events to **Firebase Firestore** using the REST API — no Firebase SDK required.
3. Scrapes X profile pages for **Nostr pubkeys** using multi-surface analysis and local bech32 decode/encode.
4. Implements a full **pubkey crawling strategy** for discovering Bitcoin/Nostr users from X bios.

---

## Repository layout

```
extension/
  manifest.json        Chrome MV3 manifest
  firebase-config.js   Firebase project credentials (loaded first)
  firebase-client.js   Firestore REST API wrapper
  pubkey-scraper.js    Profile scraper + bech32 converter
  content.js           Button injection + SPA navigation handler
  style.css            Button styles (idle / loading / success / error)

docs/
  PUBKEY_CRAWLING_STRATEGY.md   Strategy write-up
  COMPETENCY_TEST_SUBMISSION.md Short submission summary

data/
  demo_profiles.csv    ~10 real Bitcoin/Nostr profiles with extracted pubkeys
```

---

## Part 1 — Browser Extension

### How the button injection works

X/Twitter is a React SPA. The DOM is not static — tweets are added and removed as the user scrolls or navigates. The extension handles this in three layers:

**Layer 1 — MutationObserver** (`content.js:602`)

Watches the entire document for newly added DOM nodes. Every time X renders a new action bar (`div[role="group"]` or `div[role="toolbar"]`), the observer calls `injectIntoActionBar()` on it. This covers the initial page load and all in-page navigations.

**Layer 2 — Route change listeners** (`content.js:612`)

Listens to `hashchange` and `popstate` events and re-runs the initial scan. X fires these on every client-side route transition, so navigating from a profile to a tweet page (or between tweets) is caught immediately.

**Layer 3 — Guard: inject only on the right tweet** (`content.js:367`)

On a status page (`/callebtc/status/2035005333899190288`), X renders the main tweet and several reply tweets, each with its own action bar. The guard extracts the tweet ID from each action bar's closest `<article>` → `<a href*="/status/">` link and compares it against the tweet ID in the URL. The button is only injected into the action bar whose tweet ID matches the page URL — not into replies.

```
shouldInjectIntoActionBar()
  └─ extractTweetContext(actionBar)   → { tweet_id, author_handle, tweet_url }
  └─ getCurrentStatusRoute()          → { tweet_id } from window.location.pathname
  └─ compare tweet_ids                → inject only on match
```

### Button states

The button cycles through four visual states:

| State | Label | Colour | When |
|---|---|---|---|
| `idle` | Nostr Like ⚡ | Grey | Default, not yet saved |
| `loading` | Saving... / Unsaving... | Blue | Waiting for Firestore |
| `success` | Saved ✅ | Green | Firestore write confirmed |
| `error` | Retry / Configure ⚠ | Red | Network error or missing config |

State is persisted in `window.localStorage` so a previously saved tweet shows green on the next page visit without a Firestore read.

### Event isolation

X attaches aggressive pointer/click handlers that intercept events and navigate the page. Every button event (`pointerdown`, `mousedown`, `mouseup`, `touchstart`, `touchend`, `dblclick`, `keydown`, `keyup`) is stopped with `stopImmediatePropagation` so clicking the Nostr Like button never triggers X's own actions. (`content.js:166`)

### Save / unsave toggle

Clicking a green (saved) button sends a `DELETE` to Firestore and clears the localStorage entry. Clicking an idle button sends a `POST` to Firestore. The Firestore document name returned by the POST is stored in localStorage so the DELETE can reference it directly without a query. (`content.js:414`)

---

## Part 2 — Firebase Firestore Integration

### Why REST instead of the Firebase SDK

Loading the Firebase JS SDK inside a content script is complex — it requires bundling or importScripts workarounds. The extension instead uses the **Firestore REST API** directly with `fetch()`, which works out of the box from any content script that has the appropriate `host_permissions`.

```
host_permissions:
  https://x.com/*
  https://firestore.googleapis.com/*
```

### How documents are written

`firebase-client.js` converts a plain JS object into the Firestore typed-field format:

```js
// Input
{ tweet_id: "2035005333899190288", author_handle: "@callebtc" }

// Sent to Firestore as
{ fields: { tweet_id: { stringValue: "2035005333899190288" }, ... } }
```

Every document gets two metadata fields automatically added by `withMetadata()`:
- `created_at_iso` — ISO 8601 timestamp
- `created_at_ms` — Unix millisecond timestamp

### Collections

| Collection | Purpose |
|---|---|
| `nostr_like_events` | One document per button click (tweet save) |
| `nostr_profile_scrapes` | One document per profile scrape |

### Configuration

All credentials live in `firebase-config.js` and are checked at runtime before any Firestore call. If `enabled: false` or credentials are placeholders (`YOUR_*`), the button shows an error state instead of silently failing.

---

## Part 3 — Pubkey Scraping

### The problem

X bios are short and unstructured. A user might put their Nostr identity in the bio, display name, pinned tweet, or an external profile link. Relying on a single field produces false negatives. The scraper reads **all available profile surfaces** and merges the evidence.

### Sources collected (with weights)

| Source | Weight | Example content |
|---|---|---|
| `bio` | 5 | "Nostr: npub1..." |
| `profile_url` | 4 | href to primal.net |
| `pinned_tweet` | 3 | "Find me on Nostr npub1..." |
| `display_name` | 2 | "Alice ⚡" |
| `profile_header` | 2 | metadata from header items |
| `timeline_tweet` | 2 | first 3 authored tweets |
| `handle` | 1 | @username |
| `page_title` | 1 | browser tab title |
| `meta_description` | 1 | og:description meta tag |
| `location` | 1 | "Bitcoin Beach" |

Higher-weight sources contribute more to the relevance score, so a Nostr keyword in the bio counts more than one in the page title.

### Identifier extraction

Four regex patterns run across each source's text and href value:

```
npub         →  npub1[bech32chars]{20,120}
nostr: URI   →  nostr:(npub1...)
did:nostr    →  did:nostr:[0-9a-f]{64}
hex pubkey   →  [0-9a-f]{64}
NIP-05       →  name@domain  (with false-positive guard)
```

**NIP-05 false-positive guard**: An email-shaped string like `alice@example.com` would match the NIP-05 pattern. The scraper only keeps it as a Nostr identifier when:
- the domain is on a known Nostr provider list (`getalby.com`, `primal.net`, `snort.social`, `nostrplebs.com`, etc.), OR
- the surrounding text contains a Nostr context signal (`nostr`, `npub`, `zap`, `damus`, etc.)

### Local bech32 conversion (no external library)

`pubkey-scraper.js` includes a full bech32 encode/decode implementation (~120 lines). This means:
- `npub1...` → `pubkey_hex` (decode): done locally in the browser
- `pubkey_hex` → `npub1...` (encode): done locally in the browser
- No network call required for `npub` or hex identifiers

NIP-05 is the only identifier type that cannot be resolved locally — it requires a `GET` to `https://<domain>/.well-known/nostr.json?name=<user>`. These are flagged as `needs_manual_review: true` in the output.

### Resolution order

```
1. npub found        → decode bech32 → pubkey_hex  (confidence: medium or high)
2. did:nostr found   → extract hex  → encode to npub (confidence: medium)
3. hex found         → encode to npub               (confidence: medium if bio/url, low otherwise)
4. NIP-05 only       → unresolved, mark for later   (confidence: medium if strong context)
5. nothing found     → keyword-only candidate        (confidence: low or none)
```

### Relevance tags

| Tag | Condition |
|---|---|
| `bitcoin+nostr` | Has Nostr identifier or keyword AND Bitcoin keyword |
| `nostr` | Has Nostr identifier or keyword, no Bitcoin signal |
| `bitcoin` | Has Bitcoin keyword only, no Nostr signal |
| `unknown` | No signals found |

### Confidence levels

| Level | Condition |
|---|---|
| `high` | Canonical `pubkey_hex` resolved locally |
| `medium` | Unresolved NIP-05 with clear Nostr context, or strong multi-source Nostr+Bitcoin signals |
| `low` | Keyword-only, no canonical pubkey |
| `none` | No evidence at all |

### Public API exposed on window

```js
// Full analysis (returns object, no Firebase write)
window.analyzeProfilePubkeySignals({ includeTimeline: true, maxTimelineTweets: 3 })

// Full analysis + persist to Firestore + console.table output
window.scrapeProfileNpub()
window.scrapeProfilePubkeySignals()   // alias

// Raw source collection only (debug)
window.collectProfilePubkeySources()
```

Run any of these in DevTools on an X profile page to see live output.

---

## Part 4 — Demo Profiles

Ten real profiles from public Nostr/Bitcoin directories, covering all four identifier types:

| Handle | Identifier type | Relevance | Confidence |
|---|---|---|---|
| BTCsessions | nip05 (`btcsessions@getalby.com`) | bitcoin+nostr | high |
| MaxAWebster | npub | bitcoin+nostr | high |
| ArturBrugeman | npub | bitcoin+nostr | high |
| KiPSOFT | npub | nostr | high |
| vishalxl | hex (64-char) | nostr | medium |
| melvincarvalho | did:nostr | nostr | medium |
| NostrMagazine | npub | nostr | high |
| GMONEYPEPE | npub | bitcoin+nostr | high |
| M_affirmed | npub | bitcoin+nostr | high |
| Denny_nostr | npub | nostr | high |

All npub values were validated as structurally correct bech32 (hrp=`npub`, 52 data words = 32-byte pubkey). Both hex values confirmed as 64-character lowercase hex strings.

---

## How to install

1. Open `chrome://extensions` in Chrome, Brave, or Edge.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `extension/` folder.
4. Visit `https://x.com/callebtc/status/2035005333899190288`.
5. The **Nostr Like ⚡** button appears in the tweet action row.

## How to use the scraper

Navigate to any X profile page (e.g. `https://x.com/BTCsessions`) and open DevTools console:

```js
// See what the scraper finds
window.scrapeProfileNpub()
```

Output includes: `handle`, `display_name`, `npub`, `pubkey_hex`, `identifier_type`, `relevance_tag`, `confidence`, `keep_profile`, and full `source_evidence`.

## Firestore rules for local testing

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

Lock these down before any production deployment.

---

## Known limitations

| Item | Detail |
|---|---|
| NIP-05 resolution | Requires an external fetch to `/.well-known/nostr.json` — not implemented in the extension, flagged for server-side resolution |
| Firestore auth | Currently uses API key with open rules; should use Firebase Auth or server-side token in production |
| X DOM selectors | `data-testid` attributes are set by X's build pipeline and could change; the extension would need a selector update if they do |
| `nostr-profile-scraper-ready` listener | `content.js` registers a listener for this event but it fires before the listener is set up (scripts run synchronously in order); `runInitialScan()` is called directly so there is no functional impact — the listener is dead code |
