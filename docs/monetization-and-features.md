# Brute Bookmarks — Monetization Strategy

> Last updated: February 2026.

---

## Constraints

- No ads
- No user tracking
- Privacy-first identity (this is a selling point, not a limitation)

## Competitive Benchmark

Speed Dial — the closest competitor — charges **~$1/mo** for sync and premium features. This is the price point users in this space expect. Pricing above this creates friction; pricing at or below it removes the "is it worth it?" hesitation.

At $1/mo, conversion rates are significantly higher than at $3-5/mo. This is impulse-buy territory — users don't deliberate over a dollar the way they do over a coffee. Expected conversion: **5-8%** of active users (vs 2-3% at $4/mo).

---

## Path 1: Pay-What-You-Want / Tip Jar

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

Conversion rates for tip-based models are typically 1-3% of active users. Average tip: $3-5.

| Users | Tippers (2%) | Avg tip | Monthly |
|-------|-------------|---------|---------|
| 1,000 | 20 | $4 | **$80/mo** |
| 10,000 | 200 | $4 | **$800/mo** |
| 100,000 | 2,000 | $4 | **$8,000/mo** |

These are one-time tips, not recurring. Repeat tipping is rare (~10% of tippers tip again). So this is more like $80/mo at 1K users growing slowly, not compounding.

**Verdict:** Good as a starting point. Low friction, matches your values. Won't scale to cover costs at 1M users. Works well as a complement to other paths.

## Path 2: Freemium — Free Core + Paid Sync

**How it works:** The bookmark manager is free forever. Cloud sync and premium features unlock with a subscription.

**What could be premium:**

| Feature | Why users pay |
|---------|--------------|
| Cross-device sync | Already built (Convex + Clerk) |
| Browser extension | Quick-save from any page |
| Unlimited bookmarks | Free tier capped at 100-200 |
| Shared collections | Collaborative bookmarks |

**Pricing model:** $1/mo or $10/year — matching the Speed Dial benchmark.

**Realistic revenue:**

At $1/mo, the lower price drives higher conversion. Utility apps at this price point see 5-8% conversion.

| Users | Paid (6%) | Price | Monthly |
|-------|----------|-------|---------|
| 1,000 | 60 | $1/mo | **$60/mo** |
| 10,000 | 600 | $1/mo | **$600/mo** |
| 100,000 | 6,000 | $1/mo | **$6,000/mo** |
| 1,000,000 | 60,000 | $1/mo | **$60,000/mo** |

**Verdict:** This scales. At 100K users, $6K/mo comfortably covers infrastructure ($65-83/mo from the scaling doc). At 1M users, $60K/mo covers the $18K/mo infrastructure with room to grow.

**The paywall sweet spot:**

- **Free forever:** Bookmarks, categories, drag-drop, themes, import/export, local storage
- **Paid:** Sync across devices, browser extension, shared collections, unlimited bookmarks

Sync is the natural paywall. It's the feature that requires infrastructure (Convex, Clerk) and it's the feature users *expect* to pay for. Users intuitively understand that "keeping my data on multiple devices" costs money to run.

## Path 3: One-Time Purchase (Lifetime License)

**How it works:** Pay once, use forever. Like buying software in 2005.

**Pricing:** $12-15 lifetime (roughly 1 year of subscription).

**Pros:**
- Simple. No subscription fatigue.
- Appeals to users who hate recurring charges.
- Strong for privacy-focused audience ("I pay once, you never need to bill me again").

**Cons:**
- Doesn't cover ongoing costs (Convex, Clerk, Vercel are monthly).
- Need constant new users to sustain revenue.

**Realistic revenue:**

| Users | Buyers (5%) | Price | Total (cumulative) |
|-------|------------|-------|-------------------|
| 1,000 | 50 | $12 | **$600** |
| 10,000 | 500 | $12 | **$6,000** |
| 100,000 | 5,000 | $12 | **$60,000** |

**Verdict:** Works well early (bootstrapping). Doesn't scale for ongoing infrastructure costs unless paired with a recurring option.

## Path 4: Hybrid — Tips + Freemium (Recommended)

**The recommended path.** Combine:

1. **Free tier** — full local-only experience. No account needed. Works offline.
2. **"Buy me a coffee" button** — visible but not pushy. In the footer or settings.
3. **Pro tier ($1/mo or $10/year)** — cloud sync, browser extension, unlimited bookmarks, shared collections.
4. **Lifetime option ($15)** — for users who prefer one-time payment. Covers ~15 months of their infrastructure cost.

**Why this works:**
- Free users pay nothing, generate zero infrastructure cost (local only).
- Tipping captures goodwill from users who appreciate the privacy stance.
- Pro captures users who need sync (the expensive feature to operate).
- Lifetime captures the anti-subscription crowd without losing money.

The key insight from the scaling doc: **free users on local-only storage cost you nothing.** Clerk, Convex, and the expensive infrastructure only kick in when users want cloud sync. So the paywall aligns perfectly with the cost structure — users who create costs are the ones paying.

---

## Revenue vs Infrastructure

| Users | Infrastructure cost | Tips only | Freemium ($1/mo) | Hybrid |
|-------|--------------------|-----------|-----------------:|-------:|
| 1,000 | $0/mo | $80/mo | $60/mo | $140/mo |
| 10,000 | $22/mo | $800/mo | $600/mo | $1,400/mo |
| 100,000 | $65-83/mo | $8,000/mo | $6,000/mo | $14,000/mo |
| 1,000,000 | $18,000/mo | $80,000/mo | $60,000/mo | $130,000/mo |

Tips alone cover costs at 1M users, but barely and unreliably (one-time, not recurring). Freemium at $1/mo covers it sustainably. The hybrid model gives you the best of both: goodwill from the free/tipping crowd, sustainability from the paying users.

---

## Recommendations

1. **Start with a tip jar (today).** Buy Me a Coffee is already in the footer. Captures early supporters.
2. **Plan the freemium gate around sync.** Free = local only. Paid = cloud sync + extension. This naturally aligns cost with revenue.
3. **Price at $1/mo or $10/year.** Match the Speed Dial benchmark. Lower price = higher conversion = more sustainable than a $4 price point that scares users away.
4. **Don't rush the paywall.** Build the user base first. A generous free tier with a visible tip jar builds more long-term value than an early paywall.
5. **Use Stripe directly.** Clerk doesn't handle payments. Stripe's checkout is embeddable, handles subscriptions, and takes 2.9% + $0.30. No middleman fee.

### Future LLM features (premium tier)

If you eventually want AI-powered premium features, the valuable ones would be:
- **Smart categorization** — "Put this bookmark in the right category based on its content"
- **Bookmark discovery** — "Suggest sites similar to my bookmarks"
- **Natural language search** — "Find that cooking blog I saved last month"

These genuinely need language understanding and could justify a higher premium tier down the line.
