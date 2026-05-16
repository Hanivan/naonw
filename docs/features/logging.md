# Logging

Two log files, both truncated on each session start.

## `logs/run.log`

Human-readable session log. Levels: `TOOL`, `RESULT`, `WARN`, `INFO`, `REFS`, `AGENT`, `THINK`, `CAPTCHA`, `DONE`, `FAIL`, `ERROR`, `PROVIDER`, `DEBUG`.

Header line includes TTS mode:
```
=== Naonw 2026-05-15T12:00:00Z · tts=gemini ===
```
TTS field: `tts=gemini` (Gemini key set), `tts=local` (SAPI/say/espeak fallback), `tts=off` (`TTS=false`).

Override path with `LOG_FILE` env var.

## `logs/ai-context.log`

Exact payload sent to / received from the LLM. Use this when debugging why the AI made a particular decision.

Block types:
- `SYSTEM` — core prompt (`prompt.ts`)
- `SYSTEM (extra-rules)` — always-extra rules (`prompt-extra.ts`)
- `SYSTEM (conditional: <labels>)` — task-matched conditional rules (`prompt-conditional.ts`), e.g. `SYSTEM (conditional: media,form)`
- `TASK` — user's prompt
- `SNAPSHOT iter=N url=...` — page state sent to AI (includes URL-keyed hints from `context-hints.ts` when matched)
- `RESPONSE iter=N provider=...` — AI's reply (thinking + content + tool_calls)
- `TOOL_RESULT <name>` — full untruncated tool output (TUI shows summarized `displayText` instead)
- `TOOL_RESULT <name> (duplicate-skip)` — when loop suppressed a repeat call
- `IMAGE <name>` — base64 size only (raw bytes never logged)
- `USER (nudge)` — "STOP writing text. Call a tool" injection
- `USER (captcha-hint)` — captcha-detection hint

> The TUI log panel shows a shortened `displayText` for noisy tools (`evaluate`, `type` with long text, `typeAndSelect`, `solveCaptcha`, `warn`). Full payload always lands in `ai-context.log` and is what the AI sees. `log.tool` also truncates long string args (>80 chars) in the TUI — full args still go to `run.log` and the AI.

Override path with `AI_LOG_FILE` env var.

## Tail in real time

```bash
tail -f logs/ai-context.log
```

Reveals the entire input/output stream — useful for tuning prompt rules, debugging tool failures, or confirming token-saving changes are taking effect.
