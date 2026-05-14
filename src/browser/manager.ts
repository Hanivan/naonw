import { launch } from "cloakbrowser/puppeteer";
import type { Browser, Page } from "puppeteer-core";

export class BrowserManager {
  private browser: Browser | null = null;
  private page: Page | null = null;

  isLaunched(): boolean { return this.browser !== null; }

  async launch(headless = false): Promise<Page> {
    const proxy = process.env.PROXY;
    const fingerprint = process.env.FINGERPRINT;

    this.browser = await launch({
      headless,
      humanize: true,
      ...(proxy ? { proxy } : {}),
      ...(fingerprint ? { args: [`--fingerprint=${fingerprint}`] } : {}),
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1280, height: 720 });
    return this.page;
  }

  getPage(): Page {
    if (!this.page) throw new Error("Browser not launched");
    return this.page;
  }

  async relaunch(headless: boolean): Promise<Page> {
    const url = this.page?.url();
    const cookies = this.page ? await this.page.cookies().catch(() => []) : [];
    await this.close();
    const page = await this.launch(headless);
    if (url && url !== "about:blank") {
      await page.goto(url, { waitUntil: "load", timeout: 30000 }).catch(() => {});
      if (cookies.length) await page.setCookie(...cookies).catch(() => {});
    }
    return page;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}
