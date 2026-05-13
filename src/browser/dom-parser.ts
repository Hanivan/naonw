import type { Page } from "puppeteer";

interface InteractiveElement {
  tag: string;
  type?: string;
  name?: string;
  placeholder?: string;
  text?: string;
  href?: string;
  selector: string;
  options?: string[];
  inModal?: boolean;
}

interface ParsedDOM {
  url: string;
  title: string;
  elements: InteractiveElement[];
}

export async function detectDialog(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    function isVisible(el: Element): boolean {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    }
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]'));
    return dialogs.some(isVisible);
  });
}

export async function detectCaptcha(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const CAPTCHA_ID_PREFIXES = ["captcha", "recaptcha", "hcaptcha", "cf-challenge", "turnstile"];
    const CAPTCHA_CLASS_PREFIXES = ["g-recaptcha", "h-captcha", "cf-turnstile", "captcha", "recaptcha"];

    function isVisible(el: Element): boolean {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    }

    const captchaEls = Array.from(document.querySelectorAll("[id],[class]"));

    const hasId = captchaEls.some((el) => {
      if (!el.id) return false;
      const id = el.id.toLowerCase();
      return CAPTCHA_ID_PREFIXES.some((p) => id.startsWith(p) || id.includes(p)) && isVisible(el);
    });

    const hasClass = captchaEls.some((el) => {
      const classes = Array.from(el.classList).map((c) => c.toLowerCase());
      return classes.some((cls) => CAPTCHA_CLASS_PREFIXES.some((p) => cls.startsWith(p) || cls.includes(p))) && isVisible(el);
    });

    const hasTitle = /captcha|unusual traffic|robot|verify you are human/i.test(document.title);

    return hasId || hasClass || hasTitle;
  });
}

export async function parseDOM(page: Page): Promise<ParsedDOM> {
  const elements = await page.evaluate(() => {
    function segmentFor(el: Element): string {
      const tag = el.tagName.toLowerCase();
      if (el.id) return `#${CSS.escape(el.id)}`;
      const testId = el.getAttribute("data-testid");
      if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
      const dataId = el.getAttribute("data-id");
      if (dataId) return `${tag}[data-id="${CSS.escape(dataId)}"]`;
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel) return `${tag}[aria-label="${CSS.escape(ariaLabel)}"]`;
      const name = el.getAttribute("name");
      if (name) return `${tag}[name="${CSS.escape(name)}"]`;
      const type = el.getAttribute("type");
      const parent = el.parentElement;
      const siblings = Array.from(parent?.children ?? []).filter((s) => s.tagName === el.tagName);
      const idx = siblings.indexOf(el) + 1;
      if (type) return `${tag}[type="${CSS.escape(type)}"]:nth-child(${idx})`;
      return siblings.length === 1 ? tag : `${tag}:nth-child(${idx})`;
    }

    function isStableSegment(seg: string): boolean {
      return seg.startsWith("#") || seg.startsWith("[data-testid") || seg.includes("[aria-label") || seg.includes("[data-id");
    }

    function buildSelector(el: Element): string {
      if (el.id) return `#${CSS.escape(el.id)}`;
      const testId = el.getAttribute("data-testid");
      if (testId) return `[data-testid="${CSS.escape(testId)}"]`;

      const parts: string[] = [];
      let cur: Element | null = el;

      while (cur && parts.length < 4) {
        const seg = segmentFor(cur);
        parts.unshift(seg);
        if (isStableSegment(seg)) break;
        cur = cur.parentElement;
      }

      return parts.join(" > ");
    }

    function isInModal(el: Element): boolean {
      let cur: Element | null = el.parentElement;
      while (cur) {
        const role = cur.getAttribute("role");
        if (role === "dialog" || role === "alertdialog") {
          const rect = cur.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return false;
          const style = window.getComputedStyle(cur);
          if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
          return true;
        }
        cur = cur.parentElement;
      }
      return false;
    }

    const results: InteractiveElement[] = [];
    const seen = new Set<string>();

    for (const el of Array.from(document.querySelectorAll("input, button, a, select, textarea, [role='button'], [role='option'], [role='listitem'], [data-autocomplete-item]"))) {
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute("type") ?? "").toLowerCase();

      // skip noise
      if (type === "hidden" || type === "file") continue;
      if (tag === "input" && !type) continue;

      const selector = buildSelector(el);
      if (seen.has(selector)) continue;
      seen.add(selector);

      const rawText = (el.textContent ?? "").trim();
      // skip elements whose only content is CSS/JS blobs
      if (rawText.includes("{") && rawText.includes(":") && !el.id && !el.getAttribute("aria-label")) continue;

      const entry: InteractiveElement = { tag, selector, ...(isInModal(el) ? { inModal: true } : {}) };

      if (type) entry.type = type;

      const name = el.getAttribute("name");
      if (name) entry.name = name;

      const placeholder = el.getAttribute("placeholder") ?? el.getAttribute("aria-label");
      if (placeholder) entry.placeholder = placeholder;

      const href = el.getAttribute("href");
      if (href && href !== "#") entry.href = href;

      if (tag === "select") {
        entry.options = Array.from((el as HTMLSelectElement).options).map((o) => o.value || o.text);
      }

      const text = rawText.slice(0, 80);
      if (text && tag !== "input") entry.text = text;

      results.push(entry);
    }

    return results;
  });

  return {
    url: page.url(),
    title: await page.title(),
    elements,
  };
}

export type { ParsedDOM, InteractiveElement };