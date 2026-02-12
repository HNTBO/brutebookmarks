# Brute Bookmarks — Scaling & Cost Thresholds

> Last updated: February 2026. Prices may change — always verify against official pricing pages.

## TL;DR

| Users | Clerk | Convex | Vercel | **Total** |
|-------|-------|--------|--------|-----------|
| **1,000** | $0 | $0 | $0 | **$0/mo** |
| **10,000** | $0 | ~$2 | $20* | **~$22/mo** |
| **100,000** | $20 | ~$25-43 | ~$20 | **~$65-83/mo** |
| **1,000,000** | $17,220 | ~$361-455 | ~$250 | **~$18K/mo** |

*Vercel Hobby is non-commercial. Any revenue = Pro at $20/mo minimum.*

At 1M users, **Clerk is 95% of your bill**. Everything else is noise by comparison.

---

## Service-by-Service Breakdown

### 1. Clerk (Authentication)

#### Free Tier: 50,000 MRUs

Clerk bills on **Monthly Retained Users (MRU)**, not MAU. A user only counts if they return **more than 24 hours** after sign-up ("First Day Free" policy). For a bookmark manager where users come back daily, MRU ≈ MAU.

**Free tier includes:**
- 50,000 MRUs per app
- 3 social login providers
- 3 dashboard seats
- Fixed 7-day session lifetime

**Free tier does NOT include:**
- MFA / Passkeys
- Remove Clerk branding
- Custom email/SMS templates
- Configurable session lifetime
- Enterprise SSO (SAML/OIDC)

#### What Triggers Paid

You need **Pro ($20/mo)** if you want MFA, passkey support, branding removal, configurable sessions, or more than 3 social providers. The MRU limit alone won't force you — 50K is very generous.

#### Overage Pricing (Pro plan, per MRU/month)

| MRU Range | Cost |
|-----------|------|
| 1–50,000 | Included |
| 50,001–100,000 | $0.02 |
| 100,001–1,000,000 | $0.018 |
| 1,000,001–10,000,000 | $0.015 |

#### Cost at Scale (Pro plan, annual billing)

| Users | Base | Overage | Total |
|-------|------|---------|-------|
| 1,000 | $20 | $0 | **$20/mo** |
| 10,000 | $20 | $0 | **$20/mo** |
| 100,000 | $20 | $1,000 | **$1,020/mo** |
| 1,000,000 | $20 | $17,200 | **$17,220/mo** |

**Key insight:** Clerk is by far the most expensive service at scale. At 1M users, it's $17K/mo. This is the number that should inform any future "build vs buy" auth decision.

**Hidden cost:** SMS-based OTP is $0.01/SMS (US). If 10% of 1M users do phone verification monthly, that's $1,000/mo on top.

---

### 2. Convex (Real-time Backend)

#### Free Tier: Starter Plan

| Resource | Free Allowance |
|----------|---------------|
| Function calls | 1,000,000/mo |
| Database storage | 0.5 GB |
| Database bandwidth | 1 GB/mo |
| File storage | 1 GB |
| File bandwidth | 1 GB/mo |
| Action compute | 20 GB-hours |

**Concurrency limit on Starter: 16 queries/mutations.** This is the real constraint — if 20 users load the app simultaneously, queries queue up.

#### What Triggers Paid

There's no hard paywall. Starter is pay-as-you-go with overages. But you'll want **Pro ($25/dev/month)** for:
- Higher concurrency (256+ vs 16)
- Custom domains
- Automatic backups
- Preview deployments
- ~10% lower per-unit rates

#### Cost Estimates (Bookmark Manager)

Assumptions per active user session:
- 3 subscriptions (categories, bookmarks, preferences)
- ~5 mutations/session (CRUD operations)
- ~18 function calls/day/active user
- 30% of registered users are daily active

**Starter Plan (free + overages):**

| Users | Function Calls | DB Bandwidth | Storage | **Total** |
|-------|---------------|--------------|---------|-----------|
| 1,000 | Free | Free | Free | **~$0/mo** |
| 10,000 | $1.36 | $0.44 | Free | **~$2/mo** |
| 100,000 | $33 | $6 | $2 | **~$43/mo** |
| 1,000,000 | $354 | $66 | $20 | **~$455/mo** |

**Pro Plan ($25/dev/month):**

| Users | Seat | Overages | **Total** |
|-------|------|----------|-----------|
| 1,000 | $25 | $0 | **$25/mo** |
| 10,000 | $25 | $0 | **$25/mo** |
| 100,000 | $25 | $0 | **$25/mo** |
| 1,000,000 | $25 | $336 | **$361/mo** |

**Key insight:** Pro's included quotas (25M function calls, 50 GB bandwidth) absorb everything up to 100K users. The $25/mo seat fee is the only cost. Pro becomes more cost-effective than Starter somewhere around 10K users.

**Gotcha — real-time subscriptions multiply costs:**
- Each subscription rerun = 1 function call
- Cache invalidation is document-level, not field-level
- Updating a bookmark's `order` field invalidates all queries reading that document
- Full result sets are re-sent (not diffs)

---

### 3. Vercel (Hosting)

#### Free Tier: Hobby Plan

| Resource | Included |
|----------|----------|
| Bandwidth | 100 GB/mo |
| Edge requests | 1,000,000/mo |
| Function invocations | 1,000,000/mo |
| Active CPU | 4 hours/mo |
| Build minutes | 6,000/mo |
| Concurrent builds | 1 |

**Critical restriction: Hobby is non-commercial only.** Any revenue from the app (ads, subscriptions, paid features) requires Pro.

#### What Triggers Paid

- **Commercial use** → Pro required ($20/mo)
- **Bandwidth > 100 GB/mo** → Pro required
- **Team collaboration** → Pro required (Hobby = 1 seat)
- **Function duration > 60s** → Pro allows up to 300s

#### Cost at Scale (Pro, $20/seat/month)

Assumptions: static site ~500 KB/page, 5 page views/visit, 20% of visits trigger API routes.

| Users | Bandwidth | Functions | **Total** |
|-------|-----------|-----------|-----------|
| 1,000 | ~2.5 GB (free) | Negligible | **$0 (Hobby) / $20 (Pro)** |
| 10,000 | ~25 GB (free) | Negligible | **$0 (Hobby) / $20 (Pro)** |
| 100,000 | ~250 GB (within 1TB Pro) | Negligible | **~$20/mo** |
| 1,000,000 | ~2.5 TB (1.5 TB overage) | ~$2 | **~$250/mo** |

**Key insight:** Vercel is cheap for this use case. Brute Bookmarks is a static frontend — Convex handles the real-time backend, so Vercel just serves HTML/JS/CSS. Bandwidth is the only cost driver, and it takes 1M+ users to matter.

**Gotcha — spend cap:** Pro has a default $200/mo spend cap. Projects pause at 100%. You must manually raise it before hitting scale.

---

## When Free Tiers Break

| Service | Free Until | First Dollar Trigger |
|---------|-----------|---------------------|
| **Clerk** | 50,000 MRUs (or need MFA/branding) | Pro features, not user count |
| **Convex** | ~1K users comfortably | Overages auto-kick in on Starter |
| **Vercel** | ~10K users (if non-commercial) | Commercial use or bandwidth |

**Realistically, you're at $0/mo until ~1,000 users.** At 10K, you're looking at ~$22-45/mo depending on whether you go Pro on Convex.

---

## Scaling Challenges

### 10K–50K Users: The Comfort Zone

No real challenges here. All three services handle this comfortably. Your main concern is:
- **Convex concurrency** — Starter's 16 concurrent query limit will bite you. Move to Pro.
- **Icon storage** — 50K users × 50 bookmarks × 10 KB/icon = 25 GB. Still within Pro's 100 GB file storage.

### 50K–100K Users: Monitoring Time

- **Clerk stays free** if you don't need Pro features. 50K MRU ceiling is right at this range.
- **Convex subscription reruns** start adding up. Optimize queries to return minimal data. Paginate bookmark lists instead of `.collect()` on everything.
- **Cache invalidation storms** — if many users are active simultaneously and mutating data, document-level invalidation causes cascading subscription reruns. Design mutations to touch fewer documents.

### 100K–500K Users: Architecture Decisions

- **Clerk becomes your biggest line item.** At 100K MRU, that's $1,000/mo in overages alone. Worth evaluating:
  - Do you need Clerk, or could you use a cheaper auth provider (Auth0, Supabase Auth, self-hosted)?
  - Clerk's value is convenience. At $1K/mo, the calculus changes.
- **Convex schema optimization matters.** The `by_category_order` index pattern works well, but:
  - Avoid `.collect()` without limits on large result sets
  - Consider splitting high-churn fields (like `order`) into separate documents to reduce cache invalidation
  - Monitor database bandwidth — full subscription results are re-sent on every change

### 500K–1M Users: Serious Infrastructure

- **Clerk: $8K–17K/mo.** This is where you either negotiate Enterprise pricing or migrate to a self-hosted auth solution (Keycloak, Ory). Migration cost: significant but one-time.
- **Convex: ~$400/mo.** Still reasonable. But watch for:
  - **Transaction limits** — 32,000 documents scanned per transaction, 16,000 written. Bulk operations (import, erase) may need chunking.
  - **1-second execution limit** on queries/mutations. Complex aggregations may timeout.
  - **No SQL** — if you need analytics/reporting, you'll need to export data (Airbyte connector on Pro) to a separate analytics DB.
- **Vercel: ~$250/mo.** Bandwidth-dominated. Consider:
  - CDN optimization (aggressive caching headers for static assets)
  - Image/icon optimization to reduce transfer sizes

### 1M+ Users: Platform Limits

At this point, the challenges are less about cost and more about architecture:

1. **Convex's real-time model has a ceiling.** 300K daily active users each holding 3 subscriptions = 900K concurrent subscriptions. Convex doesn't publish hard limits on this, but it's worth stress-testing. If you hit issues, you may need to:
   - Reduce subscription count (lazy-load categories)
   - Switch some reads from subscriptions to on-demand queries
   - Shard by user groups (multiple Convex deployments)

2. **Icon storage at 1M users ≈ 500 GB.** Consider:
   - Deduplicating icons (many users bookmark the same sites — hash-based filenames already help)
   - Moving icons to a dedicated object store (S3/R2) with a CDN instead of Convex file storage
   - Lazy-loading icons (don't fetch until visible)

3. **Data export/portability.** Users will want to export their data. The current JSON export works, but at scale you may need streaming exports or background jobs.

4. **Multi-region.** Convex currently runs in a single region. If your users are globally distributed, latency for real-time subscriptions becomes noticeable. No easy fix without Convex adding multi-region support.

---

## Decision Points Summary

| Users | Key Decision |
|-------|-------------|
| **1K** | None. Enjoy the free tiers. |
| **10K** | Move Convex to Pro ($25/mo) for concurrency. Go Vercel Pro ($20/mo) if commercial. |
| **50K** | Evaluate whether you need Clerk Pro features. If yes, $20/mo. If not, still free. |
| **100K** | Clerk overages start ($1K/mo). Start evaluating auth alternatives. |
| **500K** | Clerk is $8K/mo. Decision time: negotiate Enterprise or migrate auth. |
| **1M** | Clerk is $17K/mo. Self-hosted auth likely saves $15K+/mo. Convex and Vercel are still manageable (~$600/mo combined). |

---

## Sources

- [Clerk Pricing](https://clerk.com/pricing) — Updated Feb 5, 2026
- [Convex Pricing](https://www.convex.dev/pricing)
- [Convex Platform Limits](https://docs.convex.dev/production/state/limits)
- [Vercel Pricing](https://vercel.com/pricing)
- [Vercel Limits](https://vercel.com/docs/limits)
