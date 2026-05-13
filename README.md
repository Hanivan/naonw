# puppeteer-ai

AI-powered browser automation agent. Give it a task in plain English; it controls a real browser to complete it using tool calls.

## Setup

```bash
bun install
```

Copy and fill in environment variables:

```bash
cp .env.example .env
```

| Variable | Description | Default |
|---|---|---|
| `OLLAMA_API_KEY` | Ollama Cloud API key (primary AI) | required |
| `OLLAMA_MODEL` | Ollama model | `qwen3:32b` |
| `OPENCODE_MODEL` | Fallback model via OpenCode SDK | `anthropic/claude-sonnet-4-5-20250514` |
| `OPENCODE_HOST` | OpenCode server host | `127.0.0.1` |
| `OPENCODE_PORT` | OpenCode server port | `4096` |
| `HEADLESS` | Run browser headless | `false` |
| `DEBUG` | Enable debug logging | unset |

## Usage

```bash
bun src/index.ts "<task>"
```

Always quote the task — shell treats `&`, `(`, `)`, `|`, `*` as special characters.

```bash
bun src/index.ts "search for dataxet sonar and summarize the results"
bun src/index.ts "fill contact form on hanivan.my.id"
bun src/index.ts "list rates & transit times from JP to ID (Botani Square Bogor) on FedEx"
```

## How it works

1. Launches a Puppeteer browser (visible by default)
2. Sends your task to Ollama (falls back to OpenCode/Claude if rate limited)
3. AI calls tools in a loop until the task is done:
   - `navigate(url)` — go to a URL
   - `click(selector)` — click an element
   - `type(selector, text, clear?)` — type into an input
   - `select(selector, value)` — pick a dropdown option
   - `scroll(direction, amount?)` — scroll the page
   - `wait(ms)` — pause
   - `screenshot()` — capture page and send to AI
   - `done(summary)` — finish with a summary

If a CAPTCHA is detected, the agent pauses and prompts you to solve it manually, then continues.
