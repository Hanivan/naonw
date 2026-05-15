import puppeteer from "puppeteer-core";
import type { Page } from "puppeteer-core";

export const VIEWPORT = { width: 1024, height: 768 };

export function targetId(t: any): string {
  return t._targetId ?? t.url();
}

export async function connect(tabId?: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const cdpUrl = process.env.NAONW_CDP_URL ?? "http://127.0.0.1:9222";
  const browser = await puppeteer.connect({ browserURL: cdpUrl, defaultViewport: VIEWPORT });
  const pages = browser.targets().filter(t => t.type() === "page");
  const target = tabId ? pages.find(t => targetId(t) === tabId) : pages[0];
  if (!target) throw new Error("No page found. Is Chrome running with --remote-debugging-port=9222?");
  const page = await target.page();
  if (!page) throw new Error("Could not attach to page");
  return { page, close: () => browser.disconnect() as unknown as Promise<void> };
}

export async function connectBrowser() {
  const cdpUrl = process.env.NAONW_CDP_URL ?? "http://127.0.0.1:9222";
  return puppeteer.connect({ browserURL: cdpUrl, defaultViewport: VIEWPORT });
}
