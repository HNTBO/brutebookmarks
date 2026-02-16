# Chrome Web Store Submission Guide — Brute Bookmarks

Step-by-step checklist for publishing the Brute Bookmarks extension on the Chrome Web Store, current as of February 2026.

---

## 1. Developer Account Setup

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Sign in with your Google account
3. **Enable 2-Step Verification** on your Google account (mandatory since 2021)
4. Pay the **$5 one-time registration fee**
5. Accept the Developer Agreement
6. **Declare Trader / Non-Trader status** (EU Digital Services Act, mandatory since Feb 2024)

### Trader vs Non-Trader

| | Trader | Non-Trader |
|---|---|---|
| Definition | Acting for trade, business, or profession | Personal/hobby project |
| Required info | Legal name, phone, physical address | None |
| Public disclosure | Your contact info shown on listing | Nothing extra |

**For Brute Bookmarks**: If you plan to monetize (premium tier, ads), declare as **Trader**. If it's a free tool with no commercial intent, **Non-Trader** is fine. You can change this later.

---

## 2. Required Assets

### Icons (already done)

You already have these in `extension/public/`:
- `icon-16.png` — 16x16
- `icon-32.png` — 32x32
- `icon-48.png` — 48x48
- `icon-128.png` — 128x128

The 128x128 is the main store icon. Best practice: 96x96 actual artwork with 16px transparent padding. Verify yours follows this convention.

### Screenshots (NEED TO CREATE)

| Requirement | Details |
|---|---|
| Minimum | 1 screenshot |
| Recommended | 3-5 screenshots |
| Dimensions | **1280x800** (recommended) or 640x400 |
| Format | PNG or JPEG |

**What to capture:**
1. New tab page with bookmark grid (main feature)
2. Quick-add via context menu (right-click save)
3. Popup interface (toolbar button)
4. Drag-and-drop reordering
5. Category management

**How to capture:**
- Chrome DevTools → Device toolbar → set viewport to 1280x800
- Or use a screenshot extension that crops to exact dimensions
- Show real bookmarks, not empty state

### Promotional Images (NEED TO CREATE)

| Asset | Dimensions | Required? |
|---|---|---|
| Small tile | **440x280** | Yes |
| Large tile | 920x680 | No (for featured collections) |
| Marquee | 1400x560 | No (for homepage carousel) |

The **small tile (440x280)** is the one that appears in search results and category pages. Make it branded, not just a screenshot — think "app icon + tagline on a clean background."

---

## 3. Store Listing Copy

### Name
**Brute Bookmarks** (max 75 characters — you're good)

### Summary (max 132 characters)
This appears in search results. Must be punchy and clear:

> Your new tab, organized. Bookmark manager with real-time sync, drag-and-drop categories, and quick-save from any page.

(127 characters)

### Description (max 16,000 characters)
Write a full description covering:

- **What it does** (1-2 sentences)
- **Key features** (bullet list)
- **How sync works** (Convex backend, Clerk auth)
- **Privacy commitment** (what data you collect, what you don't)
- **Permissions explained** (why each permission is needed)

### Category
**Productivity** (best fit for bookmark managers)

### Permission Justifications
You'll be asked to justify each permission:

| Permission | Justification |
|---|---|
| `activeTab` | Read the current tab's URL and title when user clicks "Save bookmark" |
| `storage` | Store bookmark data and user preferences locally on device |
| `bookmarks` | Import bookmarks from Chrome's built-in bookmark manager |
| `host_permissions (convex.cloud)` | Sync bookmark data across devices via encrypted connection to Convex backend |

---

## 4. Privacy Policy

### Why it's required
You use `bookmarks` (user data), `storage` (stores user data), and `host_permissions` (transmits data to convex.cloud). All three trigger the privacy policy requirement.

### What it must cover
1. **What data you collect**: bookmark URLs, titles, category names, user preferences
2. **How you use it**: organizing and displaying bookmarks, syncing across devices
3. **How you transmit it**: HTTPS/TLS encrypted connection to Convex Cloud
4. **Who you share it with**: Convex (infrastructure only), Clerk (authentication only)
5. **What you don't do**: no selling data, no ads targeting, no analytics on bookmark content
6. **Data deletion**: how users can delete their data
7. **Contact info**: how to reach you about privacy concerns

### Where to host it
Options:
- **GitHub Pages** — free, easy, version-controlled (recommended)
- **Your domain** — if you have brutebookmarks.com or similar
- **Notion public page** — quick but less professional

The URL goes in the Developer Dashboard under "Privacy practices."

### In-Extension Disclosure
Chrome requires a **prominent disclosure** shown to users before you collect data. Add a first-run notice in the extension that explains:
- "Brute Bookmarks syncs your bookmarks to the cloud via Convex so they're available on all your devices."
- Include an "I understand" or "Continue" button

---

## 5. Build & Package

### Build the extension
```bash
cd extension
npm run build
# or: npx wxt build
```

WXT outputs to `extension/.output/chrome-mv3/` (or similar).

### Create the ZIP
```bash
cd .output/chrome-mv3
zip -r ../../brute-bookmarks-extension.zip .
```

The ZIP is what you upload to the Developer Dashboard.

### Pre-upload checks
- [ ] `manifest.json` has version number incremented
- [ ] All icons present and correct sizes
- [ ] No `console.log` debug statements in production
- [ ] No hardcoded dev URLs (should point to production Convex)
- [ ] Extension tested on latest Chrome stable

---

## 6. Submit for Review

1. Go to [Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Click **"New Item"**
3. Upload the ZIP file
4. Fill in all store listing fields (name, summary, description)
5. Upload screenshots and promotional images
6. Set privacy policy URL
7. Fill permission justifications
8. Select category (Productivity)
9. Set visibility (Public)
10. Click **"Submit for Review"**

### Review timeline
- **Typical**: 1-3 business days
- **First submission**: may take longer (up to 7 days)
- **Sensitive permissions** (`bookmarks`): may trigger manual review

### Common rejection reasons
1. **Missing/incomplete privacy policy** — most common
2. **Unused permissions** — requesting permissions you don't actually use
3. **Misleading description** — features described but not implemented
4. **No in-extension data disclosure** — required before first data collection
5. **Vague description** — "best bookmark manager ever" without specifics

### If rejected
- You'll get an email explaining which policy was violated
- Fix the issue
- Resubmit (no additional fee)
- If you disagree: use the [One Stop Support form](https://support.google.com/chrome_webstore/contact/one_stop_support) to appeal

---

## 7. Post-Publication

- **Updates**: Upload new ZIP to dashboard, increment version, submit for review
- **User reviews**: Monitor and respond to feedback
- **Analytics**: Dashboard shows installs, uninstalls, impressions
- **Firefox**: Consider submitting to [Firefox Add-ons (AMO)](https://addons.mozilla.org/) — WXT already supports Firefox MV2 builds

---

## Quick Reference: Full Checklist

### Account
- [ ] Google 2FA enabled
- [ ] $5 fee paid
- [ ] Trader/Non-Trader declared

### Assets
- [ ] Icons: 16, 32, 48, 128 PNG (already have these)
- [ ] Screenshots: 3-5 at 1280x800
- [ ] Small promotional tile: 440x280

### Content
- [ ] Extension name
- [ ] Summary (132 chars)
- [ ] Full description
- [ ] Permission justifications
- [ ] Category: Productivity

### Privacy
- [ ] Privacy policy written
- [ ] Privacy policy hosted at public URL
- [ ] In-extension first-run disclosure added
- [ ] User consent mechanism (button/checkbox)

### Technical
- [ ] Production build passes
- [ ] All permissions actually used
- [ ] No debug code
- [ ] Tested on latest Chrome
- [ ] ZIP created from build output

### Submit
- [ ] All fields filled in dashboard
- [ ] All assets uploaded
- [ ] Review submitted
