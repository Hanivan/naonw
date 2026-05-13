import type { Page } from "puppeteer";
import type { InteractiveElement } from "./parsers/elements.ts";
import { parseElements } from "./parsers/elements.ts";
import { parseTextBlocks, parseTables, parseAlerts, parseImages } from "./parsers/content.ts";
import { parseBreadcrumb, parsePagination, parseLoading } from "./parsers/metadata.ts";

export { detectDialog, detectCaptcha } from "./detectors.ts";
export type { InteractiveElement } from "./parsers/elements.ts";

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

async function expandCollapsed(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const header of Array.from(document.querySelectorAll(
      ".elementor-accordion-item .elementor-tab-title:not(.elementor-active), " +
      '[data-bs-toggle="collapse"]:not(.collapsed), ' +
      ".accordion-button.collapsed, " +
      '[role="tab"][aria-expanded="false"]'
    ))) {
      try { (header as HTMLElement).click(); } catch { /* skip */ }
    }
  });
  await page.evaluate(() => {
    for (const content of Array.from(document.querySelectorAll(
      '.elementor-tab-content[style*="display: none"], ' +
      '.elementor-tab-content:not(.elementor-active), ' +
      '.collapse:not(.show), ' +
      '.tab-pane:not(.active)'
    ))) {
      (content as HTMLElement).style.display = "block";
    }
  });
}

export async function parseDOM(page: Page): Promise<ParsedDOM> {
  await expandCollapsed(page);

  const [elements, textBlocks, tables, alerts, breadcrumb, pagination, loading, images] = await Promise.all([
    parseElements(page),
    parseTextBlocks(page),
    parseTables(page),
    parseAlerts(page),
    parseBreadcrumb(page),
    parsePagination(page),
    parseLoading(page),
    parseImages(page),
  ]);

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

export type { ParsedDOM };
