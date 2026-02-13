"""Security verification checklist - automated with Playwright."""
import sys, os
os.environ["PYTHONIOENCODING"] = "utf-8"
sys.stdout.reconfigure(encoding="utf-8")

import re
from playwright.sync_api import sync_playwright

RESULTS = []

def check(name, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    RESULTS.append((name, status, detail))
    print(f"  [{'✓' if passed else '✗'}] {name}" + (f" — {detail}" if detail else ""))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # Collect console messages
    console_messages = []

    page = browser.new_page()
    page.on("console", lambda msg: console_messages.append({
        "type": msg.type,
        "text": msg.text,
    }))

    print("\n=== Loading http://localhost:5173 ===\n")
    page.goto("http://localhost:5173", wait_until="networkidle")
    page.wait_for_timeout(3000)  # Extra time for async rendering

    # --- 1. CSP Violations ---
    print("1. CSP Violations")
    csp_errors = [m for m in console_messages if "content security policy" in m["text"].lower()]
    check("No CSP violations on load", len(csp_errors) == 0,
          f"{len(csp_errors)} violations found" if csp_errors else "Clean")
    for err in csp_errors[:3]:
        print(f"     CSP: {err['text'][:120]}")

    # --- 2. noopener on footer links ---
    print("\n2. Footer link security (noopener/noreferrer)")
    footer_links = page.query_selector_all("footer a[target='_blank']")
    for link in footer_links:
        rel = link.get_attribute("rel") or ""
        href = link.get_attribute("href") or ""
        has_noopener = "noopener" in rel and "noreferrer" in rel
        check(f"noopener on {href[:40]}", has_noopener, f"rel=\"{rel}\"")

    # --- 3. No inline event handlers ---
    print("\n3. Inline event handlers")
    inline_handlers = page.evaluate("""() => {
        const allElements = document.querySelectorAll('*');
        const found = [];
        const handlerAttrs = [
            'onclick', 'onerror', 'onload', 'onmouseover', 'onmouseout',
            'onchange', 'onsubmit', 'oninput', 'onfocus', 'onblur',
            'onkeydown', 'onkeyup', 'onkeypress'
        ];
        for (const el of allElements) {
            for (const attr of handlerAttrs) {
                if (el.hasAttribute(attr)) {
                    found.push({
                        tag: el.tagName,
                        attr: attr,
                        id: el.id || '',
                        class: el.className || ''
                    });
                }
            }
        }
        return found;
    }""")
    check("No inline event handlers in DOM", len(inline_handlers) == 0,
          f"{len(inline_handlers)} found" if inline_handlers else "Clean")
    for h in inline_handlers:
        print(f"     {h['tag']}#{h['id']}.{h['class']} has {h['attr']}")

    # --- 4. Icon fallback (tiny images) ---
    print("\n4. Icon fallback (tiny/default images)")
    icon_info = page.evaluate("""() => {
        const icons = document.querySelectorAll('.bookmark-icon');
        const results = [];
        for (const img of icons) {
            results.push({
                src: img.src.substring(0, 80),
                naturalWidth: img.naturalWidth,
                naturalHeight: img.naturalHeight,
                alt: img.alt
            });
        }
        return results;
    }""")
    tiny_icons = [i for i in icon_info if i["naturalWidth"] <= 16 and i["naturalHeight"] <= 16
                  and not i["src"].startswith("data:")]
    check(f"No tiny default globe icons ({len(icon_info)} icons checked)",
          len(tiny_icons) == 0,
          f"{len(tiny_icons)} tiny icons found" if tiny_icons else "All icons OK")
    for t in tiny_icons[:3]:
        print(f"     Tiny: {t['alt']} — {t['src']}... ({t['naturalWidth']}x{t['naturalHeight']})")

    # --- 5. Theme setup ---
    print("\n5. Theme configuration")
    theme = page.evaluate("() => document.documentElement.getAttribute('data-theme')")
    check("data-theme attribute present", theme is not None, f"value: {theme}")

    theme_script = page.query_selector("script[src='/theme-init.js']")
    check("theme-init.js loaded as external script", theme_script is not None)

    inline_scripts = page.evaluate("""() => {
        const scripts = document.querySelectorAll('script:not([src])');
        return Array.from(scripts).map(s => s.textContent.substring(0, 50));
    }""")
    check("No inline script blocks", len(inline_scripts) == 0,
          f"{len(inline_scripts)} found" if inline_scripts else "Clean")

    # --- 6. Clerk user button positioning ---
    print("\n6. Clerk user button position")
    clerk_btn = page.query_selector("#clerk-user-button")
    if clerk_btn:
        box = clerk_btn.bounding_box()
        if box:
            viewport = page.viewport_size
            is_right = box["x"] > (viewport["width"] / 2)
            is_top = box["y"] < 100
            check("Clerk button in top-right", is_right and is_top,
                  f"x={box['x']:.0f}, y={box['y']:.0f} (viewport: {viewport['width']}x{viewport['height']})")
        else:
            check("Clerk button in top-right", False, "Element exists but has no bounding box (hidden?)")
    else:
        check("Clerk button in top-right", False, "Element #clerk-user-button not found")

    # --- 7. CSP meta tag check ---
    print("\n7. CSP meta tag")
    csp_meta = page.evaluate("""() => {
        const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
        return meta ? meta.content : null;
    }""")
    if csp_meta:
        has_script_src = "script-src" in csp_meta
        has_img_src = "img-src" in csp_meta
        has_worker_src = "worker-src" in csp_meta
        has_connect_src = "connect-src" in csp_meta
        check("CSP has script-src directive", has_script_src)
        check("CSP has img-src directive", has_img_src)
        check("CSP has worker-src directive", has_worker_src)
        check("CSP has connect-src directive", has_connect_src)
        check("CSP does NOT allow unsafe-inline scripts", "unsafe-inline" not in csp_meta.split("script-src")[1].split(";")[0] if has_script_src else False)
    else:
        check("CSP meta tag present", False, "Not found")

    # Take screenshot
    page.screenshot(path="/tmp/bb-security-check.png", full_page=True)
    print("\n  Screenshot saved to /tmp/bb-security-check.png")

    # --- Summary ---
    passed = sum(1 for _, s, _ in RESULTS if s == "PASS")
    failed = sum(1 for _, s, _ in RESULTS if s == "FAIL")
    print(f"\n{'='*50}")
    print(f"  RESULTS: {passed} passed, {failed} failed out of {len(RESULTS)} checks")
    print(f"{'='*50}\n")

    if failed > 0:
        print("  FAILURES:")
        for name, status, detail in RESULTS:
            if status == "FAIL":
                print(f"    ✗ {name}: {detail}")

    browser.close()
