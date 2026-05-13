import type { Page } from "puppeteer";
import type { ToolResult } from "./types.ts";
import { log } from "@/utils/logger.ts";
import { ensureDeepQuery } from "@/agent/tools/navigation.ts";

export async function click(page: Page, args: Record<string, unknown>): Promise<ToolResult> {
  const selector = args.selector as string;
  await ensureDeepQuery(page);
  const info = await page.evaluate((sel) => {
    if (typeof window.__deepQuery !== "function") {
      window.__deepQuery = (s: string) => document.querySelector(s);
    }
    const el = window.__deepQuery(sel);
    if (!el) return null;
    const h = el as HTMLElement;
    h.click();
    return {
      tag: el.tagName.toLowerCase(),
      text: (el.textContent ?? "").trim().slice(0, 80),
      href: (el as HTMLAnchorElement).href ?? "",
      type: el.getAttribute("type") ?? "",
      html: el.outerHTML.slice(0, 200),
    };
  }, selector);
  if (!info) throw new Error(`Element not found: ${selector}`);
  const detail = [info.tag, info.type && `[${info.type}]`, info.text && `"${info.text}"`, info.href && `→ ${info.href}`].filter(Boolean).join(" ");
  log.element(detail, info.html);
  await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {});
  return { text: `Clicked ${selector}` };
}

export async function typeText(page: Page, args: Record<string, unknown>): Promise<ToolResult> {
  const selector = args.selector as string;
  const text = args.text as string;
  await ensureDeepQuery(page);
  const focused = await page.evaluate((sel, clear) => {
    if (typeof window.__deepQuery !== "function") {
      window.__deepQuery = (s: string) => document.querySelector(s);
    }
    const el = window.__deepQuery(sel);
    if (!el) return false;
    (el as HTMLElement).focus();
    if (clear) {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      if (nativeSetter) nativeSetter.call(el, "");
      else (el as HTMLInputElement).value = "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    return true;
  }, selector, args.clear ?? false);
  if (!focused) throw new Error(`Element not found: ${selector}`);
  await page.keyboard.type(text, { delay: 50 });
  return { text: `Typed "${text}" into ${selector}` };
}

export async function typeAndSelect(page: Page, args: Record<string, unknown>): Promise<ToolResult> {
  const selector = args.selector as string;
  const text = args.text as string;
  const pick = args.pick as string | undefined;

  const focused = await page.evaluate((sel) => {
    if (typeof window.__deepQuery !== "function") {
      window.__deepQuery = (s: string) => document.querySelector(s);
    }
    const el = window.__deepQuery(sel);
    if (!el) return false;
    (el as HTMLElement).focus();
    return true;
  }, selector);
  if (!focused) throw new Error(`Element not found: ${selector}`);

  await page.keyboard.type(text, { delay: 60 });

  const listboxSel = await page.evaluate((sel) => {
    if (typeof window.__deepQuery !== "function") {
      window.__deepQuery = (s: string) => document.querySelector(s);
    }
    const el = window.__deepQuery(sel);
    const ctrl = el?.getAttribute("aria-controls");
    return ctrl ? `#${CSS.escape(ctrl)}` : null;
  }, selector);

  // wait until suggestion items have visible text (empty <ul> is always in DOM)
  const itemsSel = listboxSel
    ? `${listboxSel} [role="option"], ${listboxSel} [data-autocomplete-item]`
    : '[role="option"], [data-autocomplete-item]';

  const SKIP = ["loadingindicator", "masukkan sendiri", "enter address manually", "cannot find"];
  await page.waitForFunction(
    (sel: string, skip: string[]) => {
      const items = Array.from(document.querySelectorAll(sel));
      return items.some((el) => {
        const t = (el.textContent ?? "").toLowerCase().trim();
        return t.length > 0 && !skip.some((s) => t.includes(s));
      });
    },
    { timeout: 8000, polling: 300 },
    itemsSel,
    SKIP,
  ).catch(() => {});
  await new Promise((r) => setTimeout(r, 400));

  const SKIP_LC = ["loadingindicator", "masukkan sendiri", "enter address manually", "cannot find"];
  const suggestions = await page.evaluate((sel, skip) => {
    return Array.from(document.querySelectorAll(sel))
      .map((el) => {
        const label = el.getAttribute("aria-label") ?? "";
        const txt = (el.textContent ?? "").replace(/\s+/g, " ").trim();
        return label || txt;
      })
      .filter((t) => {
        const lc = t.toLowerCase();
        return t.length > 0 && !skip.some((s: string) => lc.includes(s));
      });
  }, itemsSel, SKIP_LC);

  const debugItems = await page.evaluate((sel) => {
    return Array.from(document.querySelectorAll(sel)).map((el) => ({
      tag: el.tagName.toLowerCase(),
      cls: (el.getAttribute("class") ?? "").slice(0, 60),
      role: el.getAttribute("role") ?? "",
      label: (el.getAttribute("aria-label") ?? "").slice(0, 80),
      txt: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
    }));
  }, itemsSel);
  log.warn(`[typeAndSelect] ${debugItems.length} item(s): ${JSON.stringify(debugItems, null, 2)}`);

  if (!pick) {
    const hint = suggestions.length ? `Suggestions: ${suggestions.slice(0, 5).join(" | ")}` : "No suggestions appeared";
    return { text: `Typed "${text}" into ${selector}. ${hint}` };
  }

  const picked = await page.evaluate((itemsSel, pickText) => {
    const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9À-ɏ]+/g, " ").trim().split(/\s+/).filter(Boolean);
    const pickTokens = tokens(pickText);
    const score = (candidate: string) => {
      const cTokens = tokens(candidate);
      return pickTokens.filter((t) => cTokens.includes(t)).length;
    };
    const items = Array.from(document.querySelectorAll(itemsSel));
    const scored = items.map((el) => {
      const label = el.getAttribute("aria-label") ?? "";
      const txt = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      const best = label || txt;
      return { el, text: best, score: score(best) };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
    if (!scored.length) return null;
    const top = scored[0]!;
    (top.el as HTMLElement).click();
    return top.text.slice(0, 100);
  }, itemsSel, pick);

  if (!picked) {
    const available = suggestions.slice(0, 5).join(" | ");
    throw new Error(`Suggestion matching "${pick}" not found. Available: ${available || "none"}`);
  }
  return { text: `Typed "${text}" and selected "${picked}"` };
}

export async function selectOption(page: Page, args: Record<string, unknown>): Promise<ToolResult> {
  const selector = args.selector as string;
  const value = args.value as string;
  const selected = await page.evaluate((sel, val) => {
    if (typeof window.__deepQuery !== "function") {
      window.__deepQuery = (s: string) => document.querySelector(s);
    }
    const el = window.__deepQuery(sel) as HTMLSelectElement | null;
    if (!el) return false;
    const option = Array.from(el.options).find(
      (o) => o.value === val || o.text.trim() === val,
    );
    if (!option) return false;
    option.selected = true;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, selector, value);
  if (!selected) throw new Error(`Element not found or option "${value}" not available`);
  return { text: `Selected "${value}" in ${selector}` };
}
