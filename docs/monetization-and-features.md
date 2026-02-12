# Brute Bookmarks — Monetization & Feature Cost Analysis

> Last updated: February 2026.

---

## Part 1: Two Features — LLM vs Script

### Auto-populating site names from a URL

**The question:** When a user pastes a URL, should we use an LLM to generate a bookmark name, or can a script do it?

**A script can do it.** Here's why:

Every webpage already has a name — it's the `<title>` tag. When you paste `https://github.com/HNTBO/brute-bookmarks`, the page's title is "GitHub - HNTBO/brute-bookmarks". That's exactly what a bookmark should be called.

The script approach:
1. Fetch the URL (server-side or via a CORS proxy)
2. Parse the HTML, extract `<title>`
3. Clean it up: strip trailing ` - YouTube`, ` | Reddit`, etc.
4. Fall back to the domain name if no title found (`github.com` → "GitHub")

This is deterministic, instant, free, and works offline. It's the same thing every browser does when you bookmark a page.

An LLM would only add value if you wanted to *improve* titles — turning "Amazon.com. Spend less. Smile more." into "Amazon". But a simple cleanup script with a few regex rules does 95% of that work. The remaining 5% isn't worth $0.001/call × millions of calls.

**Cost comparison:**

| Approach | Cost per call | 10K users × 5 bookmarks/mo | 100K users |
|----------|--------------|----------------------------|------------|
| `<title>` fetch (Convex action) | ~0 (bandwidth only) | ~$0 | ~$0 |
| LLM (Claude Haiku / GPT-4o-mini) | ~$0.0003 | ~$15/mo | ~$150/mo |

The LLM cost isn't catastrophic, but it's pure waste when a free, faster, more reliable solution exists. **Recommendation: script it.**

The fetch already happens — the favicon fetch (`/api/get-favicon`) hits the URL. We can extract the `<title>` in the same request.

### Formatting imported bookmark files

**The question:** When a user imports bookmarks from Chrome, Firefox, or a JSON file, should we use an LLM to parse them, or a script?

**A script handles all standard formats.** The common bookmark export formats are:

| Format | Source | Parsing difficulty |
|--------|--------|--------------------|
| Netscape HTML | Chrome, Firefox, Safari, Edge | Easy — DOM parser, `<DT><A HREF="...">` tags |
| JSON | Firefox, some tools | Easy — `JSON.parse`, walk the tree |
| CSV | Spreadsheets, Raindrop.io | Easy — split on commas |
| Plain text URLs | Manual lists | Easy — one URL per line |

All of these have well-defined structures. A DOM parser handles the HTML format. JSON.parse handles JSON. No ambiguity, no interpretation needed.

An LLM would only help with truly *unstructured* input — like a user pasting a paragraph of text with URLs mixed in. That's an edge case, not a core flow.

**Cost comparison:**

| Approach | Cost per import | Notes |
|----------|----------------|-------|
| Parser script | $0 | Deterministic, instant |
| LLM (full bookmark file) | $0.01–0.10 | Token-heavy input, unpredictable output |

The LLM approach is also riskier — it can hallucinate URLs, miss bookmarks, or return malformed JSON. A parser never does.

**Recommendation: script it.** Write parsers for Netscape HTML (covers Chrome/Firefox/Safari/Edge) and JSON. That covers 99% of imports. If a truly weird format comes in, show an error with instructions rather than gambling on an LLM.

### When would LLM features actually make sense?

If you eventually want premium AI features, the valuable ones would be:
- **Smart categorization** — "Put this bookmark in the right category based on its content" (requires understanding the page, not just parsing)
- **Bookmark discovery** — "Suggest sites similar to my bookmarks"
- **Natural language search** — "Find that cooking blog I saved last month"

These genuinely need language understanding. Parsing and title extraction don't.

---

## Part 2: Monetization Paths

### Constraints
- No ads
- No user tracking
- Privacy-first identity (this is a selling point, not a limitation)

### Path 1: Pay-What-You-Want / Tip Jar

**How it works:** A "Buy me a coffee" button. Users pay what they want, when they want. No obligation.

**Platforms:**
- [Ko-fi](https://ko-fi.com) — 0% platform fee, Stripe/PayPal processing only (~2.9% + $0.30)
- [Buy Me a Coffee](https://buymeacoffee.com) — 5% platform fee
- [GitHub Sponsors](https://github.com/sponsors) — 0% fee (GitHub absorbs it)

**Does pay-what-you-want work for internet applications?**

It works differently than for live shows. At a concert, social pressure and emotional connection drive tips. Online, the dynamics are:

- **What works:** Open-source tools with passionate users (Obsidian, Calibre, many VS Code extensions). Users who *feel* the tool saved them time or solved a real problem.
- **What doesn't work:** Tools users take for granted or consider "should be free" (weather apps, basic utilities).

A bookmark manager is somewhere in between. The key factors:

| Factor | For tips | Against tips |
|--------|----------|--------------|
| Daily use tool | Users feel the value | They also feel it "should be free" |
| Privacy-first, no tracking | Inspires goodwill | Smaller audience than ad-funded |
| Open source | Community trust | "I can host it myself for free" |
| Solo developer narrative | Personal connection | N/A |

**Realistic revenue at scale:**

Conversion rates for tip-based models are typically 1–3% of active users. Average tip: $3–5.

| Users | Tippers (2%) | Avg tip | Monthly |
|-------|-------------|---------|---------|
| 1,000 | 20 | $4 | **$80/mo** |
| 10,000 | 200 | $4 | **$800/mo** |
| 100,000 | 2,000 | $4 | **$8,000/mo** |

These are one-time tips, not recurring. Repeat tipping is rare (~10% of tippers tip again). So this is more like $80/mo at 1K users growing slowly, not compounding.

**Verdict:** Good as a starting point. Low friction, matches your values. Won't scale to cover costs if Clerk hits $17K/mo at 1M users. Works well as a complement to other paths.

### Path 2: Freemium — Free Core + Paid Extras

**How it works:** The bookmark manager is free forever. Premium features unlock with a subscription.

**What could be premium:**

| Feature | Why users pay | Monthly value |
|---------|--------------|---------------|
| Cross-device sync | Already built (Convex) | $2–3/mo |
| Unlimited bookmarks | Free tier capped at 100-200 | $2–3/mo |
| Custom themes | Beyond dark/light | $1–2/mo |
| Import from any format | Advanced parsing | $1/mo |
| Shared collections | Collaborative bookmarks | $3–5/mo |
| Browser extension | Quick-save from any page | $1–2/mo |

**Pricing model:** $3–5/mo or $30–50/year for a "Pro" bundle.

**Realistic revenue:**

Free-to-paid conversion for utility apps is typically 2–5%.

| Users | Paid (3%) | Price | Monthly |
|-------|----------|-------|---------|
| 1,000 | 30 | $4/mo | **$120/mo** |
| 10,000 | 300 | $4/mo | **$1,200/mo** |
| 100,000 | 3,000 | $4/mo | **$12,000/mo** |
| 1,000,000 | 30,000 | $4/mo | **$120,000/mo** |

**Verdict:** This is the model that scales. At 100K users, $12K/mo covers all infrastructure costs ($65–83/mo from the scaling doc). At 1M users, $120K/mo comfortably covers the $18K/mo infrastructure — including Clerk.

**The critical question:** Which features to gate? The answer determines whether users feel the free tier is generous (building trust) or crippled (building resentment). The sweet spot:

- **Free forever:** Bookmarks, categories, drag-drop, themes, export, local storage
- **Paid:** Sync across devices, browser extension, shared collections, unlimited bookmarks

Sync is the natural paywall. It's the feature that requires infrastructure (Convex, Clerk) and it's the feature users *expect* to pay for. Users intuitively understand that "keeping my data on multiple devices" costs money to run.

### Path 3: One-Time Purchase (Lifetime License)

**How it works:** Pay once, use forever. Like buying software in 2005.

**Pricing:** $15–30 lifetime.

**Pros:**
- Simple. No subscription fatigue.
- Appeals to users who hate recurring charges.
- Strong for privacy-focused audience ("I pay once, you never need to bill me again").

**Cons:**
- Doesn't cover ongoing costs (Convex, Clerk, Vercel are monthly).
- Need constant new users to sustain revenue.
- At 1M users paying $20 once, you have $20M in revenue but $18K/mo ongoing costs. Math works, but only if growth continues.

**Realistic revenue:**

| Users | Buyers (5%) | Price | Total (cumulative) |
|-------|------------|-------|-------------------|
| 1,000 | 50 | $20 | **$1,000** |
| 10,000 | 500 | $20 | **$10,000** |
| 100,000 | 5,000 | $20 | **$100,000** |

**Verdict:** Works well early (bootstrapping). Doesn't scale for ongoing infrastructure costs unless paired with a recurring option.

### Path 4: Hybrid — Tips + Freemium

**The recommended path.** Combine:

1. **Free tier** — full local-only experience. No account needed. Works offline.
2. **"Buy me a coffee" button** — visible but not pushy. In the footer or settings.
3. **Pro tier ($4/mo or $36/year)** — cloud sync, browser extension, unlimited bookmarks, shared collections.
4. **Lifetime option ($50)** — for users who prefer one-time payment. Covers ~1 year of their infrastructure cost.

**Why this works:**
- Free users pay nothing, generate zero infrastructure cost (local only).
- Tipping captures goodwill from users who appreciate the privacy stance.
- Pro captures users who need sync (the expensive feature to operate).
- Lifetime captures the anti-subscription crowd without losing money.

The key insight from the scaling doc: **free users on local-only storage cost you nothing.** Clerk, Convex, and the expensive infrastructure only kick in when users want cloud sync. So the paywall aligns perfectly with the cost structure — users who create costs are the ones paying.

---

## Part 3: Cost Impact Summary

### Features (script-based, no LLM)

| Feature | Additional cost | Implementation |
|---------|----------------|----------------|
| Auto-populate bookmark name | ~$0 | Fetch `<title>` tag during favicon fetch |
| Import Chrome/Firefox bookmarks | $0 | DOM parser for Netscape HTML format |

**Total added cost: $0/mo at any scale.** Both features are pure client-side or piggyback on existing server calls.

### Revenue vs Infrastructure

| Users | Infrastructure cost | Tips only | Freemium only | Hybrid |
|-------|--------------------|-----------|--------------:|-------:|
| 1,000 | $0/mo | $80/mo | $120/mo | $150/mo |
| 10,000 | $22/mo | $800/mo | $1,200/mo | $1,500/mo |
| 100,000 | $65–83/mo | $8,000/mo | $12,000/mo | $14,000/mo |
| 1,000,000 | $18,000/mo | $8,000/mo | $120,000/mo | $125,000/mo |

Tips alone don't cover costs at 1M users. Freemium does, comfortably. The hybrid model gives you the best of both — goodwill from the free/tipping crowd, sustainability from the paying users.

---

## Recommendations

1. **Start with a tip jar (today).** Ko-fi or GitHub Sponsors. Zero effort. Captures early supporters.
2. **Script both features.** Title extraction + import parsing. No LLM cost, no API dependency, faster and more reliable.
3. **Plan the freemium gate around sync.** Free = local only. Paid = cloud sync + extension. This naturally aligns cost with revenue.
4. **Don't rush the paywall.** Build the user base first. A generous free tier with a visible tip jar builds more long-term value than an early paywall that scares users away.
5. **When you add the paywall, use Stripe directly.** Clerk doesn't handle payments. Stripe's checkout is embeddable, handles subscriptions, and takes 2.9% + $0.30. No middleman fee like ExtensionPay.
