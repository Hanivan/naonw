import type { Page } from "puppeteer";

export interface InteractiveElement {
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
  autocomplete?: boolean;
  html?: string;
}

export async function parseElements(page: Page): Promise<InteractiveElement[]> {
  return page.evaluate(() => {
    function segmentFor(el: Element): string {
      const tag = el.tagName.toLowerCase();
      if (el.id) return `#${CSS.escape(el.id)}`;
      const e2eId = el.getAttribute("data-e2e-id");
      if (e2eId) return `[data-e2e-id="${CSS.escape(e2eId)}"]`;
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
      // for inputs inside a custom element with formcontrolname, build a readable selector
      const customParent = el.closest("[formcontrolname]");
      if (customParent) {
        const fcn = customParent.getAttribute("formcontrolname")!;
        const innerTag = tag;
        const innerSiblings = Array.from(customParent.querySelectorAll(innerTag));
        const innerIdx = innerSiblings.indexOf(el);
        const suffix = innerIdx > 0 ? `:nth-of-type(${innerIdx + 1})` : "";
        return `[formcontrolname="${CSS.escape(fcn)}"] ${innerTag}${suffix}`;
      }
      const type = el.getAttribute("type");
      const parent = el.parentElement;
      const siblings = Array.from(parent?.children ?? []).filter((s) => s.tagName === el.tagName);
      const idx = siblings.indexOf(el) + 1;
      if (type) return `${tag}[type="${CSS.escape(type)}"]:nth-child(${idx})`;
      return siblings.length === 1 ? tag : `${tag}:nth-child(${idx})`;
    }

    function isStableSegment(seg: string): boolean {
      return (
        seg.startsWith("#") ||
        seg.startsWith("[data-testid") ||
        seg.startsWith("[data-e2e-id") ||
        seg.includes("[aria-label") ||
        seg.includes("[data-id") ||
        seg.startsWith("a[href=") ||
        seg.includes("[formcontrolname=")
      );
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

    const OVERLAY_PATTERNS = ["geo-locator", "locator", "country", "modal", "dialog", "overlay", "popup", "lightbox"];

    function isVisibleElement(el: Element): boolean {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    }

    function isBlockingOverlay(el: Element): boolean {
      if (!isVisibleElement(el)) return false;
      const style = window.getComputedStyle(el);
      if (style.position !== "fixed" && style.position !== "sticky") return false;
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth || 1;
      const vh = window.innerHeight || 1;
      return (rect.width / vw) > 0.2 && (rect.height / vh) > 0.2;
    }

    function findVisibleOverlay(): Element | null {
      // role-based: always trust these
      const roleBased = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], [aria-modal="true"]'))
        .filter(isVisibleElement);
      if (roleBased.length) return roleBased[0] ?? null;
      // class-based: only count fixed-position, viewport-covering overlays
      for (const pat of OVERLAY_PATTERNS) {
        for (const el of Array.from(document.querySelectorAll(`[class*="${pat}"]`))) {
          if (isBlockingOverlay(el) && el.querySelectorAll("a, button, input, select").length > 0) return el;
        }
      }
      return null;
    }

    function isInModal(el: Element): boolean {
      let cur: Element | null = el.parentElement;
      while (cur) {
        const role = cur.getAttribute("role");
        if (role === "dialog" || role === "alertdialog") {
          if (!isVisibleElement(cur)) return false;
          return true;
        }
        const cls = (cur.getAttribute("class") ?? "").toLowerCase();
        if (OVERLAY_PATTERNS.some((p) => cls.includes(p)) && isBlockingOverlay(cur)) return true;
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
      // walk up into custom element wrappers (e.g. fdk-form-input) for aria-label
      let cur: Element | null = el.parentElement;
      while (cur && cur !== document.body) {
        if (cur.tagName.includes("-")) {
          const al = cur.getAttribute("aria-label");
          if (al) return al.trim().slice(0, 40);
        }
        cur = cur.parentElement;
      }
      // formcontrolname as readable label hint
      const fcnEl = el.closest("[formcontrolname]");
      if (fcnEl) {
        const fcn = fcnEl.getAttribute("formcontrolname") ?? "";
        if (fcn) return fcn.slice(0, 40);
      }
      // fallback: nearest fieldset legend or label sibling
      const fieldset = el.closest("fieldset");
      if (fieldset) {
        const legend = fieldset.querySelector("label, legend");
        if (legend) return (legend.textContent ?? "").trim().slice(0, 40);
      }
      return "";
    }

    const results: InteractiveElement[] = [];
    const seen = new Set<string>();

    // overlay elements first so they're never cut by the 40-cap
    const overlay = findVisibleOverlay();
    const overlayEls: Element[] = overlay
      ? Array.from(overlay.querySelectorAll("a, button, input, select, [data-country-code]"))
      : [];
    const pageEls = Array.from(document.querySelectorAll("input, button, a, select, textarea, [role='button'], [role='option'], [role='listitem'], [data-autocomplete-item], [data-country-code]"));
    const allEls = [...overlayEls, ...pageEls.filter((e) => !overlayEls.includes(e))];

    for (const el of allEls) {
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute("type") ?? "").toLowerCase();

      if (type === "hidden" || type === "file") continue;
      if (tag === "input" && !type) continue;

      const selector = buildSelector(el);
      if (seen.has(selector)) continue;
      seen.add(selector);

      const rawText = (el.textContent ?? "").trim();
      if (rawText.includes("{") && rawText.includes(":") && !el.id && !el.getAttribute("aria-label")) continue;

      const inModal = isInModal(el);
      const entry: InteractiveElement = { tag, selector, ...(inModal ? { inModal: true, html: el.outerHTML.slice(0, 200) } : {}) };

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

      if (el.getAttribute("aria-autocomplete") === "list" || el.getAttribute("aria-controls")) {
        entry.autocomplete = true;
      }

      const text = rawText.slice(0, 100);
      if (text && tag !== "input") entry.text = text;

      results.push(entry);
      if (results.length >= 100) break;
    }

    // always surface submit buttons and primary CTAs — never cut by cap
    const submitSels = 'button[type="submit"], input[type="submit"], button[id*="submit" i], button[id*="Submit"], button[class*="primary"]';
    for (const el of Array.from(document.querySelectorAll(submitSels))) {
      const selector = buildSelector(el);
      if (seen.has(selector)) continue;
      seen.add(selector);
      const rawText = (el.textContent ?? "").trim();
      const entry: InteractiveElement = {
        tag: el.tagName.toLowerCase(),
        selector,
        type: el.getAttribute("type") ?? undefined,
        text: rawText.slice(0, 50) || undefined,
      };
      results.push(entry);
    }

    return results;
  });
}
