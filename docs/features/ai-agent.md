# AI Agent

Plain-English browser automation. Tell it what to do; it controls a real browser to complete it.

## Run

```bash
bun src/index.ts "<task>"
```

Always quote the task — shell treats `&`, `(`, `)`, `|`, `*` as special.

```bash
bun src/index.ts "search for the latest iPhone price on tokopedia"
bun src/index.ts "fill the contact form on hanivan.my.id"
bun src/index.ts "list FedEx shipping rates from JP to Botani Square Bogor"
bun src/index.ts "what is the prayer schedule in Bogor today"
```

## How it works

1. Pre-flight validates every configured provider (key reachable, model available)
2. Launches stealth Chromium (CloakBrowser, visible by default) or attaches via CDP if `NAONW_CDP_URL` is up
3. Sends the task + a compact accessibility snapshot of the current page to the AI
4. AI calls tools in a loop (max 20 steps) until it calls `done()`
5. Result printed in TUI and optionally read aloud (Gemini TTS if `GEMINI_API_KEY` set, else local SAPI/say/espeak)
6. Type a follow-up while the agent is running — it queues and runs after the current task finishes (FIFO). Captcha prompts always preempt the queue.

## AI tools

| Tool | Description |
|---|---|
| `navigate(url)` | Go to a URL |
| `back()` / `forward()` | Browser history |
| `click(ref)` | Click element by accessibility ref |
| `type(ref, text, clear?)` | Type into an input |
| `typeAndSelect(ref, text, pick?)` | Type into a combobox + pick suggestion |
| `select(ref, value)` | Pick a `<select>` option |
| `fill({label: value})` | Fill multiple form fields at once |
| `scroll(direction?, px?)` | Scroll the page |
| `key(keys)` | Press keys — combos: `Ctrl+a`, `Meta+Shift+T` |
| `hover(ref)` / `hover(x,y)` | Mouse hover (prefer ref over coords) |
| `drag(fromRef, toRef)` / `drag(x1,y1,x2,y2)` | Drag (prefer refs over coords) |
| `evaluate(code)` | Eval JS in page (5 s timeout, output truncated at 4000 chars) |
| `wait(ms)` | Pause — agent is told this is expensive and rationed |
| `screenshot()` | Capture page and send to AI (requires `VISION=true`) |
| `solveCaptcha()` | Capture and describe a reCAPTCHA challenge |
| `clickCaptchaTile(ids, verify?)` | Click reCAPTCHA tiles by index |
| `closePage()` | Close current tab |
| `closeBrowser()` | Close the browser |
| `warn(message)` | Surface a non-fatal warning to the user, then keep going |
| `done(summary, lang)` | Finish with a summary (`lang`: `"en"` or `"id"`) |

## Robust click/type/select

All ref-based interactions auto-`scrollIntoViewIfNeeded` first. If an element is still off-viewport (fixed wrappers, modals), `click` falls back to a synthetic DOM click instead of firing a mouse event at empty space. Off-viewport refs in `hover`/`drag` throw a clear error after the scroll attempt.

## Resilience

- Provider fallback on rate-limit / 404 / 401 / 5xx / network errors — switches mid-conversation, replays history correctly
- Agent loop crash is caught: app stays alive for the next prompt instead of exiting
- Snapshot retries on `Execution context was destroyed` (mid-navigation)
- `pressKey` waits for navigation when Enter triggers it, treats nav-induced "context destroyed" as success

## Vision mode

Set `VISION=true` to enable `screenshot()`. The model receives a base64 PNG of the current viewport — useful for solving CAPTCHA or reading content the accessibility tree misses.

## Thinking mode

Set `THINKING=true` (Ollama only) to stream the model's reasoning into the TUI as `[THINK]` log entries. Aids debugging but increases token usage.
