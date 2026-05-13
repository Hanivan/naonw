import puppeteer, { type Browser, type Page } from "puppeteer";
import { DEEP_QUERY_SCRIPT } from "@/browser/query.ts";

export class BrowserManager {
  private browser: Browser | null = null;
  private page: Page | null = null;

  isLaunched(): boolean { return this.browser !== null; }

  async launch(headless = false): Promise<Page> {
    this.browser = await puppeteer.launch({ headless });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1280, height: 720 });
    await this.page.evaluateOnNewDocument(DEEP_QUERY_SCRIPT);
    // await this.page.goto("https://www.google.com");
    return this.page;
  }

  getPage(): Page {
    if (!this.page) throw new Error("Browser not launched");
    return this.page;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}