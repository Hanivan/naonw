import { launch } from "cloakbrowser/puppeteer";
import puppeteer from "puppeteer-core";
import type { Browser, Page } from "puppeteer-core";

const CDP_VIEWPORT = { width: 1280, height: 720 };

export class BrowserManager {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private _cdp = false;

  isLaunched(): boolean { return this.browser !== null; }
  isCdp(): boolean { return this._cdp; }

  /** Try CDP first (if NAONW_CDP_URL set), fall back to local launch. */
  async connectOrLaunch(headless = false): Promise<Page> {
    const cdpUrl = process.env.NAONW_CDP_URL;
    if (cdpUrl) {
      try {
        return await this._connectCdp(cdpUrl);
      } catch {
        // CDP not reachable — fall through to local launch
      }
    }
    return this.launch(headless);
  }

  private async _connectCdp(cdpUrl: string): Promise<Page> {
    this.browser = await puppeteer.connect({ browserURL: cdpUrl, defaultViewport: CDP_VIEWPORT });
    const pages = await this.browser.pages();
    this.page = pages[0] ?? await this.browser.newPage();
    this._cdp = true;
    return this.page;
  }

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
    this._cdp = false;
    return this.page;
  }

  getPage(): Page {
    if (!this.page) throw new Error("Browser not launched");
    return this.page;
  }

  /** After closing the active page, pick another open tab from the same browser (CDP case). */
  async adoptAnotherPage(): Promise<Page | null> {
    if (!this.browser) return null;
    try {
      const pages = await this.browser.pages();
      const next = pages.find((p) => !p.isClosed());
      if (next) {
        this.page = next;
        return next;
      }
    } catch {}
    return null;
  }

  async relaunch(headless: boolean): Promise<Page> {
    if (this._cdp) return this.getPage(); // can't relaunch an external CDP session
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

  /**
   * Close the browser and detach. For CDP, prefer disconnect (leave the user's
   * Chrome alive). When `force=true` (e.g. agent called closeBrowser()), close
   * all pages we own and ALSO terminate Chrome via the Browser.close CDP method.
   */
  async close(force = false): Promise<void> {
    if (!this.browser) return;
    if (this._cdp) {
      if (force) {
        // Close all pages first so Browser.close has a clean exit
        try {
          const pages = await this.browser.pages();
          await Promise.all(pages.map((p) => p.close().catch(() => {})));
        } catch {}
        // browser.close() for a CDP-attached browser sends Browser.close — actually closes Chrome
        try { await this.browser.close(); } catch { try { this.browser.disconnect(); } catch {} }
      } else {
        try { this.browser.disconnect(); } catch {}
      }
    } else {
      try { await this.browser.close(); } catch {}
    }
    this.browser = null;
    this.page = null;
    this._cdp = false;
  }
}
