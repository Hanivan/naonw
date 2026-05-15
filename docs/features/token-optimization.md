# Token Cost Optimizations

Naonw aggressively trims what gets sent to the LLM. Smaller payloads = faster responses, lower bills, more headroom inside the model's context window.

## 3-layer system prompt

| Layer | File | When sent | Size |
|---|---|---|---|
| Core (always) | `src/ai/prompt.ts` | every chat call | ~3.9 KB |
| Robustness rules (always) | `src/ai/prompt-extra.ts` | every chat call | ~2 KB |
| Conditional rules | `src/ai/prompt-conditional.ts` | only when user task matches a label | varies |

Override the always-extra layer by creating a file at `NAONW_RULES_FILE` (default: `.config/naonw-rules.md`) — its contents replace the built-in rules entirely.

## Conditional rule labels

15 labels matched by keyword on the user's task (en + id). Multi-label tasks naturally stack.

| Label | Triggers | Size |
|---|---|---|
| `media` | play, watch, listen, stream, putar, dengar, tonton, nonton | 1.2 KB |
| `captcha` | captcha, recaptcha, verify human, verifikasi | 0.1 KB |
| `shopping` | price, harga, buy, beli, product, tokopedia, shopee, amazon, compare | 0.3 KB |
| `form` | fill, isi, submit, kirim, register, daftar, sign up | 0.4 KB |
| `news` | news, berita, headline, article, terbaru, terkini, breaking | 0.4 KB |
| `travel` | flight, tiket, pesawat, kereta, hotel, booking, traveloka, agoda | 0.5 KB |
| `weather` | weather, cuaca, hujan, suhu, forecast, prakiraan | 0.2 KB |
| `finance` | stock, saham, crypto, btc, eth, kurs, idx | 0.4 KB |
| `maps` | map, peta, direction, rute, alamat, lokasi, terdekat, jam buka | 0.3 KB |
| `translation` | translate, terjemah | 0.3 KB |
| `reviews` | review, ulasan, rating, top N, best, terbaik, compare, vs | 0.3 KB |
| `docs` | docs, api, how to, cara, tutorial, github, mdn, error, fix | 0.3 KB |
| `schedule` | jadwal, schedule, kapan, hari ini, besok, sholat, jam berapa | 0.3 KB |
| `account` | cancel, batal, unsubscribe, delete account, hapus akun, deactivate | 0.3 KB (DANGER warnings) |

Add new labels by editing `src/ai/prompt-conditional.ts` — each entry is `{ label, match: (task) => boolean, rules: string }`.

## System budget per task type

vs. naive ~11.6 KB monolithic prompt:
- Q&A ("explain HTTP"): **~5.9 KB (−50%)**
- Shopping comparison: **~6.2 KB (−47%)**
- Media playback: **~7 KB (−39%)**

## Snapshot trimming

Every page state sent to the LLM is filtered before transmission. See `src/browser/snapshot.ts`.

- `StaticText` whose text duplicates an ancestor's name OR value is dropped (YouTube/Google/Twitter wrap every link with a redundant text node)
- Pure-separator StaticText (`" - "`, `" • "`, `"|"`) dropped (≤3 chars, no letter/digit)
- Decorative images (no alt text) dropped
- Landmark wrappers (`list`, `listitem`, `navigation`, `search`, `banner`, `complementary`, `contentinfo`, `region`, `group`, `form`) dropped when they have no name — children still emitted
- Wrapper roles (`tablist`, `tabpanel`, `tooltip`, `presentation`, `paragraph`, `LineBreak`) dropped unconditionally
- High-churn diff fallback: when a snapshot diff would mark >50% of nodes as added, sends compact format instead — saves the per-line `[+]` tag

Combined effect: **~60-70% smaller snapshots** on content-heavy pages compared to the raw accessibility tree.

## Per-page hints

`src/ai/context-hints.ts` — short URL-keyed reminders appended to PAGE STATE, only when the URL matches.

| URL pattern | Hint |
|---|---|
| `/results`, `/search`, `google.com/search` | `[!] SEARCH PAGE — not a media/watch page` |
| `youtube.com/watch?v=` | `[YT] /watch autoplays. wait(10000), click Skip Ad if visible. Do NOT click Play.` |
| `open.spotify.com/track/` | `[SPOT] Spotify track does NOT autoplay. Click Play to start.` |
| `login`/`signin`/`auth`/`accounts.google.com` | `[AUTH] LOGIN WALL — do NOT type credentials. done() with 'login required'.` |
| `checkout`/`payment`/`billing` | `[$$] CHECKOUT — read prices, do NOT submit/pay.` |
| `youtube.com/channel`/`@<handle>` (not /watch) | `[YT-CH] click 'Videos'/'Live' tab; do not guess subpath URLs.` |
| `captcha`/`recaptcha`/`hcaptcha`/`cloudflare` | `[CAP] CAPTCHA — solveCaptcha() flow or wait(3000) for Cloudflare.` |

Each hint ~50-80 chars. Most snapshots get 0 or 1 hint, costing ~15 tokens per match. Add new hints by editing `HINTS[]` in `context-hints.ts`.

## WAIT budget rule

The prompt explicitly tells the model that `wait()` is expensive (one iteration each) and rations its use:

- **Allowed**: post-YouTube /watch (10 s for ad), Cloudflare interstitial (3 s once), post-click slow modal
- **Forbidden**: after navigate (already waits), between snapshots (auto), after search

## ASCII over emojis

All in-prompt status markers use ASCII (`[!]`, `[YT]`, `[CAP]`) instead of emojis (`⚠️`, `▶`, `🤖`). Emojis tokenize as 2-3 tokens each; ASCII alternatives cost 1.

## Tools that prefer refs over coords

`hover(ref)`, `drag(fromRef, toRef)` save the model from generating coordinates it doesn't reliably have. Smaller arguments → fewer output tokens.

## Verification

`tail -f logs/ai-context.log` shows every `SYSTEM`, `SNAPSHOT iter=N`, `RESPONSE`, and `TOOL_RESULT` block in real time. Use it to confirm what the model actually receives.
