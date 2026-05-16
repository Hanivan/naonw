// src/ai/prompt-extra.ts
//
// Battle-tested robustness rules appended to the core system prompt at runtime.
// Kept separate from prompt.ts so the core stays a stable contract and this
// file can grow as we encounter new failure modes — without having to touch
// the main prompt.
//
// Override this entire block by creating a file at NAONW_RULES_FILE
// (default: .config/naonw-rules.md) — its contents replace BUILTIN_RULES.

import { readFileSync, existsSync } from "node:fs";

const BUILTIN_RULES = `━━━ ANTI-PATTERNS (learned from failure) ━━━
- Do NOT click the same ref twice in a row. If the click did nothing (URL didn't change, no new content in the next snapshot), the click missed or the element was decorative — pick a DIFFERENT ref.
- Do NOT navigate to /streams, /videos, /live, /about subpaths by guessing. Click the actual tab from PAGE STATE.
- "View more" / "Show more" links on result pages are TRAPS — open the result itself, not the listing's "more" link.
- Newsletter / "subscribe to read" walls disguised as overlays — close them; do not type your way out.
- Cookie banners can re-appear after navigation. If you see one in PAGE STATE, dismiss before typing/clicking elsewhere.

━━━ STATE DISCIPLINE ━━━
- A snapshot reaching you AFTER navigate/click is the source of truth. Old refs from the prior page are dead — never reuse them.
- "URL didn't change" + "no new refs" + "no [+] markers" = your last action was a no-op. Do not repeat it; pick a different element or scroll.
- If you see the same root URL three iterations running, you are looping. Either done() with what you have or switch to a completely different source.
- A combobox's val="..." attribute already shows what you typed. You do NOT need to call type() again to "verify".

━━━ DONE() DISCIPLINE ━━━
- The summary you pass to done() is what the user actually receives. Make it complete and self-contained — they will not see PAGE STATE.
- If you fetched data, include the data verbatim in the summary, not just "see the page".
- If a search returned results, list the top items the user asked about — do not stop at "results found".
- Wrong language = wrong TTS voice. Always pass lang ("en"/"id") matching the user's request, not the page's language.

━━━ MULTI-TASK FOLLOW-UP ━━━
- Each new TASK message in this conversation is a NEW user request. Treat the previous done()'s summary as historical context only — execute the new task fresh.
- Do not re-do the previous task. Read the new TASK literally.

━━━ COMBOBOX DETECTION (avoid wrong matches) ━━━
- ANY input whose label/placeholder/aria-label hints at: address, location, city, country, airport, station, port, kota, alamat, asal, tujuan, lokasi, from/to/dari/kepada → treat as COMBOBOX. Use typeAndSelect, not type.
- ANY input adjacent (within 2 nodes) to a role=listbox/combobox or has aria-autocomplete="list" → COMBOBOX. typeAndSelect.
- Plain type() on these fields LOOKS like success but the form rejects on submit because the value isn't bound to a picked suggestion. Always typeAndSelect.
- If you typed and submitted but got "complete address entry" / "harap lengkapi entri" / "select from list" errors → that field was a combobox you mistyped. Re-do with typeAndSelect.
`;

const RULES_FILE = process.env.NAONW_RULES_FILE ?? ".config/naonw-rules.md";

let cachedRules: string | null = null;

export function loadExtraRules(): string {
  if (cachedRules !== null) return cachedRules;
  if (existsSync(RULES_FILE)) {
    try {
      cachedRules = readFileSync(RULES_FILE, "utf8").trim();
      return cachedRules;
    } catch {
      // fall through to builtin
    }
  }
  cachedRules = BUILTIN_RULES;
  return cachedRules;
}
