# Naonw

AI-powered browser automation agent. Give it a task in plain English — it controls a real browser to complete it. Also ships `naonw`, a human-facing browser CLI for direct interaction.

## Setup

```bash
bun install
cp .env.example .env   # fill in at least one AI provider key
```

### Environment variables

| Variable | Description | Default |
|---|---|---|
| `OPENROUTER_API_KEY` | OpenRouter API key (primary AI provider) | — |
| `OPENROUTER_MODEL` | Model via OpenRouter | `openrouter/owl-alpha` |
| `OLLAMA_HOST` | Ollama server URL | `http://localhost:11434` |
| `OLLAMA_API_KEY` | Ollama Cloud key (omit for local) | — |
| `OLLAMA_MODEL` | Ollama model | `minimax-m2.5` |
| `OPENCODE_API_KEY` | OpenCode fallback key | — |
| `OPENCODE_MODEL` | OpenCode model | `minimax-m2.5` |
| `GEMINI_API_KEY` | Gemini API key — enables Gemini TTS when set | — |
| `HEADLESS` | Run browser headless | `false` |
| `TTS` | Read task result aloud | `true` |
| `VISION` | Enable screenshot tool | `false` |
| `THINKING` | Enable thinking/streaming (Ollama only) | `false` |
| `DEBUG` | Verbose DOM/page-state logs | — |
| `LOG_TYPE` | `old` for plain text log mode | — |
| `PROXY` | Proxy URL for browser | — |
| `FINGERPRINT` | CloakBrowser fingerprint seed | — |
| `CLOAKBROWSER_AUTO_UPDATE` | Auto-update stealth browser binary | `false` |

Provider priority: **OpenRouter → Ollama → OpenCode**. Providers without keys are skipped.

---

## AI Agent

```bash
bun src/index.ts "<task>"
```

Always quote the task — shell treats `&`, `(`, `)`, `|`, `*` as special characters.

```bash
bun src/index.ts "search for the latest iPhone price on tokopedia"
bun src/index.ts "fill the contact form on hanivan.my.id"
bun src/index.ts "list FedEx shipping rates from JP to Botani Square Bogor"
bun src/index.ts "what is the prayer schedule in Bogor today"
```

### How it works

1. Launches a stealth Chromium browser (CloakBrowser, visible by default)
2. Sends your task to the AI provider
3. AI calls tools in a loop (max 20 steps) until the task is done
4. Result is printed and optionally read aloud via TTS

### AI tools

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
| `hover(x, y)` | Mouse hover at coordinates |
| `drag(x1, y1, x2, y2)` | Drag between coordinates |
| `evaluate(code)` | Eval JS in page, returns result |
| `wait(ms)` | Pause |
| `screenshot()` | Capture page and send to AI (requires `VISION=true`) |
| `solveCaptcha()` | Capture and describe a reCAPTCHA challenge |
| `clickCaptchaTile(ids, verify?)` | Click reCAPTCHA tiles by index |
| `closePage()` | Close current tab |
| `closeBrowser()` | Close the browser |
| `done(summary, lang)` | Finish with a summary (`lang`: `"en"` or `"id"`) |

---

## `naonw` — Browser CLI

`naonw` lets you control a browser directly from the terminal — no AI involved. Useful for scripting, debugging, or quick interactions.

### Requirements

Chrome must be running with remote debugging enabled on port 9222:

```bash
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug
```

Override the default CDP URL with `NAONW_CDP_URL`:

```bash
NAONW_CDP_URL=http://localhost:9999 bun run naonw snap
```

### Install

Build a standalone binary and add it to your PATH:

```bash
bun run build:naonw          # compiles → dist/naonw
bun run install:naonw        # build + copies to ~/.local/bin/naonw
```

Make sure `~/.local/bin` is in `$PATH`:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

Or run without installing:

```bash
bun run naonw <command> [args]
```

### Commands

#### Navigation

```bash
naonw go https://example.com        # navigate (waits for networkidle)
naonw url                            # print current URL
naonw back                           # go back
naonw forward                        # go forward
```

#### Observe

```bash
naonw text                           # visible text of <body>
naonw text "h1"                      # visible text of a CSS selector
naonw shot                           # screenshot → ./shot.png
naonw shot /tmp/page.png             # screenshot to custom path
naonw shot --width 1440 --height 900 # screenshot at custom viewport size
naonw snap                           # interactive elements via Accessibility Tree
naonw snap --json                    # snap output as JSON
```

#### Interact

```bash
naonw click 400 300                  # click at coordinates
naonw click 400 300 --right          # right-click
naonw click 400 300 --double         # double-click
naonw type "hello world"             # type text at current focus
naonw type 400 300 "hello"           # triple-click at coords, then type
naonw fill "Email=me@example.com" "Name=Jo"   # fill form fields by label/placeholder/name
naonw key Enter                      # press a key
naonw key Escape
naonw key "Ctrl+a" "Ctrl+c"          # key combos, space-separated
naonw move 400 300                   # hover at coordinates
naonw drag 100 200 400 200           # drag from (100,200) to (400,200)
naonw scroll                         # scroll down 500px
naonw scroll up
naonw scroll down 1000
naonw scroll left 300
```

#### Tabs

```bash
naonw tab list                       # list open tabs (id, url, title)
naonw tab list --json
naonw tab new                        # open a new blank tab, prints id
naonw tab new https://example.com    # open a new tab at URL
naonw tab close                      # close last opened tab
naonw tab close <id>                 # close tab by id
```

#### Other

```bash
naonw js "document.title"            # eval JS, prints result
naonw js "window.scrollY"
naonw wait 2000                      # wait 2 seconds
naonw wait "#submit-btn"             # wait for selector to appear
naonw wait networkidle               # wait for network to settle
naonw wait "url:dashboard"           # wait until URL contains "dashboard"
```

### Flags

| Flag | Description |
|---|---|
| `--timeout <ms>` | Timeout in ms (default: 30000) |
| `--tab <id>` | Target a specific tab by Chrome id |
| `--json` | Structured JSON output (`snap`, `tab list`) |
| `--right` | Right-click (with `click`) |
| `--double` | Double-click (with `click`) |
| `--width <px>` | Screenshot viewport width |
| `--height <px>` | Screenshot viewport height |

### Examples

```bash
# Open a page and grab its title
naonw go https://news.ycombinator.com
naonw js "document.title"

# Fill and submit a login form
naonw fill "Email=user@example.com" "Password=hunter2"
naonw key Enter

# Scroll to bottom, screenshot
naonw scroll down 9999
naonw shot bottom.png

# List all open tabs and target one
naonw tab list
naonw snap --tab <id>

# Search on Google — page auto-focuses the input, so type works directly
naonw go https://www.google.com
naonw type "bun"
naonw key Enter

# If the input is NOT auto-focused, use snap to find its coordinates first
naonw go https://www.google.com
naonw snap
# [4] searchbox "Search" (512, 300)   ← read x,y from output
naonw type 512 300 "bun"                 # triple-clicks at (512,300) to focus, then types
naonw key Enter
```
