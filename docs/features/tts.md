# Text-to-Speech (TTS)

After the agent calls `done()`, the result summary is read aloud.

## Backends

Auto-selected:

| Condition | Backend |
|---|---|
| `GEMINI_API_KEY` set | Gemini `gemini-2.5-flash-preview-tts` (voice: Aoede) — high quality |
| Linux native | `espeak-ng` or `spd-say` (whichever is installed) |
| WSL/Windows | PowerShell SAPI (`Windows.Media.SpeechSynthesis`) — picks voice matching the result language |
| macOS | `say` |
| `TTS=false` | disabled |

The active backend is shown in the run-log header: `tts=gemini`, `tts=local`, or `tts=off`.

## Gemini TTS errors

Quota / auth / network errors no longer crash the app or get swallowed. They surface as `WARN` log entries, e.g.:

```
[WARN] Gemini TTS failed — RESOURCE_EXHAUSTED: You exceeded your current quota... (retry in 5s)
```

Empty audio responses log `Gemini TTS returned no audio`.

## Language

`done(summary, lang)` requires `lang` (`"en"` or `"id"`). The TTS backend uses this to pick the right voice. Missing lang = wrong voice.

Local SAPI maps `id-*` and `ja-*` voices when available; falls back to `en-*`.

## Stopping playback

Sending a new task (or Ctrl+C) calls `stopSpeak()` which kills the active player process.
