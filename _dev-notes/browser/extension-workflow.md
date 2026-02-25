# Browser Extension Workflow

All commands run from the `extension/` directory.

## How it works

Both `npm run dev` and `npm run build` output an unpacked extension to `extension/.output/chrome-mv3/`. Chrome doesn't know about your code — it only knows about that folder. You need to tell Chrome to watch it once via **Load unpacked**, and after that Chrome reads whatever is in there.

- `npm run dev` — actively manages the folder contents with a dev server and auto-reloads Chrome on file changes.
- `npm run build` — writes a static snapshot to the folder and stops.

They both use the same output folder. The difference is whether a dev server is keeping it alive or not.

## First-time setup (required once)

1. Run either `npm run dev` or `npm run build` (both create `.output/chrome-mv3/`)
2. Go to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** → select `extension/.output/chrome-mv3/`

After this, Chrome knows about the folder. You won't need to do this again unless you delete the output or remove the extension.

## Dev Mode (auto-reload)

```bash
npm run dev
```

Starts WXT dev server with HMR. Edit code, save, extension auto-reloads in Chrome. No need to run `npm run build` first — dev mode is self-contained.

### Gotcha: dev builds are temporary

The dev server injects a **temporary** extension into Chrome. When you stop the server (or close the terminal), that version disappears and Chrome falls back to whatever was last loaded via a static **build** — which may be several versions behind.

**Always run `npm run build` after finishing dev work**, then reload in `chrome://extensions`. That's the version that persists — and the one you should zip/submit.

## Build (one-time)

```bash
npm run build
```

Writes a static snapshot to `extension/.output/chrome-mv3/`. This version persists after terminal is closed. Reload in `chrome://extensions` to pick it up.

### Gotcha: dev vs production permissions are different

WXT silently adds `tabs` and `scripting` permissions in dev mode for its own HMR/hot-reload system. These are **not** your extension's permissions — they're WXT internals. In production, they get stripped out.

If your code uses `browser.tabs.query()`, `browser.tabs.create()`, or anything from the `tabs` API, it will work in dev but **silently fail in production** unless you explicitly declare `tabs` in `wxt.config.ts` → `manifest.permissions`.

**Rule of thumb:** if it works in dev but breaks in prod, check the permissions first.

### Gotcha: dev vs prod Convex URL in `extension/.env`

The extension bakes the Convex URL from `extension/.env` at build time. There are two separate environments:

- **Dev**: `https://mild-lyrebird-293.convex.cloud` + dev Clerk (`pk_test_`)
- **Prod**: `https://beaming-dalmatian-908.convex.cloud` + live Clerk (`pk_live_`)

The token and the Convex backend must match. A token from live Clerk sent to dev Convex (or vice versa) will fail with `NoAuthProvider`.

| Extension mode | Token source | Convex in `.env` | Works? |
| --- | --- | --- | --- |
| `npm run dev` | localhost (dev Clerk) | dev (`mild-lyrebird`) | Yes |
| `npm run dev` | brutebookmarks.com (live Clerk) | prod (`beaming-dalmatian`) | Yes |
| `npm run dev` | localhost (dev Clerk) | prod (`beaming-dalmatian`) | **No** |
| `npm run build` | brutebookmarks.com (live Clerk) | prod (`beaming-dalmatian`) | Yes |

**Recommendation:** Keep `extension/.env` pointed at **prod** Convex permanently and test the extension against brutebookmarks.com (the live site), not localhost. This way the `.env` is always submission-ready, you're testing against the real environment your users will use, and you avoid the entire token mismatch problem. The only reason to swap back to dev Convex would be if you're developing the extension and the main app simultaneously and need unreleased changes from both.

## Pre-submission checklist

Before zipping and submitting to the Chrome Web Store:

1. **Verify `extension/.env`** points to the **prod** Convex URL (`beaming-dalmatian-908`)
2. `npm run build` — fresh production build
3. **Permission audit** — compare `extension/.output/chrome-mv3/manifest.json` against `extension/.output/chrome-mv3-dev/manifest.json`. Look for permissions present in dev but missing in prod. If your code needs them, add them to `wxt.config.ts`.
4. Load unpacked from `.output/chrome-mv3/` and **test the production build** in Chrome (using brutebookmarks.com, not localhost) before submitting
5. `npm run zip` — package for submission

## Typical workflow

1. `npm run dev` — develop and test with auto-reload
2. Happy with changes → stop the dev server
3. Run through the **pre-submission checklist** above
4. Submit the zip to the Chrome Web Store

## All Commands

| Goal              | Command                  |
| ----------------- | ------------------------ |
| One-time build    | `npm run build`          |
| Dev + auto-reload | `npm run dev`            |
| Build for Firefox | `npm run build:firefox`  |
| Package as .zip   | `npm run zip`            |
