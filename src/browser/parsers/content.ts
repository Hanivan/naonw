import type { Page } from "puppeteer";

export async function parseTextBlocks(page: Page): Promise<string[]> {
  return page.evaluate(() => {
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
      if (text.length < 10 || text.length > 500) continue;
      if (seen.has(text)) continue;
      if (text.includes("{") && text.includes(":")) continue;
      seen.add(text);
      blocks.push(text);
      if (blocks.length >= 60) break;
    }
    return blocks;
  });
}

export async function parseTables(page: Page): Promise<string[]> {
  return page.evaluate(() => {
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
}

export async function parseAlerts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
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
}

export async function parseImages(page: Page): Promise<string[]> {
  return page.evaluate(() => {
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
}
