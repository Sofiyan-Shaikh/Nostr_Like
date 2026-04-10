# Nostr Extension + Pubkey Crawl Strategy

This repo contains:

- `extension/`: MV3 browser extension that injects a Nostr-like button on X/Twitter status pages and can persist events to Firebase Firestore.
- `docs/PUBKEY_CRAWLING_STRATEGY.md`: practical strategy for discovering Nostr pubkeys from X profiles.
- `data/demo_profiles.csv`: sample output using ~10 real profiles discovered from public profile mirrors.

## Load extension (Chrome/Brave/Edge)

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `extension/` folder.
5. Visit a status page, e.g. `https://x.com/callebtc/status/2035005333899190288`.

The extension appends a `Nostr Like` button in the tweet action row of individual status pages.

## Firebase setup

1. In Firebase Console, create a project and enable **Firestore Database**.
2. Open `extension/firebase-config.js` and set:
   - `enabled: true`
   - `apiKey`
   - `projectId`
   - optional collection names.
3. Reload the unpacked extension in `chrome://extensions`.
4. Click `Nostr Like` on X; successful writes show `Saved` on the button.
5. Run `window.scrapeProfilePubkeySignals()` (or `window.scrapeProfileNpub()`) on an X profile page to save profile scrape rows with identifier type, relevance tag, canonical `pubkey_hex` / `npub` when available, and source evidence.
6. Optional: `window.collectProfilePubkeySources()` shows the exact page surfaces the scraper is reading from.

## Firestore rules for local testing

Use temporary dev-only rules while validating the extension:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

Lock this down before production.
