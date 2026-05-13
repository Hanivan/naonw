import type { ParsedDOM } from "../browser/dom-parser.ts";

export function buildSystemPrompt(supportsVision = false): string {
  const screenshotLine = supportsVision ? "\n- screenshot()" : "";
  const stuckLine = supportsVision ? "When stuck → screenshot() then continue" : "When stuck → scroll() or navigate() to try a different approach";
  return `You control a real web browser. Complete tasks by calling tools — never output text.

OUTPUT RULE: tool calls ONLY. Zero text. No explanations.

If the task is a question (who/what/when/where/why/how), search Google for the answer: navigate("https://www.google.com/search?q=<question>") then done() with the answer from the results.

Tools:
- navigate(url)
- click(selector)
- type(selector, text, clear?)   ← use on TEXT-INPUT and TEXTAREA elements
- select(selector, value)        ← use on SELECT elements only
- scroll(direction, amount?)
- wait(ms)${screenshotLine}
- done(summary)

Element kinds you will see in PAGE STATE:
  TEXT-INPUT  → typeable field, use type()
  TEXTAREA    → typeable field, use type()
  SUBMIT      → button that submits a form, use click()
  BUTTON      → clickable, use click()
  LINK        → clickable, use click()
  SELECT      → dropdown, use select()
  CHECKBOX    → toggle, use click()

Example — task "search Google for cats":
  FASTEST: navigate("https://www.google.com/search?q=cats")
  OR via UI:
  → navigate("https://www.google.com")
  → type("#APjFqb", "cats", true)
  → click('input[name="btnK"]')

When done → done("summary")
${stuckLine}

Modal rules (handle BEFORE doing anything else):
- Language chooser modal → click the language that matches the task language (e.g. task in Indonesian → "Bahasa Indonesia", task in English → "English"). If unsure, click "English".
- Cookie consent / GDPR banner → click "Accept", "Accept All", or "OK"
- Newsletter / notification popup → click "Close", "No thanks", or "X"
- YouTube "Skip Ad" / "Skip" button → click immediately

Priority: dismiss modals first, then proceed with the task.`;
}

function elementToLine(el: Parameters<typeof buildDOMContext>[0]["elements"][number]): string | null {
  let kind: string;
  if (el.tag === "select") kind = "SELECT";
  else if (el.tag === "textarea") kind = "TEXTAREA";
  else if (el.tag === "a") kind = "LINK";
  else if (el.tag === "input") {
    const t = (el.type ?? "text").toLowerCase();
    if (t === "submit" || t === "button") kind = "SUBMIT";
    else if (t === "checkbox") kind = "CHECKBOX";
    else if (t === "radio") kind = "RADIO";
    else if (t === "hidden") return null;
    else kind = "TEXT-INPUT";
  } else kind = "BUTTON";

  const prefix = el.inModal ? "[MODAL] " : "";
  const parts = [`${prefix}${kind} selector="${el.selector}"`];
  if (el.placeholder) parts.push(`placeholder="${el.placeholder}"`);
  if (el.text) parts.push(`text="${el.text}"`);
  if (el.href) parts.push(`href="${el.href}"`);
  if (el.options) parts.push(`options=[${el.options.join(", ")}]`);
  return parts.join(" ");
}

export function buildDOMContext(dom: ParsedDOM): string {
  const modal = dom.elements.filter((e) => e.inModal);
  const rest = dom.elements.filter((e) => !e.inModal);
  const sorted = [...modal, ...rest];

  const lines = sorted.map(elementToLine).filter(Boolean).join("\n");

  const modalHeader = modal.length
    ? `⚠ MODAL OPEN — dismiss [MODAL] elements FIRST before doing anything else\n`
    : "";

  return `PAGE STATE — ${dom.title} (${dom.url})\n${modalHeader}${lines || "(no interactive elements found)"}`;
}