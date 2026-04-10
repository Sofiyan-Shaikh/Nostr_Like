# Pubkey Crawling Strategy (X -> Nostr)

## Goal

Discover and verify Nostr pubkeys for X users by scanning multiple profile surfaces, then normalizing Nostr identifiers into a canonical pubkey when possible.

## High-level pipeline

1. Seed candidates from X profile URLs (targeted lists, followers, hashtag/community lists).
2. Crawl profile metadata and visible timeline evidence.
3. Extract Nostr identifiers from text and URLs.
4. Score and filter for Bitcoin/Nostr relevance.
5. Normalize to canonical pubkey (`pubkey_hex` + `npub`) when locally possible.
6. Verify identity confidence and persist source evidence.

## 1) Crawl X profile surfaces

For each profile, collect several public X surfaces instead of relying on one bio node:

- `handle`
- `display_name`
- `bio`
- `url` / visible external links
- `location`
- profile header metadata
- page title / meta description
- pinned tweet and first few visible timeline tweets
- Normalize text: lowercase, strip emoji noise, collapse whitespace.
- Keep source-level evidence + crawl timestamp for auditability.

## 2) Extract identifiers

Use regex detectors across both text and href values:

- `npub`: `npub1[023456789acdefghjklmnpqrstuvwxyz]{20,120}`
- `hex pubkey`: `[0-9a-f]{64}`
- NIP-05 address-like strings: `[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}`
- Nostr URI forms: `nostr:npub1...`, `did:nostr:<hex>`

Important nuance: NIP-05 looks like an email address, so avoid treating every email as a Nostr identifier. Only keep NIP-05 candidates when:

- the surrounding text also contains Nostr-specific context such as `nostr`, `nip05`, `npub`, `zap`
- or the domain is commonly used for Nostr identities (for example `getalby.com`, `primal.net`, `snort.social`)

## 3) Filter Bitcoin/Nostr users

Keyword score examples:

- Nostr signals: `nostr`, `npub`, `nip05`, `zap`, `primal`, `damus`, `snort`, `amethyst`
- Bitcoin signals: `bitcoin`, `bitcoiner`, `btc`, `lightning`, `sats`, `stacker`, `pleb`, `cashu`

Suggested rule:

- keep immediately if an explicit Nostr identifier exists (`npub`, `did:nostr`, hex pubkey, or high-confidence NIP-05)
- otherwise keep as a candidate when weighted Nostr signals are strong and Bitcoin evidence is also present
- boost confidence when both Nostr + Bitcoin signals appear in strong sources like bio, profile URL, or pinned tweet

## 4) Resolve to canonical pubkey

Resolution order:

1. If `npub` found: decode bech32 -> hex pubkey locally.
2. If `did:nostr:<hex>` or raw 64-char hex found: encode to `npub` locally for display consistency.
3. If only NIP-05 found: mark as unresolved and resolve server-side or with a privileged extension fetch via `https://<domain>/.well-known/nostr.json?name=<user>`.

Store both:

- `pubkey_hex`
- `npub`
- `source_type` (`npub`, `nip05`, `hex`, `nostr_uri`)
- `source_evidence` (which page surfaces produced the signal)

## 5) Confidence & de-dup

Confidence buckets:

- High: canonical pubkey resolved locally from `npub`, `did:nostr`, or raw hex found in strong sources.
- Medium: NIP-05 with clear Nostr context, or strong multi-source Nostr+Bitcoin evidence.
- Low: keyword-only candidate without a canonical pubkey yet.

De-dup by `pubkey_hex`; map many X handles to one pubkey when needed.

## 6) Ethical/operational notes

- Respect X terms, robots, and request limits.
- Prefer user-consented/publicly available data.
- Persist minimal required fields and crawl timestamps.
- Re-verify periodically, because bios change frequently.

## Suggested stack

- Crawl: Playwright or compliant API provider.
- Parse/ETL: Node.js/TypeScript or Python.
- Storage: SQLite/Postgres.
- Nostr utilities: `nostr-tools` or local bech32 helpers for `npub`/hex conversion.
