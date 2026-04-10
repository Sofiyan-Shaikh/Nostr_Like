# Competency Test Submission

## 1) Browser Extension: Nostr Like Button on Individual Tweet Page

- Extension type: Manifest V3 content script.
- Target host: `https://x.com/*`.
- Behavior: injects a static `Nostr Like` button into the action row of the target tweet on individual status pages (example: `https://x.com/callebtc/status/2035005333899190288`).
- Dynamic-page handling: watches X SPA mutations and route changes, then injects only when the page is a `/<handle>/status/<id>` route and the action bar belongs to that status tweet.

Key files:

- `extension/content.js`
- `extension/style.css`
- `extension/manifest.json`

## 2) Pubkey Crawling Strategy

Approach implemented in extension-side scraper plus strategy doc:

1. Crawl multiple public X surfaces instead of only the bio field:
   - handle
   - display name
   - bio
   - profile URL text / href
   - location and header metadata
   - pinned tweet and first visible timeline tweets
2. Extract Nostr identifiers using regex across both text and URLs:
   - `npub`
   - `nostr:npub...`
   - `did:nostr:<hex>`
   - raw 64-char hex pubkeys
   - NIP-05 style identifiers (`name@domain`)
3. Reduce false positives by treating NIP-05 separately from ordinary email addresses and only keeping it when surrounding Nostr context is present or the domain is a likely Nostr identity provider.
4. Filter Bitcoin/Nostr users using keyword signals:
   - Nostr keywords: `nostr`, `npub`, `nip05`, `zap`, `primal`, `damus`, `snort`, `amethyst`
   - Bitcoin keywords: `bitcoin`, `bitcoiner`, `btc`, `lightning`, `sats`, `stacker`, `pleb`, `cashu`
   - Source weighting: bio / profile URL / pinned tweet count more than weak page metadata
5. Normalize identifiers locally:
   - decode `npub` -> `pubkey_hex`
   - encode hex / `did:nostr` -> `npub`
   - keep unresolved NIP-05 for later verification
6. Assign confidence:
   - `high`: canonical pubkey resolved locally
   - `medium`: unresolved NIP-05 with clear Nostr context, or strong multi-source Nostr+Bitcoin evidence
   - `low`: keyword-only candidate
7. Persist scrape rows to Firestore (if configured) including metadata, crawl timestamp, and source evidence.

Key files:

- `extension/pubkey-scraper.js`
- `docs/PUBKEY_CRAWLING_STRATEGY.md`

## 3) Demonstration with ~10 Real Profiles

Demo output is included here:

- `data/demo_profiles.csv`

Fields include:

- `handle`
- `x_profile_url`
- `identifier_type`
- `identifier_value`
- `relevance_tag`
- `confidence`
- `source_url`
