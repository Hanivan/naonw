# Browser

## Connection modes

Naonw connects to a CDP browser if `NAONW_CDP_URL` is reachable, otherwise launches its own stealth Chromium (CloakBrowser).

The header chip shows which mode is active:
- `● browser (cdp)` — attached to your existing Chrome via remote-debugging port
- `● browser (launched)` — Naonw spawned its own stealth instance
- `○ browser` — closed

Set `NAONW_CDP_URL=http://127.0.0.1:9222` (default) to prefer CDP.

## Headless

`HEADLESS=true` runs the browser without a window. The TUI header still shows the URL and the agent works normally — but nothing is visible to the user, and audio/video does NOT play to the system speakers.

The agent is told the browser mode at task start (`BROWSER MODE: HEADLESS` / `VISIBLE`). For media tasks in headless mode, the agent calls `warn()` upfront so the user knows audio won't play.

## CAPTCHA

If a captcha is detected and the browser is headless, Naonw automatically relaunches it as visible (carrying URL + cookies) and pauses for the user to solve it. After the user resolves the captcha, Naonw switches back to headless and resumes.

The CAPTCHA pending state is always preempt over follow-up queues — typing a new task while a captcha is open does not unblock the captcha.

## Stealth

Built on CloakBrowser. Optional env vars:
- `PROXY` — proxy URL passed to the browser
- `FINGERPRINT` — fingerprint seed for `--fingerprint=` flag
- `CLOAKBROWSER_AUTO_UPDATE` — auto-update the stealth binary

## Snapshot retries

Page snapshots are taken via the Chrome DevTools `Accessibility.getFullAXTree` protocol. If a snapshot throws `Execution context was destroyed` (mid-navigation), the snapshot is retried once after waiting for `domcontentloaded`. Same handling for `Target closed` and `frame got detached`.

`pressKey` similarly recovers from nav-induced context loss — Enter that triggers navigation now reports success after waiting for the page to settle, instead of surfacing as an error to the AI.

## Close semantics

| Caller | CDP-attached | Launched-stealth |
|---|---|---|
| Agent calls `closeBrowser()` | Closes all pages, then `Browser.close` CDP method → Chrome actually exits | `browser.close()` — Chromium process terminates |
| Agent calls `closePage()` | `page.close({runBeforeUnload:false})`, then adopts another open tab if any | Same; if last tab, no replacement |
| App exits (Ctrl+C / finally) | `browser.disconnect()` only — your Chrome stays alive | `browser.close()` — Chromium terminates |

The "agent closes browser via tool" path is forceful. The "app shutdown" path is gentle — never kills your manually-managed Chrome on quit.
