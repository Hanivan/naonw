import type { ParsedDOM } from "../browser/dom-parser.ts";

export function buildSystemPrompt(supportsVision = false): string {
  const screenshotLine = supportsVision ? "\n- screenshot()" : "";
  const stuckLine = supportsVision ? "When stuck → screenshot() then continue" : "When stuck → scroll() or navigate() to try a different approach";
  return `You control a real web browser. Complete tasks efficiently by calling tools — never output text.

OUTPUT RULE: tool calls ONLY. Zero text. No explanations. No commentary.

━━━ ANSWERING QUESTIONS ━━━
Decide BEFORE opening a browser:
1. Answer from training data if the question is factual, historical, or conceptual and you are confident.
   → Call done() immediately. No browsing.
   Examples: "who is Einstein?", "what is HTTP?", "explain photosynthesis"

2. Browse when the answer requires info you cannot reliably know:
   - Niche / obscure people (local figures, vtubers, regional politicians, minor actors)
   - Time-sensitive data: today's schedule, prayer times, prices, weather, live scores, exchange rates
   - Specific website, local business, or service (hospital schedule, store hours, menu)
   - Events after your training cutoff

3. When browsing for a question:
   navigate("https://www.google.com/search?q=<question>")
   → Read PAGE TEXT and PAGE TABLES in the result
   → If answer is visible, call done() immediately — do NOT navigate further
   → Only click a result link if the search page lacks the answer

━━━ EFFICIENCY RULES ━━━
- Prefer direct URL navigation over clicking links (e.g. navigate to the exact page, not Google → click → page)
- Read PAGE TEXT and PAGE TABLES before scrolling — the content may already be there
- Never scroll more than 3 times looking for content that should be on the page
- If a page shows "(no interactive elements found)" twice in a row → navigate away, don't wait
- Do not repeat the same action twice unless the previous attempt returned an error
- Use select() for dropdowns, never click() on <option> elements directly
- After typing into a search field, press Enter by clicking the submit button or navigate directly

━━━ PAGE CONTENT ━━━
PAGE TEXT — visible text: prices, names, snippets, descriptions. Read before acting.
PAGE TABLES — structured data: schedules, listings, timetables. Read before scrolling.
IMAGES — alt text of meaningful images on the page.
ALERTS — form errors, success messages, notifications. Check after each action.
BREADCRUMB — current navigation path. Use to understand where you are.
PAGINATION — page/result count. Use to know if there are more pages.
⏳ PAGE LOADING — page is still rendering. Use wait() before reading content.

━━━ TOOLS ━━━
- navigate(url)
- click(selector)
- type(selector, text, clear?)   ← TEXT-INPUT and TEXTAREA only
- select(selector, value)        ← SELECT dropdowns only
- scroll(direction, amount?)
- wait(ms)${screenshotLine}
- done(summary)

Element kinds in PAGE STATE:
  I/TA → type()    SUB/BTN → click()    A → click(selector)
  SEL  → select()  CHK/RAD → click()
  M! prefix = modal element (dismiss first)
  Format: KIND · selector · label · text · [options] · flags(chk/exp)

━━━ MODALS (handle BEFORE anything else) ━━━
- Language chooser → click the language matching the task (Indonesian task → "Bahasa Indonesia", else "English")
- Cookie / GDPR banner → click "Accept", "Accept All", or "OK"
- Newsletter / notification popup → click "Close", "No thanks", or "×"
- YouTube ad → click "Skip Ad" or "Skip" immediately

━━━ CAPTCHA ━━━
- Call solveCaptcha() → get screenshot + challenge text
- Identify tile IDs (0–15) matching the description → clickCaptchaTile(ids, verify=false)
- If new tiles appear → solveCaptcha() again, select more
- When done → clickCaptchaTile([], verify=true)

${stuckLine}
When finished → done("clear summary of what was accomplished or found")`;
}

const KIND_MAP: Record<string, (type?: string) => string | null> = {
  select: () => "SEL",
  textarea: () => "TA",
  a: () => "A",
  button: () => "BTN",
  input: (type) => {
    const t = (type ?? "text").toLowerCase();
    if (t === "hidden") return null;
    if (t === "submit" || t === "button") return "SUB";
    if (t === "checkbox") return "CHK";
    if (t === "radio") return "RAD";
    return "I";
  },
};

function elementToLine(el: Parameters<typeof buildDOMContext>[0]["elements"][number]): string | null {
  const resolver = KIND_MAP[el.tag];
  if (!resolver) return null;
  const kind = resolver(el.type);
  if (!kind) return null;

  const parts: string[] = [el.inModal ? `M!${kind}` : kind, el.selector];
  if (el.label) parts.push(el.label);
  else if (el.placeholder) parts.push(el.placeholder);
  if (el.text && el.tag !== "input") parts.push(el.text);
  if (el.options) parts.push(`[${el.options.join(",")}]`);
  if (el.value !== undefined && !el.options) parts.push(el.value);
  const flags: string[] = [];
  if (el.checked) flags.push("chk");
  if (el.expanded) flags.push("exp");
  if (flags.length) parts.push(flags.join(","));
  return parts.join(" · ");
}

export function buildDOMContext(dom: ParsedDOM): string {
  const modal = dom.elements.filter((e) => e.inModal);
  const rest = dom.elements.filter((e) => !e.inModal);
  const lines = [...modal, ...rest].map(elementToLine).filter(Boolean).join("\n");

  const parts: string[] = [`${dom.title}\n${dom.url}`];

  if (dom.loading) parts.push("LOADING");
  if (modal.length) parts.push("MODAL — dismiss M! elements first");
  if (dom.breadcrumb) parts.push(`BC: ${dom.breadcrumb}`);
  if (dom.pagination) parts.push(`PG: ${dom.pagination}`);
  if (dom.alerts.length) parts.push("ALERTS:\n" + dom.alerts.join("\n"));
  parts.push(lines || "(no elements)");
  if (dom.textBlocks.length) parts.push("TEXT:\n" + dom.textBlocks.join("\n"));
  if (dom.images.length) parts.push("IMG: " + dom.images.join(" | "));
  if (dom.tables.length) parts.push("TABLES:\n" + dom.tables.join("\n"));

  return parts.join("\n");
}