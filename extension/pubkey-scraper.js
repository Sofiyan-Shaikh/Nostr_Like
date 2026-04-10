(() => {
  const RESERVED_PATHS = new Set([
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

  const SOURCE_WEIGHTS = {
    handle: 1,
    page_title: 1,
    meta_description: 1,
    display_name: 2,
    bio: 5,
    profile_url: 4,
    location: 1,
    profile_header: 2,
    pinned_tweet: 3,
    timeline_tweet: 2
  };

  const REGEX = {
    npub: /\bnpub1[023456789acdefghjklmnpqrstuvwxyz]{20,120}\b/gi,
    nostrUriNpub: /\bnostr:(npub1[023456789acdefghjklmnpqrstuvwxyz]{20,120})\b/gi,
    didNostrHex: /\bdid:nostr:([0-9a-f]{64})\b/gi,
    hexPubkey: /\b[0-9a-f]{64}\b/gi,
    nip05: /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi
  };

  const NOSTR_KEYWORDS = [
    "nostr",
    "npub",
    "nip05",
    "zap",
    "zaps",
    "primal",
    "damus",
    "amethyst",
    "snort",
    "yakihonne",
    "nostrich"
  ];
  const BITCOIN_KEYWORDS = [
    "bitcoin",
    "bitcoiner",
    "btc",
    "lightning",
    "sats",
    "stacker",
    "pleb",
    "ecash",
    "cashu",
    "lnurl",
    "ordinals"
  ];
  const LIKELY_NIP05_DOMAINS = [
    "getalby.com",
    "npub.pro",
    "primal.net",
    "snort.social",
    "current.fyi",
    "pleb.one",
    "yakihonne.com",
    "nostrplebs.com",
    "iris.to",
    "coracle.social"
  ];
  const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const DEFAULT_OPTIONS = {
    includeTimeline: true,
    maxTimelineTweets: 3
  };

  function getHandleFromPath() {
    const match = window.location.pathname.match(/^\/([A-Za-z0-9_]{1,15})(?:\/|$)/);
    if (!match) return null;

    const candidate = match[1];
    if (RESERVED_PATHS.has(candidate.toLowerCase())) return null;

    return `@${candidate}`;
  }

  function normalizeWhitespace(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }

  function unique(values) {
    return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))];
  }

  function getNodeText(node) {
    if (!node) return "";
    return normalizeWhitespace(node.innerText || node.textContent || "");
  }

  function getMetaContent(name, attribute = "name") {
    const node = document.querySelector(`meta[${attribute}="${name}"]`);
    if (!node) return "";
    return normalizeWhitespace(node.getAttribute("content") || "");
  }

  function createSource(type, text, extra = {}) {
    return {
      type,
      text: normalizeWhitespace(text),
      href: typeof extra.href === "string" ? extra.href.trim() : "",
      weight: typeof extra.weight === "number" ? extra.weight : SOURCE_WEIGHTS[type] || 1,
      label: extra.label || type
    };
  }

  function pushSource(collection, source) {
    const candidate = {
      ...source,
      text: normalizeWhitespace(source.text),
      href: typeof source.href === "string" ? source.href.trim() : ""
    };

    if (!candidate.text && !candidate.href) return;

    const duplicate = collection.some(
      (item) =>
        item.type === candidate.type &&
        item.text === candidate.text &&
        item.href === candidate.href
    );
    if (!duplicate) {
      collection.push(candidate);
    }
  }

  function collectTimelineSources(handle, maxTweets) {
    const sources = [];
    const username = handle ? handle.replace(/^@/, "").toLowerCase() : "";
    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));

    for (const article of articles) {
      if (sources.length >= maxTweets) break;

      const tweetText = getNodeText(article.querySelector('[data-testid="tweetText"]'));
      if (!tweetText) continue;

      const statusAnchors = Array.from(article.querySelectorAll('a[href*="/status/"]'));
      const authoredByCurrentProfile =
        username.length === 0 ||
        statusAnchors.some((anchor) => {
          const href = anchor.getAttribute("href") || "";
          return href.toLowerCase().includes(`/${username}/status/`);
        });

      if (!authoredByCurrentProfile) continue;

      const socialContext = getNodeText(article.querySelector('[data-testid="socialContext"]'));
      const isPinned = /pinned/i.test(socialContext);
      pushSource(
        sources,
        createSource(isPinned ? "pinned_tweet" : "timeline_tweet", tweetText, {
          label: isPinned ? "Pinned tweet" : `Timeline tweet ${sources.length + 1}`
        })
      );
    }

    return sources;
  }

  function collectProfileSources(options = {}) {
    const mergedOptions = {
      ...DEFAULT_OPTIONS,
      ...(options && typeof options === "object" ? options : {})
    };
    const sources = [];
    const handle = getHandleFromPath();
    const displayName = getNodeText(document.querySelector('[data-testid="UserName"]'));
    const bio = getNodeText(document.querySelector('[data-testid="UserDescription"]'));
    const location = getNodeText(document.querySelector('[data-testid="UserLocation"]'));
    const profileHeader = getNodeText(document.querySelector('[data-testid="UserProfileHeader_Items"]'));
    const pageTitle = normalizeWhitespace(document.title || "");
    const metaDescription =
      getMetaContent("description") || getMetaContent("og:description", "property");

    pushSource(sources, createSource("handle", handle || ""));
    pushSource(sources, createSource("display_name", displayName));
    pushSource(sources, createSource("bio", bio));
    pushSource(sources, createSource("location", location));
    pushSource(sources, createSource("profile_header", profileHeader));
    pushSource(sources, createSource("page_title", pageTitle));
    pushSource(sources, createSource("meta_description", metaDescription));

    Array.from(document.querySelectorAll('[data-testid="UserUrl"] a[href]')).forEach((anchor, index) => {
      pushSource(
        sources,
        createSource("profile_url", getNodeText(anchor), {
          href: anchor.href || "",
          label: `Profile URL ${index + 1}`
        })
      );
    });

    if (mergedOptions.includeTimeline) {
      collectTimelineSources(handle, mergedOptions.maxTimelineTweets).forEach((source) => {
        pushSource(sources, source);
      });
    }

    return {
      handle,
      display_name: displayName,
      bio,
      location,
      profile_url_text: sources
        .filter((source) => source.type === "profile_url")
        .map((source) => source.href || source.text)
        .join(" | "),
      sources
    };
  }

  function extractMatches(text, pattern, captureGroupIndex = 0) {
    const values = [];
    const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    let match = regex.exec(text);
    while (match) {
      const value = (match[captureGroupIndex] || "").trim().toLowerCase();
      if (value) {
        values.push(value);
      }
      match = regex.exec(text);
    }
    return unique(values);
  }

  function isLikelyNip05Candidate(value, context) {
    if (!value) return false;

    const lowerValue = value.toLowerCase();
    const domain = lowerValue.split("@")[1] || "";
    if (LIKELY_NIP05_DOMAINS.includes(domain)) {
      return true;
    }

    const haystack = context.toLowerCase();
    const contextSignals = [
      "nostr",
      "nip05",
      "npub",
      "zap",
      "primal.net",
      "damus",
      "snort",
      "amethyst",
      "yakihonne"
    ];

    return contextSignals.some((signal) => haystack.includes(signal));
  }

  function extractIdentifiers(text) {
    const rawNip05 = extractMatches(text, REGEX.nip05, 0);
    return {
      npub: unique([
        ...extractMatches(text, REGEX.npub, 0),
        ...extractMatches(text, REGEX.nostrUriNpub, 1)
      ]),
      nip05: rawNip05.filter((value) => isLikelyNip05Candidate(value, text)),
      email_like: rawNip05.filter((value) => !isLikelyNip05Candidate(value, text)),
      hex: unique([
        ...extractMatches(text, REGEX.hexPubkey, 0),
        ...extractMatches(text, REGEX.didNostrHex, 1)
      ]),
      did_nostr: extractMatches(text, REGEX.didNostrHex, 1)
    };
  }

  function collectKeywordHits(text, keywords) {
    const haystack = text.toLowerCase();
    return keywords.filter((keyword) => {
      const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      return pattern.test(haystack);
    });
  }

  function pickPrimaryIdentifier(identifiers) {
    if (identifiers.npub.length > 0) {
      return { type: "npub", value: identifiers.npub[0] };
    }
    if (identifiers.nip05.length > 0) {
      return { type: "nip05", value: identifiers.nip05[0] };
    }
    if (identifiers.did_nostr.length > 0) {
      return { type: "did_nostr", value: identifiers.did_nostr[0] };
    }
    if (identifiers.hex.length > 0) {
      return { type: "hex", value: identifiers.hex[0] };
    }
    return { type: "none", value: "" };
  }

  function inferConfidence(identifiers, sourceEvidence, weightedSignals, canonicalPubkeyHex) {
    if (canonicalPubkeyHex) {
      return "high";
    }

    if (identifiers.npub.length > 0) {
      return "medium";
    }

    if (identifiers.nip05.length > 0) {
      return weightedSignals.nostr >= 1 ? "high" : "medium";
    }

    const hasPinnedOrBioEvidence = sourceEvidence.some(
      (entry) =>
        (entry.type === "bio" || entry.type === "profile_url" || entry.type === "pinned_tweet") &&
        entry.hasIdentifier
    );

    if (identifiers.did_nostr.length > 0 || (identifiers.hex.length > 0 && hasPinnedOrBioEvidence)) {
      return "medium";
    }

    if (weightedSignals.nostr >= 2 && weightedSignals.bitcoin >= 1) {
      return "medium";
    }

    if (identifiers.hex.length > 0 || weightedSignals.nostr >= 2) return "low";
    return "none";
  }

  function inferRelevanceTag(identifiers, weightedSignals) {
    const hasIdentifier = identifiers.npub.length > 0 || identifiers.nip05.length > 0 || identifiers.hex.length > 0;
    const hasNostrKeyword = weightedSignals.nostr > 0;
    const hasBitcoinKeyword = weightedSignals.bitcoin > 0;

    if ((hasIdentifier || hasNostrKeyword) && hasBitcoinKeyword) return "bitcoin+nostr";
    if (hasIdentifier || hasNostrKeyword) return "nostr";
    if (hasBitcoinKeyword) return "bitcoin";
    return "unknown";
  }

  function analyzeSources(sources) {
    const sourceEvidence = sources.map((source) => {
      const scanText = [source.text, source.href].filter(Boolean).join("\n");
      const identifiers = extractIdentifiers(scanText);
      const matchedNostrKeywords = collectKeywordHits(scanText, NOSTR_KEYWORDS);
      const matchedBitcoinKeywords = collectKeywordHits(scanText, BITCOIN_KEYWORDS);
      const hasIdentifier =
        identifiers.npub.length > 0 ||
        identifiers.nip05.length > 0 ||
        identifiers.did_nostr.length > 0 ||
        identifiers.hex.length > 0;

      return {
        ...source,
        identifiers,
        matched_nostr_keywords: matchedNostrKeywords,
        matched_bitcoin_keywords: matchedBitcoinKeywords,
        nostr_hits: matchedNostrKeywords.length,
        bitcoin_hits: matchedBitcoinKeywords.length,
        hasIdentifier
      };
    });

    const identifiers = sourceEvidence.reduce(
      (accumulator, source) => ({
        npub: unique([...accumulator.npub, ...source.identifiers.npub]),
        nip05: unique([...accumulator.nip05, ...source.identifiers.nip05]),
        email_like: unique([...accumulator.email_like, ...source.identifiers.email_like]),
        hex: unique([...accumulator.hex, ...source.identifiers.hex]),
        did_nostr: unique([...accumulator.did_nostr, ...source.identifiers.did_nostr])
      }),
      {
        npub: [],
        nip05: [],
        email_like: [],
        hex: [],
        did_nostr: []
      }
    );

    const weightedSignals = sourceEvidence.reduce(
      (totals, source) => ({
        nostr: totals.nostr + source.nostr_hits * source.weight,
        bitcoin: totals.bitcoin + source.bitcoin_hits * source.weight
      }),
      { nostr: 0, bitcoin: 0 }
    );

    const rawSignals = sourceEvidence.reduce(
      (totals, source) => ({
        nostr: totals.nostr + source.nostr_hits,
        bitcoin: totals.bitcoin + source.bitcoin_hits
      }),
      { nostr: 0, bitcoin: 0 }
    );

    return {
      sourceEvidence,
      identifiers,
      weightedSignals,
      rawSignals
    };
  }

  function toHex(bytes) {
    return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function fromHex(hex) {
    if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
    const bytes = [];
    for (let index = 0; index < hex.length; index += 2) {
      bytes.push(parseInt(hex.slice(index, index + 2), 16));
    }
    return bytes;
  }

  function bech32Polymod(values) {
    const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    let checksum = 1;
    values.forEach((value) => {
      const top = checksum >>> 25;
      checksum = ((checksum & 0x1ffffff) << 5) ^ value;
      for (let index = 0; index < generators.length; index += 1) {
        if ((top >>> index) & 1) {
          checksum ^= generators[index];
        }
      }
    });
    return checksum;
  }

  function bech32HrpExpand(hrp) {
    const expanded = [];
    for (let index = 0; index < hrp.length; index += 1) {
      expanded.push(hrp.charCodeAt(index) >>> 5);
    }
    expanded.push(0);
    for (let index = 0; index < hrp.length; index += 1) {
      expanded.push(hrp.charCodeAt(index) & 31);
    }
    return expanded;
  }

  function bech32VerifyChecksum(hrp, data) {
    return bech32Polymod([...bech32HrpExpand(hrp), ...data]) === 1;
  }

  function bech32CreateChecksum(hrp, data) {
    const values = [...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
    const polymod = bech32Polymod(values) ^ 1;
    const checksum = [];
    for (let index = 0; index < 6; index += 1) {
      checksum.push((polymod >>> (5 * (5 - index))) & 31);
    }
    return checksum;
  }

  function bech32Decode(value) {
    if (!value || value !== value.toLowerCase()) {
      return null;
    }

    const separatorIndex = value.lastIndexOf("1");
    if (separatorIndex < 1 || separatorIndex + 7 > value.length) {
      return null;
    }

    const hrp = value.slice(0, separatorIndex);
    const data = [];

    for (let index = separatorIndex + 1; index < value.length; index += 1) {
      const mapped = BECH32_CHARSET.indexOf(value[index]);
      if (mapped === -1) return null;
      data.push(mapped);
    }

    if (!bech32VerifyChecksum(hrp, data)) {
      return null;
    }

    return {
      hrp,
      data: data.slice(0, -6)
    };
  }

  function bech32Encode(hrp, data) {
    const checksum = bech32CreateChecksum(hrp, data);
    const combined = [...data, ...checksum];
    return `${hrp}1${combined.map((value) => BECH32_CHARSET[value]).join("")}`;
  }

  function convertBits(data, fromBits, toBits, pad) {
    let accumulator = 0;
    let bits = 0;
    const result = [];
    const maxValue = (1 << toBits) - 1;
    const maxAccumulator = (1 << (fromBits + toBits - 1)) - 1;

    for (const value of data) {
      if (value < 0 || value >>> fromBits !== 0) {
        return null;
      }
      accumulator = ((accumulator << fromBits) | value) & maxAccumulator;
      bits += fromBits;
      while (bits >= toBits) {
        bits -= toBits;
        result.push((accumulator >>> bits) & maxValue);
      }
    }

    if (pad) {
      if (bits > 0) {
        result.push((accumulator << (toBits - bits)) & maxValue);
      }
    } else if (bits >= fromBits || ((accumulator << (toBits - bits)) & maxValue)) {
      return null;
    }

    return result;
  }

  function decodeNpubToHex(npub) {
    const decoded = bech32Decode((npub || "").toLowerCase());
    if (!decoded || decoded.hrp !== "npub") return "";
    const bytes = convertBits(decoded.data, 5, 8, false);
    if (!bytes || bytes.length !== 32) return "";
    return toHex(bytes);
  }

  function encodeHexToNpub(hex) {
    const bytes = fromHex((hex || "").toLowerCase());
    if (!bytes) return "";
    const words = convertBits(bytes, 8, 5, true);
    if (!words) return "";
    return bech32Encode("npub", words);
  }

  function resolveCanonicalPubkey(identifiers) {
    if (identifiers.npub.length > 0) {
      const pubkeyHex = decodeNpubToHex(identifiers.npub[0]);
      return {
        pubkey_hex: pubkeyHex,
        npub: identifiers.npub[0],
        source_type: "npub"
      };
    }

    if (identifiers.did_nostr.length > 0) {
      return {
        pubkey_hex: identifiers.did_nostr[0],
        npub: encodeHexToNpub(identifiers.did_nostr[0]),
        source_type: "did_nostr"
      };
    }

    if (identifiers.hex.length > 0) {
      return {
        pubkey_hex: identifiers.hex[0],
        npub: encodeHexToNpub(identifiers.hex[0]),
        source_type: "hex"
      };
    }

    return {
      pubkey_hex: "",
      npub: "",
      source_type: identifiers.nip05.length > 0 ? "nip05_unresolved" : "none"
    };
  }

  function pickBestEvidence(sourceEvidence) {
    return sourceEvidence
      .filter((entry) => entry.hasIdentifier || entry.nostr_hits > 0 || entry.bitcoin_hits > 0)
      .sort((left, right) => {
        const leftScore = left.weight * 10 + left.nostr_hits + left.bitcoin_hits;
        const rightScore = right.weight * 10 + right.nostr_hits + right.bitcoin_hits;
        return rightScore - leftScore;
      })
      .slice(0, 6)
      .map((entry) => ({
        type: entry.type,
        label: entry.label,
        weight: entry.weight,
        text: entry.text,
        href: entry.href,
        nostr_keywords: entry.matched_nostr_keywords,
        bitcoin_keywords: entry.matched_bitcoin_keywords,
        identifiers: entry.identifiers
      }));
  }

  function buildProfileAnalysis(profile) {
    const { sourceEvidence, identifiers, weightedSignals, rawSignals } = analyzeSources(profile.sources);
    const primaryIdentifier = pickPrimaryIdentifier(identifiers);
    const canonicalPubkey = resolveCanonicalPubkey(identifiers);
    const confidence = inferConfidence(
      identifiers,
      sourceEvidence,
      weightedSignals,
      canonicalPubkey.pubkey_hex
    );
    const relevanceTag = inferRelevanceTag(identifiers, weightedSignals);
    const hasStrongIdentifier =
      identifiers.npub.length > 0 ||
      identifiers.nip05.length > 0 ||
      identifiers.did_nostr.length > 0 ||
      identifiers.hex.length > 0;
    const keepProfile =
      hasStrongIdentifier ||
      (weightedSignals.nostr >= 2 && weightedSignals.bitcoin >= 1) ||
      (weightedSignals.nostr >= 4 && profile.sources.length > 0);
    const bestEvidence = pickBestEvidence(sourceEvidence);

    return {
      handle: profile.handle || "(unknown)",
      profile_url: window.location.href,
      display_name: profile.display_name || "",
      npub: canonicalPubkey.npub || identifiers.npub[0] || "(not found)",
      pubkey_hex: canonicalPubkey.pubkey_hex || "(not resolved)",
      identifier_type: primaryIdentifier.type,
      identifier_value: primaryIdentifier.value || "(not found)",
      canonical_source_type: canonicalPubkey.source_type,
      relevance_tag: relevanceTag,
      confidence,
      keep_profile: keepProfile,
      needs_manual_review: !canonicalPubkey.pubkey_hex && identifiers.nip05.length > 0,
      nostr_keyword_hits: rawSignals.nostr,
      bitcoin_keyword_hits: rawSignals.bitcoin,
      nostr_keyword_weighted_hits: weightedSignals.nostr,
      bitcoin_keyword_weighted_hits: weightedSignals.bitcoin,
      profile_url_text: profile.profile_url_text,
      location: profile.location,
      source_count: profile.sources.length,
      matched_sources: bestEvidence.map((entry) => entry.type),
      source_evidence: bestEvidence,
      identifiers
    };
  }

  function analyzeProfilePubkeySignals(options = {}) {
    const profile = collectProfileSources(options);

    return {
      ...buildProfileAnalysis(profile),
      bio: profile.bio,
      crawl_sources: profile.sources
    };
  }

  async function persistProfileRow(row, bio) {
    if (!window.nostrFirebase || typeof window.nostrFirebase.saveProfileScrape !== "function") {
      return { status: "skipped", reason: "firebase_client_missing" };
    }

    if (!window.nostrFirebase.isConfigured()) {
      return { status: "skipped", reason: "firebase_not_configured" };
    }

    try {
      const result = await window.nostrFirebase.saveProfileScrape({
        ...row,
        bio
      });
      return {
        status: "saved",
        document_name: result && result.name ? result.name : null
      };
    } catch (error) {
      return {
        status: "error",
        reason: error instanceof Error ? error.message : "unknown_firebase_error"
      };
    }
  }

  async function scrapeProfileNpub(options = {}) {
    const analysis = analyzeProfilePubkeySignals(options);
    const { bio, crawl_sources, ...row } = analysis;

    const firebase = await persistProfileRow(
      {
        ...row,
        crawl_sources
      },
      bio
    );
    const result = {
      ...analysis,
      firebase_status: firebase.status,
      firebase_reason: firebase.reason || "",
      firebase_document: firebase.document_name || ""
    };

    console.table([
      {
        handle: result.handle,
        display_name: result.display_name,
        identifier_type: result.identifier_type,
        identifier_value: result.identifier_value,
        pubkey_hex: result.pubkey_hex,
        relevance_tag: result.relevance_tag,
        confidence: result.confidence,
        keep_profile: result.keep_profile,
        firebase_status: result.firebase_status
      }
    ]);
    return result;
  }

  window.analyzeProfilePubkeySignals = analyzeProfilePubkeySignals;
  window.collectProfilePubkeySources = collectProfileSources;
  window.scrapeProfileNpub = scrapeProfileNpub;
  window.scrapeProfilePubkeySignals = scrapeProfileNpub;
  window.dispatchEvent(new CustomEvent("nostr-profile-scraper-ready"));
})();
