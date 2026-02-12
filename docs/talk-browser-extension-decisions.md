# Building a Browser Extension: The Decisions Nobody Talks About

> Talk outline / educational content — from the Brute Bookmarks development journal.

---

## The Starting Point

You have a web app. It works. Users log in, manage their bookmarks, everything syncs in real-time across devices via Convex. Now someone asks: "Can you make a browser extension?"

The instinct is to think of it as "the same app, but smaller." That instinct is wrong, and the decisions you make in the first hour will determine whether you're maintaining one product or three.

---

## Decision 1: How Do You Organize the Code?

### The Obvious Answer (Wrong)

Three folders. One per browser.

```
extensions/
  chrome/
  firefox/
  safari/
```

Each contains its own copy of the popup, background script, content script. Each has its own manifest. It feels clean. It feels organized.

It's a maintenance trap.

Chrome and Firefox both use the **WebExtensions API** — the same standard. The popup is the same HTML/CSS/JS. The background script uses the same APIs. The content script reads the same page metadata. The *only* real differences are:

- Chrome requires Manifest V3. Firefox supports V3 with one extra field (`browser_specific_settings.gecko`).
- Safari doesn't even have its own format — Apple provides a tool (`safari-web-extension-converter`) that takes a standard Chrome extension and wraps it in an Xcode project.

So you'd be maintaining three copies of 95% identical code. Every bug fix applied three times. Every feature added three times. Every test run three times. For what? A few lines of manifest difference.

### The Right Answer

One source of truth. Per-browser outputs at build time.

```
extension/
  src/           ← All shared code lives here
  manifests/
    chrome.json
    firefox.json
  dist/          ← Build step generates per-browser packages
    chrome/
    firefox/
    safari/      ← Generated from Chrome output via Xcode tool
```

One codebase. One bug fix. Three outputs.

### The Even Better Answer

Don't write the build plumbing yourself. Use **WXT** (or Plasmo) — a framework that handles cross-browser builds automatically. WXT is Vite-based (matching our existing stack), TypeScript-first, and handles manifest generation for all browsers from a single config.

**The lesson:** When multiple platforms share 95% of their API, the right abstraction is at the build layer, not the source layer. You don't write three apps — you write one app with three output targets.

---

## Decision 2: What Does the Extension Actually Do?

This is the decision that saves you months of work.

The original research (pre-Convex) imagined the extension as a *standalone app* — storing bookmarks in `chrome.storage`, caching icons in IndexedDB, managing categories inside the popup. Essentially rebuilding the entire web app inside a browser extension.

But that was before the web app had a real-time backend. Now the app has Convex. Users have accounts. Their data lives in the cloud. So the question becomes:

**Is the extension a second app, or a companion to the first?**

The answer is companion. The extension does exactly one thing well: **save the current page as a bookmark.** That's it.

- No browsing bookmarks (that's the web app)
- No drag-and-drop reordering (that's the web app)
- No category creation (that's the web app)
- No icon picking (use the favicon automatically; users customize later in the app)

The extension is a doorbell, not a house.

### The Flow

**One category?** Click the icon. Bookmark saved. Done. No popup, no interaction.

**Multiple categories?** Click the icon. A small panel drops down showing your categories. Tap one. Bookmark saved. Panel closes.

**Already saved?** Click the icon. "Already saved in [Work]." Option to save again elsewhere.

**First time?** A welcome screen explaining: set Brute Bookmarks as your homepage or new tab page for browsing, use this button for quick saves.

Three Convex functions. That's all the extension needs:
- `categories.list` — to show the picker
- `bookmarks.listAll` — to check duplicates
- `bookmarks.create` — to save

The lesson: a companion extension that does one thing perfectly is better than a miniature clone of your main app. Users don't want to manage bookmarks in a 400px popup. They want to save and get back to what they were doing.

---

## Decision 3: How Does the Extension Know Who You Are?

This is the most interesting decision, because it's where user experience and security collide.

The extension needs to save bookmarks to *your* account. Your account lives in Clerk (authentication) connected to Convex (database). So the extension needs to prove your identity. Three ways to do it:

### Option A: Shared Cookies

The most invisible option. The extension silently reads Clerk's authentication cookie from the `brutebookmarks.com` domain. The user never knows it happened — install the extension, and it just works.

**Why it's tempting:** Zero friction. No sign-in step.

**Why it's dangerous:**
- You're reading cookies from another domain. Browsers are actively restricting this (for good reason — it's the same mechanism trackers use).
- Safari blocks it entirely.
- Chrome's Manifest V3 is tightening cookie access with every update.
- If Clerk changes their cookie format (which they can do at any time), your extension silently breaks for every user.
- You're building on sand.

### Option B: Copy-Paste Token

The web app generates a connection code: `brtbk_a8f3e2c1...`. The user copies it, opens the extension, pastes it in.

**Why it's tempting:** Simple to build. No OAuth complexity. No third-party SDK.

**Why it fails:** You're asking non-technical users to copy a 32-character string between two interfaces. Half won't finish. The other half will screenshot it and post it on Twitter. Tokens expire. Users forget where the setting is. It feels like connecting a printer in 2005.

### Option C: Clerk's Extension SDK

Clerk publishes `@clerk/chrome-extension`. Click "Sign in" in the extension → Clerk's login page opens → if you're already logged into Brute Bookmarks in this browser, Clerk recognizes you instantly → window closes → done forever.

**What the user experiences:**
1. Install extension
2. Click icon
3. Click "Sign in"
4. A window flashes open and immediately closes (because they're already logged in)
5. Never think about it again

**Why this wins:**
- One extra click (compared to shared cookies), but it works reliably forever
- Same auth system as the main app — no second account, no token management
- Clerk maintains the SDK — browser API changes are their problem, not yours
- Works identically across Chrome, Firefox, and Safari
- Secure by design — follows OAuth 2.0 standards

**The lesson:** The best auth is the one users do once and forget about. Option C costs one click of setup and zero ongoing friction. Option A costs zero clicks but can break at any time. The math is clear.

---

## The Meta-Lesson

Every decision followed the same pattern:

1. **The obvious solution creates duplication.** Three folders, standalone extension, copy-paste tokens — they all seem simpler but multiply your maintenance surface.

2. **The right solution reuses what exists.** Shared codebase with build targets. Companion extension that calls existing APIs. Auth SDK that leverages existing sessions.

3. **Robustness beats cleverness.** Shared cookies are clever. Clerk's SDK is boring. Boring ships. Boring doesn't break at 2 AM when Chrome pushes an update.

When you're building on top of an existing system, the best extension of that system is the one that extends the least amount of new surface area.

---

## Stack Summary

| Component | Choice | Why |
|-----------|--------|-----|
| Framework | WXT | Vite-based, TypeScript, auto cross-browser builds |
| Code structure | Monorepo subdirectory | Shares types with main app, no drift |
| Scope | Quick-save companion | One job done well > miniature clone |
| Auth | Clerk Extension SDK | One-click setup, works everywhere, maintained by Clerk |
| Backend calls | Convex HTTP client | 3 functions: list categories, check duplicates, create bookmark |
| Browsers | Chrome, Firefox, Safari | One source, three build outputs |
