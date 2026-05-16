// src/ai/context-hints.ts
//
// Per-snapshot, URL-keyed reminders appended to PAGE STATE before sending to AI.
// Only fire when the URL matches — pay tokens only where useful.
// Add new hints here as you discover failure modes; no need to touch prompt.ts.

interface Hint {
  match: (url: string) => boolean;
  // Short suffix appended to the CURRENT URL line. Keep ≤ 80 chars.
  urlSuffix?: string;
  // Multi-line block appended after the URL line. Use sparingly.
  block?: string;
}

const HINTS: Hint[] = [
  {
    match: (u) => /\/(results|search)\b/.test(u) || u.includes("google.com/search"),
    urlSuffix: "[!] SEARCH PAGE — not a media/watch page",
  },
  {
    match: (u) => /youtube\.com\/watch\?v=/.test(u),
    urlSuffix: "[YT] /watch autoplays. wait(10000), click Skip Ad if visible. Do NOT click Play.",
  },
  {
    match: (u) => /open\.spotify\.com\/track\//.test(u),
    urlSuffix: "[SPOT] Spotify track does NOT autoplay. Click Play to start.",
  },
  {
    match: (u) => /(login|signin|sign-in|auth|accounts\.google\.com)/i.test(u),
    urlSuffix: "[AUTH] LOGIN WALL — do NOT type credentials. done() with 'login required'.",
  },
  {
    match: (u) => /(checkout|payment|billing|cart\/checkout)/i.test(u),
    urlSuffix: "[$$] CHECKOUT — read prices, do NOT submit/pay.",
  },
  {
    match: (u) => /youtube\.com\/(channel|@)/.test(u) && !u.includes("/watch"),
    urlSuffix: "[YT-CH] click 'Videos'/'Live' tab from PAGE STATE; do not guess subpath URLs.",
  },
  {
    match: (u) => /\/captcha|recaptcha|hcaptcha|cloudflare/i.test(u),
    urlSuffix: "[CAP] CAPTCHA/CHALLENGE — use solveCaptcha() or wait(3000) for Cloudflare.",
  },
  {
    match: (u) => /fedex\.com/i.test(u),
    urlSuffix: "[FEDEX] Address fields (Dari/Kepada, From/To) are Angular comboboxes — MUST use typeAndSelect (2 steps), NEVER plain type. Suggestions render in role=listbox.",
  },
  {
    match: (u) => /(traveloka|tiket\.com|tiket-com|agoda|booking\.com|trivago)/i.test(u),
    urlSuffix: "[BOOKING] Origin/destination inputs are comboboxes — typeAndSelect 2 steps. Read suggestion list, pick exact match.",
  },
  {
    match: (u) => /(maps\.google|google\.com\/maps)/i.test(u),
    urlSuffix: "[MAPS] Search box is a combobox — typeAndSelect to pick a result. Place names not exact-matched will navigate wrong location.",
  },
];

export interface ContextHint {
  urlSuffix: string;
  block: string;
}

export function getContextHints(url: string): ContextHint {
  const suffixes: string[] = [];
  const blocks: string[] = [];
  for (const h of HINTS) {
    if (!h.match(url)) continue;
    if (h.urlSuffix) suffixes.push(h.urlSuffix);
    if (h.block) blocks.push(h.block);
  }
  return {
    urlSuffix: suffixes.length ? "  " + suffixes.join("  ") : "",
    block: blocks.length ? "\n" + blocks.join("\n") : "",
  };
}
