import type { Page } from "puppeteer";

interface InteractiveElement {
  tag: string;
  type?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  text?: string;
  href?: string;
  selector: string;
  options?: string[];
  value?: string;
  checked?: boolean;
  expanded?: boolean;
  inModal?: boolean;
}

interface ParsedDOM {
  url: string;
  title: string;
  elements: InteractiveElement[];
  textBlocks: string[];
  tables: string[];
  alerts: string[];
  breadcrumb: string;
  pagination: string;
  loading: boolean;
  images: string[];
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
      if (tag === "a") {
        const href = el.getAttribute("href");
        if (href && href !== "#") return `a[href="${href.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
      }
      const type = el.getAttribute("type");
      const parent = el.parentElement;
      const siblings = Array.from(parent?.children ?? []).filter((s) => s.tagName === el.tagName);
      const idx = siblings.indexOf(el) + 1;
      if (type) return `${tag}[type="${CSS.escape(type)}"]:nth-child(${idx})`;
      return siblings.length === 1 ? tag : `${tag}:nth-child(${idx})`;
    }

    function isStableSegment(seg: string): boolean {
      return seg.startsWith("#") || seg.startsWith("[data-testid") || seg.includes("[aria-label") || seg.includes("[data-id") || seg.startsWith("a[href=");
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

    function getLabel(el: Element): string {
      if (el.id) {
        const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lbl) return (lbl.textContent ?? "").trim().slice(0, 40);
      }
      const parent = el.closest("label");
      if (parent) {
        const clone = parent.cloneNode(true) as Element;
        clone.querySelectorAll("input,button,select,textarea").forEach((c) => c.remove());
        const t = (clone.textContent ?? "").trim();
        if (t) return t.slice(0, 40);
      }
      const labelledBy = el.getAttribute("aria-labelledby");
      if (labelledBy) {
        const lblEl = document.getElementById(labelledBy);
        if (lblEl) return (lblEl.textContent ?? "").trim().slice(0, 40);
      }
      return "";
    }

    const results: InteractiveElement[] = [];
    const seen = new Set<string>();

    for (const el of Array.from(document.querySelectorAll("input, button, a, select, textarea, [role='button'], [role='option'], [role='listitem'], [data-autocomplete-item]"))) {
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute("type") ?? "").toLowerCase();

      if (type === "hidden" || type === "file") continue;
      if (tag === "input" && !type) continue;

      const selector = buildSelector(el);
      if (seen.has(selector)) continue;
      seen.add(selector);

      const rawText = (el.textContent ?? "").trim();
      if (rawText.includes("{") && rawText.includes(":") && !el.id && !el.getAttribute("aria-label")) continue;

      const entry: InteractiveElement = { tag, selector, ...(isInModal(el) ? { inModal: true } : {}) };

      if (type) entry.type = type;

      const name = el.getAttribute("name");
      if (name) entry.name = name;

      const label = getLabel(el);
      if (label) entry.label = label;

      const placeholder = el.getAttribute("placeholder") ?? (!label ? el.getAttribute("aria-label") : null);
      if (placeholder) entry.placeholder = placeholder;

      const href = el.getAttribute("href");
      if (href && href !== "#") entry.href = href;

      if (tag === "input") {
        if (type === "checkbox" || type === "radio") {
          entry.checked = (el as HTMLInputElement).checked;
        } else if (!["submit", "button"].includes(type)) {
          const val = (el as HTMLInputElement).value;
          if (val) entry.value = val.slice(0, 60);
        }
      }
      if (tag === "select") {
        const sel = el as HTMLSelectElement;
        entry.options = Array.from(sel.options).slice(0, 8).map((o) => o.value || o.text);
        const cur = sel.options[sel.selectedIndex];
        if (cur) entry.value = (cur.text || cur.value).slice(0, 40);
      }
      if (tag === "textarea") {
        const val = (el as HTMLTextAreaElement).value;
        if (val) entry.value = val.slice(0, 60);
      }

      const expandedAttr = el.getAttribute("aria-expanded");
      if (expandedAttr !== null) entry.expanded = expandedAttr === "true";

      const text = rawText.slice(0, 50);
      if (text && tag !== "input") entry.text = text;

      results.push(entry);
      if (results.length >= 40) return results;
    }

    return results;
  });

  const textBlocks = await page.evaluate(() => {
    function isVisible(el: Element): boolean {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    }
    function isInNoiseZone(el: Element): boolean {
      let cur: Element | null = el;
      while (cur) {
        const tag = cur.tagName.toLowerCase();
        if (tag === "nav" || tag === "footer" || tag === "script" || tag === "style") return true;
        const role = cur.getAttribute("role");
        if (role === "navigation" || role === "banner") return true;
        cur = cur.parentElement;
      }
      return false;
    }
    const seen = new Set<string>();
    const blocks: string[] = [];
    for (const el of Array.from(document.querySelectorAll("h1,h2,h3,h4,p,li,span,td,div"))) {
      if (!isVisible(el) || isInNoiseZone(el)) continue;
      const hasBlockChild = Array.from(el.children).some((c) => {
        const t = c.tagName.toLowerCase();
        return t === "p" || t === "div" || t === "section" || t === "article" || t === "ul" || t === "ol";
      });
      if (hasBlockChild) continue;
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text.length < 10 || text.length > 120) continue;
      if (seen.has(text)) continue;
      if (text.includes("{") && text.includes(":")) continue;
      seen.add(text);
      blocks.push(text);
      if (blocks.length >= 20) break;
    }
    return blocks;
  });

  const tables = await page.evaluate(() => {
    const results: string[] = [];
    for (const table of Array.from(document.querySelectorAll("table"))) {
      const lines: string[] = [];
      const thEls = Array.from(table.querySelectorAll("thead th, thead td"));
      const headers = thEls.map((th) => (th.textContent ?? "").replace(/\s+/g, " ").trim()).filter(Boolean);
      if (headers.length) lines.push(headers.join(" | "));
      let rowCount = 0;
      for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
        const cells = Array.from(row.querySelectorAll("td"));
        if (!cells.length) continue;
        const colspan = cells[0]?.getAttribute("colspan");
        if (colspan && parseInt(colspan) > 2) {
          const label = (cells[0]?.textContent ?? "").replace(/\s+/g, " ").trim();
          if (label) lines.push(`[${label}]`);
          continue;
        }
        const values = cells.map((td) => (td.textContent ?? "").replace(/\s+/g, " ").trim() || "-");
        if (values.slice(1).every((v) => v === "-")) continue;
        lines.push(values.join(" | "));
        if (++rowCount >= 50) break;
      }
      if (lines.length > 1) results.push(lines.join("\n"));
      if (results.length >= 3) break;
    }
    return results;
  });

  const alerts = await page.evaluate(() => {
    function isVisible(el: Element): boolean {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    }
    const seen = new Set<string>();
    const results: string[] = [];
    const candidates = Array.from(document.querySelectorAll(
      '[role="alert"],[role="status"],[role="log"],.alert,.toast,.notification,.error,.success,.warning,[class*="error-msg"],[class*="alert-"],[class*="toast-"]'
    ));
    for (const el of candidates) {
      if (!isVisible(el)) continue;
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text.length < 5 || text.length > 150 || seen.has(text)) continue;
      seen.add(text);
      results.push(text);
      if (results.length >= 5) break;
    }
    return results;
  });

  const breadcrumb = await page.evaluate(() => {
    const nav = document.querySelector(
      '[aria-label*="breadcrumb" i], nav.breadcrumb, ol.breadcrumb, [class*="breadcrumb"], [itemtype*="BreadcrumbList"]'
    );
    if (!nav) return "";
    const items = Array.from(nav.querySelectorAll("li, a, span, [itemprop='name']"))
      .map((el) => (el.textContent ?? "").trim())
      .filter((t) => t.length > 0 && !/^[›>\\/|]$/.test(t));
    return [...new Set(items)].join(" › ").slice(0, 200);
  });

  const pagination = await page.evaluate(() => {
    const pagEl = document.querySelector(
      '[aria-label*="pagination" i], .pagination, [class*="pagination"], [class*="pager"]'
    );
    if (pagEl) {
      const text = (pagEl.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text.length > 2) return text.slice(0, 120);
    }
    const match = (document.body.innerText ?? "").match(
      /(?:page|halaman)\s+\d+\s+(?:of|dari)\s+\d+|showing\s+[\d,]+-[\d,]+\s+of\s+[\d,]+|hasil\s+[\d.]+-[\d.]+\s+dari\s+[\d.]+/i
    );
    return match ? match[0] : "";
  });

  const loading = await page.evaluate(() => {
    function isVisible(el: Element): boolean {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    }
    const sels = [
      '[class*="spinner"]', '[class*="skeleton"]', '[class*="shimmer"]',
      '[class*="loader"]', '[aria-busy="true"]', '[role="progressbar"]',
    ];
    return sels.some((sel) => Array.from(document.querySelectorAll(sel)).some(isVisible));
  });

  const images = await page.evaluate(() => {
    const results: string[] = [];
    for (const img of Array.from(document.querySelectorAll("img[alt]"))) {
      const alt = (img.getAttribute("alt") ?? "").trim();
      if (alt.length < 6 || alt.length > 80) continue;
      if (/^(icon|logo|arrow|close|search|menu|button|img|image|\d+|avatar|profile)$/i.test(alt)) continue;
      const rect = img.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 80) continue;
      results.push(alt);
      if (results.length >= 5) break;
    }
    return results;
  });

  return {
    url: page.url(),
    title: await page.title(),
    elements,
    textBlocks,
    tables,
    alerts,
    breadcrumb,
    pagination,
    loading,
    images,
  };
}

export type { ParsedDOM, InteractiveElement };
