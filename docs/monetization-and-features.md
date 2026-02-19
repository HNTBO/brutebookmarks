# BruteBookmarks — Monetization Strategy

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

**Pricing:** $25 lifetime (~2 years of subscription value).

At $25, the price is high enough to be sustainable per-user while still being impulse-friendly for a tool people use daily. It's roughly 2 years of Pro at $1/mo — users who stick around longer than that are getting a deal, and the upfront cash helps fund development now.

**Pros:**
- Simple. No subscription fatigue.
- Appeals to users who hate recurring charges.
- Strong for privacy-focused audience ("I pay once, you never need to bill me again").
- $25 is more sustainable per-user than $12-15 — covers ~2 years of infrastructure cost per user.

**Cons:**
- Doesn't cover ongoing costs (Convex, Clerk, Vercel are monthly).
- Need constant new users to sustain revenue.

**Realistic revenue:**

| Users | Buyers (5%) | Price | Total (cumulative) |
|-------|------------|-------|-------------------|
| 1,000 | 50 | $25 | **$1,250** |
| 10,000 | 500 | $25 | **$12,500** |
| 100,000 | 5,000 | $25 | **$125,000** |

**Verdict:** Works well early (bootstrapping). Better per-user economics at $25 than at $12. Still doesn't cover ongoing infrastructure costs alone, but pairs well with the subscription option.

## Path 4: Hybrid — Tips + Freemium (Recommended)

**The recommended path.** Combine:

1. **Free tier** — full local-only experience. No account needed. Works offline.
2. **"Buy me a coffee" button** — visible but not pushy. In the footer or settings.
3. **Pro tier ($1/mo or $10/year)** — cloud sync, browser extension, unlimited bookmarks, shared collections.
4. **Lifetime option ($25)** — for users who prefer one-time payment. Covers ~2 years of their infrastructure cost.

### Early Adopter Program: First 1,000 Users Get Pro Free Forever

The first 1,000 users who sign up get the full Pro experience — sync, extension, unlimited bookmarks — at no cost, permanently. This is a deliberate growth lever:

- **Seed the user base.** 1,000 active users generating word-of-mouth is worth far more than 1,000 × $1/mo ($1K/mo). At that scale, infrastructure costs are near-zero anyway (~$0/mo at 1K users from the scaling doc).
- **Create evangelists.** Users who got something valuable for free feel loyalty. They leave reviews, share with friends, defend the product in forums. You can't buy that.
- **Build social proof.** The Chrome Web Store listing needs reviews and install counts to rank. Free early adopters drive both.
- **Test at scale before charging.** Real users find real bugs. Better to iron out the payment flow, sync edge cases, and onboarding friction with a cohort that isn't paying yet.
- **Create urgency.** "749 of 1,000 free spots remaining" is a powerful motivator. FOMO works even at $1/mo.

The math: 1,000 free Pro users cost roughly $0-22/mo in infrastructure (from the scaling doc). That's the price of a good marketing campaign — except these users stick around and bring others.

**When to flip the switch:** Once you hit 1,000 Pro users, new users see the paid tiers. The founding 1,000 keep their free access forever — it's a promise, and keeping it builds trust.

**Why this works:**
- Free users pay nothing, generate zero infrastructure cost (local only).
- Early adopters get Pro free, seeding reviews and word-of-mouth at negligible cost.
- Tipping captures goodwill from users who appreciate the privacy stance.
- Pro captures users who need sync (the expensive feature to operate).
- Lifetime captures the anti-subscription crowd without losing money.

The key insight from the scaling doc: **free users on local-only storage cost you nothing.** Clerk, Convex, and the expensive infrastructure only kick in when users want cloud sync. So the paywall aligns perfectly with the cost structure — users who create costs are the ones paying.

---

## Revenue vs Infrastructure

**Assumptions:** 6% of non-founding users convert to paid. Of those, 70% choose subscription ($1/mo), 30% choose lifetime ($25 one-time). Tips at 2% of all users, $4 avg. Lifetime revenue amortized over 24 months for monthly comparison.

### Paid user breakdown

| Users | Founding (free) | Paying pool | Subscribers (70%) | Lifetime (30%) |
|-------|:-:|:-:|:-:|:-:|
| 1,000 | 1,000 | 0 | 0 | 0 |
| 10,000 | 1,000 | 540 | 378 | 162 |
| 100,000 | 1,000 | 5,940 | 4,158 | 1,782 |
| 1,000,000 | 1,000 | 59,940 | 41,958 | 17,982 |

### Monthly revenue

| Users | Infra cost | Tips | Subscriptions | Lifetime (amortized/mo) | **Hybrid total** |
|-------|:-:|:-:|:-:|:-:|:-:|
| 1,000 | $0/mo | $80 | $0 | $0 | **$80/mo** |
| 10,000 | $22/mo | $800 | $378 | $169 | **$1,347/mo** |
| 100,000 | $65-83/mo | $8,000 | $4,158 | $1,856 | **$14,014/mo** |
| 1,000,000 | $18,000/mo | $80,000 | $41,958 | $18,735 | **$140,693/mo** |

Lifetime amortized = (lifetime buyers × $25) ÷ 24 months. This is a conservative view — in practice, new users buying lifetime every month creates a steady revenue stream on top of the amortized base.

At every scale, the hybrid model comfortably covers infrastructure. Tips alone are unreliable (one-time, not recurring). Subscriptions provide the predictable base. Lifetime purchases add meaningful upfront cash — at 1M users, lifetime buyers alone generate ~$450K cumulative, which is a significant runway buffer. The early adopter giveaway costs almost nothing at the 1K scale and becomes invisible at 10K+.

---

## Studio Tier — $2/mo or $16/year

A higher tier on top of Pro for users who want full personalization.

### What's included (everything in Pro, plus)

| Feature | Description |
|---------|-------------|
| Custom app name | Replace "BruteBookmarks" with whatever you want |
| Icon Studio | Full icon creation/editing tools (search, upload, crop, emoji, favicon) |

### Pricing

| Plan | Price | Savings vs monthly |
|------|-------|--------------------|
| Monthly | $2/mo | — |
| Yearly | $16/year | 33% off |

### Studio tier projections

**Assumptions:** Of the 6% who convert to paid, 80% choose Pro ($1/mo), 20% choose Studio ($2/mo). Lifetime buyers excluded here — they're already in the hybrid model above.

| Users | Pro subscribers | Studio subscribers | Pro revenue | Studio revenue | **Combined sub revenue** |
|-------|:-:|:-:|:-:|:-:|:-:|
| 1,000 | 0 | 0 | $0 | $0 | **$0/mo** |
| 10,000 | 302 | 76 | $302 | $152 | **$454/mo** |
| 100,000 | 3,326 | 832 | $3,326 | $1,664 | **$4,990/mo** |
| 1,000,000 | 33,566 | 8,392 | $33,566 | $16,784 | **$50,350/mo** |

The Studio tier is pure margin — custom app names and Icon Studio don't add infrastructure cost. At 100K users, Studio subscribers alone add ~$1,664/mo on top of the hybrid model. At 1M, it's an extra ~$16.8K/mo. This is money for nothing operationally.

---

## Recommendations

1. **Start with a tip jar (today).** Buy Me a Coffee is already in the footer. Captures early supporters.
2. **Launch with the early adopter program.** First 1,000 users get Pro free forever. This seeds your user base, generates Chrome Web Store reviews, and costs you nearly nothing at that scale.
3. **Plan the freemium gate around sync.** Free = local only. Paid = cloud sync + extension. This naturally aligns cost with revenue.
4. **Price at $1/mo, $10/year, or $25 lifetime.** Three tiers for three mindsets: monthly for the cautious, annual for the committed, lifetime for the anti-subscription crowd.
5. **Don't rush the paywall.** Build the user base first. A generous free tier with a visible tip jar builds more long-term value than an early paywall.
6. **Use Stripe directly.** Clerk doesn't handle payments. Stripe's checkout is embeddable, handles subscriptions, and takes 2.9% + $0.30. No middleman fee.

### Future LLM features (premium tier)

If you eventually want AI-powered premium features, the valuable ones would be:
- **Smart categorization** — "Put this bookmark in the right category based on its content"
- **Bookmark discovery** — "Suggest sites similar to my bookmarks"
- **Natural language search** — "Find that cooking blog I saved last month"

These genuinely need language understanding and could justify a higher premium tier down the line.
