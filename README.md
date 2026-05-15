# Naonw

AI-powered browser automation agent. Give it a task in plain English — it controls a real browser to complete it. Also ships `naonw`, a human-facing browser CLI for direct interaction.

> **About the name:** "Naonw" is Sundanese-flavored for *"naon?"* — literally "what?" / "what's this?" Yes, I shipped a tool whose name means "what?" because I couldn't think of a name wkwkwk. If anyone asks what it is, the name does the explaining.

```bash
bun install
cp .env.example .env       # add at least one AI provider key
bun src/index.ts "search the latest iPhone price on tokopedia"
```

## Table of Contents

- [Two ways to use it](#two-ways-to-use-it)
  - [1. AI agent](#1-ai-agent--bun-srcindexts-task)
  - [2. `naonw` CLI](#2-naonw-cli--direct-browser-control-no-ai)
- [Features](#features)
- [Provider priority](#provider-priority)
- [Project layout](#project-layout)
- [Development](#development)
- [Credits](#credits)

---

## Two ways to use it

### 1. AI agent — `bun src/index.ts "<task>"`

<img width="1919" height="1048" alt="image" src="https://github.com/user-attachments/assets/51de056d-a8fc-4b81-91b1-8596e209bedb" />

Tell it what to do. It reads the page, calls tools, finishes with a spoken summary.

```bash
bun src/index.ts "list FedEx shipping rates from JP to Botani Square Bogor"
bun src/index.ts "play sakura miko's latest stream"
bun src/index.ts "what is the prayer schedule in Bogor today"
```

→ See [docs/features/ai-agent.md](docs/features/ai-agent.md) for the full tool list, vision/thinking modes, and resilience model.

### 2. `naonw` CLI — direct browser control, no AI

<img width="1919" height="1047" alt="image" src="https://github.com/user-attachments/assets/fe65cfe3-f195-4086-b510-082265f9eb80" />

Tag-prefixed greppable output. `[GO]`, `[OK]`, `[SHOT]`, `[SNAP]`, `[TEXT]`, `[JS]`, `[TAB ...]`.

```bash
naonw go example.com           # → [GO] https://example.com/ — Example Domain
naonw fill "Email=a@b.com"     # → [OK] fill Email
naonw shot                     # → [SHOT] ./shot.png 1024×768
naonw snap                     # → [SNAP] N elements   <list>
```

Requires Chrome on `--remote-debugging-port=9222`. Install: `bun run install:naonw`.

→ See [docs/features/cli.md](docs/features/cli.md) for all commands, flags, examples, and install instructions.

---

## Features

| Topic | Highlights | Doc |
|---|---|---|
| **Configuration** | 3 layers (global JSONC / project JSONC / env), pre-flight provider validation, OpenRouter → Ollama → OpenCode fallback | [configuration.md](docs/features/configuration.md) |
| **AI agent** | 22 tools, scroll-into-view + synthetic-click fallback, mid-conversation provider switching, crash-resilient loop | [ai-agent.md](docs/features/ai-agent.md) |
| **`naonw` CLI** | Direct browser control without AI, tag-prefixed output, JSON mode for piping | [cli.md](docs/features/cli.md) |
| **Token optimization** | 3-layer system prompt (always / extra-rules / 15 conditional labels), snapshot trimming (~60-70% smaller), per-page hints | [token-optimization.md](docs/features/token-optimization.md) |
| **Logging** | Two log files: human-readable `run.log` + LLM payload `ai-context.log` for debugging model decisions | [logging.md](docs/features/logging.md) |
| **Browser** | CDP attach or stealth Chromium launch, headless mode, captcha auto-relaunch as visible, snapshot retries on nav errors | [browser.md](docs/features/browser.md) |
| **Queue & captcha** | FIFO follow-up queue while agent runs, captcha-mode preempts the queue, `d` to remove queued items | [queue-and-captcha.md](docs/features/queue-and-captcha.md) |
| **TTS** | Gemini TTS or local fallback (SAPI / say / espeak-ng), language-aware voice selection, errors logged not swallowed | [tts.md](docs/features/tts.md) |

---

## Provider priority

**OpenRouter → Ollama → OpenCode**. Providers without keys are skipped. Fallback fires on rate limit, model unavailable, auth failure, server error, or network error — and the new provider inherits a syntactically valid history so it can take over mid-conversation.

---

## Project layout

```
src/
  agent/          loop, tools (interaction, navigation, observe, capture, captcha)
  ai/             prompt.ts, prompt-extra.ts, prompt-conditional.ts, context-hints.ts, providers/
  browser/        manager, snapshot, snapshot-diff, actions, detectors
  cli/            naonw entry, commands/
  ui/             Ink TUI (header, log-panel, task-sidebar, input-bar, store)
  utils/          logger, tts, gemini-tts, prompt
  config/         JSONC + env merging
docs/features/    detailed per-feature docs
```

---

## Development

```bash
bun src/index.ts "task"        # run agent
bun run naonw <cmd>            # run CLI
bun tsc --noEmit               # typecheck
```

Logs land in `logs/run.log` and `logs/ai-context.log` (truncated each session). For tuning prompt behavior or debugging model decisions, `tail -f logs/ai-context.log` is the fastest path.

---

## Credits

Built standing on the shoulders of:

- **[runablehq/mini-browser](https://github.com/runablehq/mini-browser)** — `mb`, a Unix-style browser CLI for agents. Inspiration for the `naonw` CLI's tag-prefixed, pipe-friendly output style.
- **[CloakHQ/CloakBrowser](https://github.com/CloakHQ/CloakBrowser)** — stealth Chromium with source-level fingerprint patches. Powers the launched-browser path so Naonw passes bot-detection on real sites.

Thanks for doing the hard parts.
