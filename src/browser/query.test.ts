import { test, expect, beforeAll, afterAll, describe } from "bun:test";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { DEEP_QUERY_SCRIPT } from "./query.ts";

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  page = await browser.newPage();
});

afterAll(async () => {
  await browser.close();
});

async function setup(html: string) {
  await page.setContent(`<!DOCTYPE html><html><body>${html}</body></html>`);
  await page.evaluate(DEEP_QUERY_SCRIPT);
}

async function q(selector: string) {
  return page.evaluate((sel) => {
    const el = (window as unknown as { __deepQuery: (s: string) => Element | null }).__deepQuery(sel);
    if (!el) return null;
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      href: el.getAttribute("href") || null,
      text: (el.textContent ?? "").trim().slice(0, 80) || null,
    };
  }, selector);
}

describe("__deepQuery basic selectors", () => {
  test("finds by ID", async () => {
    await setup(`<button id="submit-btn">Submit</button>`);
    const el = await q("#submit-btn");
    expect(el?.tag).toBe("button");
    expect(el?.id).toBe("submit-btn");
  });

  test("finds by class", async () => {
    await setup(`<input class="search-box" type="text" />`);
    const el = await q(".search-box");
    expect(el?.tag).toBe("input");
  });

  test("finds by attribute", async () => {
    await setup(`<input name="email" type="email" />`);
    const el = await q(`input[name="email"]`);
    expect(el?.tag).toBe("input");
  });

  test("returns null when not found", async () => {
    await setup(`<button>Click me</button>`);
    const el = await q("#nonexistent");
    expect(el).toBeNull();
  });
});

describe("__deepQuery :has-text filter", () => {
  test("matches by text content", async () => {
    await setup(`<button>Cancel</button><button>Confirm Order</button>`);
    const el = await q(`button:has-text("Confirm Order")`);
    expect(el?.tag).toBe("button");
    expect(el?.text).toContain("Confirm");
  });

  test("text match is case-insensitive", async () => {
    await setup(`<a href="/home">Go Home</a>`);
    const el = await q(`a:has-text("go home")`);
    expect(el?.tag).toBe("a");
  });

  test("returns null when text not found", async () => {
    await setup(`<button>Save</button>`);
    const el = await q(`button:has-text("Delete")`);
    expect(el).toBeNull();
  });
});

describe("__deepQuery href matching", () => {
  test("exact href match", async () => {
    await setup(`<a href="https://example.com/page">Link</a>`);
    const el = await q(`a[href="https://example.com/page"]`);
    expect(el?.tag).toBe("a");
    expect(el?.href).toBe("https://example.com/page");
  });

  test("Google-style redirect href — partial fallback", async () => {
    // Google wraps links: href="/url?q=https://id.wikipedia.org/wiki/..."
    await setup(`<a href="/url?q=https://id.wikipedia.org/wiki/Windah_Basudara&sa=U&ved=123">Wikipedia</a>`);
    const el = await q(`a[href="https://id.wikipedia.org/wiki/Windah_Basudara"]`);
    expect(el?.tag).toBe("a");
    expect(el?.href).toContain("wikipedia.org");
  });

  test("URL-encoded href — partial fallback with decodeURIComponent", async () => {
    // href has %3A instead of : and %2F instead of /
    await setup(`<a href="/url?q=https%3A%2F%2Fid.wikipedia.org%2Fwiki%2FWindah_Basudara">Wikipedia encoded</a>`);
    const el = await q(`a[href="https://id.wikipedia.org/wiki/Windah_Basudara"]`);
    expect(el?.tag).toBe("a");
  });

  test("exact href wins over partial when both exist", async () => {
    await setup(`
      <a href="/url?q=https://example.com/page">Redirect</a>
      <a href="https://example.com/page" id="direct">Direct</a>
    `);
    const el = await q(`a[href="https://example.com/page"]`);
    expect(el?.id).toBe("direct");
  });
});

describe("__deepQuery custom element / shadow DOM", () => {
  test("unwraps custom element to inner input", async () => {
    await setup(`
      <my-input id="wrap">
        <input type="text" placeholder="Email" />
      </my-input>
    `);
    // custom tag contains '-' so __deepQuery descends to inner input
    const el = await q("#wrap");
    expect(el?.tag).toBe("input");
  });

  test("traverses shadow DOM", async () => {
    // Attach a shadow root with a button inside
    await page.evaluate(() => {
      const host = document.createElement("div");
      host.id = "shadow-host";
      document.body.appendChild(host);
      const shadow = host.attachShadow({ mode: "open" });
      const btn = document.createElement("button");
      btn.id = "shadow-btn";
      btn.textContent = "Shadow Button";
      shadow.appendChild(btn);
    });
    await page.evaluate(DEEP_QUERY_SCRIPT);
    const el = await q("#shadow-btn");
    expect(el?.tag).toBe("button");
    expect(el?.text).toBe("Shadow Button");
  });
});
