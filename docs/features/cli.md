# `naonw` — Browser CLI

Direct terminal control of the browser, no AI involved. Useful for scripting, debugging, or quick interactions.

All commands print a tag-prefixed line so output is greppable: `[GO]`, `[URL]`, `[BACK]`, `[FORWARD]`, `[OK]`, `[TEXT]`, `[SHOT]`, `[SNAP]`, `[JS]`, `[TAB LIST|NEW|CLOSE]`. Pass `--json` on `snap` / `tab list` for raw JSON instead.

## Requirements

Chrome must be running with remote debugging enabled on port 9222:

```bash
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug
```

Override the default CDP URL with `NAONW_CDP_URL`:

```bash
NAONW_CDP_URL=http://localhost:9999 bun run naonw snap
```

## Install

```bash
bun run build:naonw          # compiles → dist/naonw
bun run install:naonw        # build + copies to ~/.local/bin/naonw
```

Make sure `~/.local/bin` is in `$PATH`:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
```

Or run without installing:

```bash
bun run naonw <command> [args]
```

## Commands

### Navigation

```bash
naonw go https://example.com        # → [GO] https://example.com/ — Example Domain
naonw url                            # → [URL] <current url> — <title>
naonw back                           # → [BACK] <url> — <title>
naonw forward                        # → [FORWARD] <url> — <title>
```

### Observe

```bash
naonw text                           # → [TEXT] body — N lines, M chars   <content>
naonw text "h1"                      # text of a CSS selector
naonw shot                           # → [SHOT] ./shot.png 1024×768
naonw shot /tmp/page.png             # screenshot to custom path
naonw shot --width 1440 --height 900 # screenshot at custom viewport size
naonw snap                           # → [SNAP] N elements   <indented list>
naonw snap --json                    # raw JSON (untagged) for piping
```

### Interact

All print `[OK] <action>`.

```bash
naonw click 400 300                  # → [OK] click (400, 300)
naonw click 400 300 --right          # → [OK] click (400, 300) right
naonw click 400 300 --double         # → [OK] click (400, 300) double
naonw type "hello world"             # → [OK] type "hello world"
naonw type 400 300 "hello"           # triple-click at coords, then type
naonw fill "Email=me@example.com" "Name=Jo"   # → [OK] fill Email, Name
naonw key Enter                      # → [OK] key Enter
naonw key "Ctrl+a" "Ctrl+c"          # → [OK] key Ctrl+a Ctrl+c
naonw move 400 300                   # → [OK] move (400, 300)
naonw drag 100 200 400 200           # → [OK] drag (100, 200) → (400, 200)
naonw scroll                         # → [OK] scroll down 500px
naonw scroll up
naonw scroll down 1000
naonw scroll left 300
```

### Tabs

```bash
naonw tab list                       # → [TAB LIST] N tabs   <id  url  title>
naonw tab list --json                # raw JSON (untagged)
naonw tab new                        # → [TAB NEW] <id> about:blank
naonw tab new https://example.com    # → [TAB NEW] <id> https://example.com/ — Example Domain
naonw tab close                      # → [TAB CLOSE] <id> <url>
naonw tab close <id>                 # close tab by id
```

### Other

```bash
naonw js "document.title"            # → [JS] string \n "Example Domain"
naonw js "window.scrollY"            # → [JS] number \n 0
naonw wait 2000                      # → [OK] wait 2000ms
naonw wait "#submit-btn"             # → [OK] wait selector #submit-btn
naonw wait networkidle               # → [OK] wait networkidle
naonw wait "url:dashboard"           # → [OK] wait url contains "dashboard"
```

## Flags

| Flag | Description |
|---|---|
| `--timeout <ms>` | Timeout in ms (default: 30000) |
| `--tab <id>` | Target a specific tab by Chrome id |
| `--json` | Structured JSON output (`snap`, `tab list`) |
| `--right` | Right-click (with `click`) |
| `--double` | Double-click (with `click`) |
| `--width <px>` | Screenshot viewport width |
| `--height <px>` | Screenshot viewport height |

## Examples

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

# If the input is NOT auto-focused, use snap to find coords
naonw go https://www.google.com
naonw snap
# [SNAP] 47 elements
#   [4] searchbox "Search" (512, 300)   ← read x,y from a row
naonw type 512 300 "bun"                 # triple-clicks at (512,300), then types
naonw key Enter
```
