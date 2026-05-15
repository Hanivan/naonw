# Configuration

Three layers, loaded lowest → highest priority:

| Layer | Path | Format |
|---|---|---|
| Global defaults | `~/.config/naonw/config.jsonc` | JSONC |
| Project override | `.config/naonw.jsonc` | JSONC |
| Env vars | `.env` / shell env | key=value |

Env vars always win. JSONC files support `//` and `/* */` comments.

## Quick start

```bash
cp .config/naonw.example.jsonc .config/naonw.jsonc
mkdir -p ~/.config/naonw && cp .config/naonw.example.jsonc ~/.config/naonw/config.jsonc
```

## Config keys

| Key | Env var | Default |
|---|---|---|
| `openrouterApiKey` | `OPENROUTER_API_KEY` | — |
| `openrouterModel` | `OPENROUTER_MODEL` | `openrouter/owl-alpha` |
| `ollamaHost` | `OLLAMA_HOST` | `http://localhost:11434` |
| `ollamaApiKey` | `OLLAMA_API_KEY` | — |
| `ollamaModel` | `OLLAMA_MODEL` | `minimax-m2.5` |
| `opencodeApiKey` | `OPENCODE_API_KEY` | — |
| `opencodeModel` | `OPENCODE_MODEL` | `minimax-m2.5` |
| `opencodeHost` | `OPENCODE_HOST` | — |
| `geminiApiKey` | `GEMINI_API_KEY` | — |
| `headless` | `HEADLESS` | `false` |
| `cdpUrl` | `NAONW_CDP_URL` | `http://127.0.0.1:9222` |
| `vision` | `VISION` | `false` |
| `thinking` | `THINKING` | `false` |
| `tts` | `TTS` | `true` |
| `debug` | `DEBUG` | — |
| `logType` | `LOG_TYPE` | — |
| `proxy` | `PROXY` | — |
| `fingerprint` | `FINGERPRINT` | — |
| `cloakbrowserAutoUpdate` | `CLOAKBROWSER_AUTO_UPDATE` | `false` |
| `logFile` | `LOG_FILE` | `logs/run.log` |
| — | `AI_LOG_FILE` | `logs/ai-context.log` |
| — | `NAONW_RULES_FILE` | `.config/naonw-rules.md` |

## Provider priority

**OpenRouter → Ollama → OpenCode**. Providers without keys are skipped. Fallback fires on rate limit, model unavailable, auth failure, server error, network error.

## Pre-flight validation

On startup Naonw verifies each configured provider before launching the TUI: API keys reachable, model available (e.g. Ollama checks `model.list`). If everything fails, you get a descriptive error to stderr and exit code 1 — no silent crash mid-task.

## Security note

`.config/naonw.jsonc` may contain API keys — add it to `.gitignore` if committing to a shared repo.
