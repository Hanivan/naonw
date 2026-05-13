import type { Page } from "puppeteer";

export async function parseBreadcrumb(page: Page): Promise<string> {
  return page.evaluate(() => {
    const nav = document.querySelector(
      '[aria-label*="breadcrumb" i], nav.breadcrumb, ol.breadcrumb, [class*="breadcrumb"], [itemtype*="BreadcrumbList"]'
    );
    if (!nav) return "";
    const items = Array.from(nav.querySelectorAll("li, a, span, [itemprop='name']"))
      .map((el) => (el.textContent ?? "").trim())
      .filter((t) => t.length > 0 && !/^[›>\\/|]$/.test(t));
    return [...new Set(items)].join(" › ").slice(0, 200);
  });
}

export async function parsePagination(page: Page): Promise<string> {
  return page.evaluate(() => {
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
}

export async function parseLoading(page: Page): Promise<boolean> {
  return page.evaluate(() => {
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
}
