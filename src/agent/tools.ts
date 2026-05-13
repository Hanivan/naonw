import type { Page } from "puppeteer";
import type { ToolDefinition } from "@/ai/client.ts";
import { toMessage } from "@/utils/errors.ts";
import { log } from "@/utils/logger.ts";
import "@/browser/query.ts";

export const toolDefinitions: ToolDefinition[] = [
  {
    name: "navigate",
    description: "Navigate to a URL",
    parameters: {
      type: "object",
      required: ["url"],
      properties: {
        url: { type: "string", description: "The URL to navigate to" },
      },
    },
  },
  {
    name: "click",
    description: "Click an element on the page",
    parameters: {
      type: "object",
      required: ["selector"],
      properties: {
        selector: { type: "string", description: "CSS selector of the element to click" },
      },
    },
  },
  {
    name: "type",
    description: "Type text into an input field",
    parameters: {
      type: "object",
      required: ["selector", "text"],
      properties: {
        selector: { type: "string", description: "CSS selector of the input" },
        text: { type: "string", description: "Text to type" },
        clear: { type: "boolean", description: "Clear existing text first" },
      },
    },
  },
  {
    name: "select",
    description: "Select an option in a dropdown",
    parameters: {
      type: "object",
      required: ["selector", "value"],
      properties: {
        selector: { type: "string", description: "CSS selector of the select element" },
        value: { type: "string", description: "Value of the option to select" },
      },
    },
  },
  {
    name: "scroll",
    description: "Scroll the page up or down",
    parameters: {
      type: "object",
      required: ["direction"],
      properties: {
        direction: { type: "string", description: "Direction to scroll (up or down)" },
        amount: { type: "number", description: "Pixels to scroll (default 500)" },
      },
    },
  },
  {
    name: "wait",
    description: "Wait for a specified duration",
    parameters: {
      type: "object",
      required: ["ms"],
      properties: {
        ms: { type: "number", description: "Milliseconds to wait" },
      },
    },
  },
  {
    name: "screenshot",
    description: "Take a screenshot of the current page and send it to the AI",
    parameters: {
      type: "object",
      required: [],
      properties: {},
    },
  },
  {
    name: "solveCaptcha",
    description: "Take a screenshot of the reCAPTCHA challenge and extract the challenge description. Use this when a CAPTCHA is visible. Returns a screenshot and the challenge text so you can identify which tiles to select.",
    parameters: { type: "object", required: [], properties: {} },
  },
  {
    name: "clickCaptchaTile",
    description: "Click one or more tiles in a reCAPTCHA image challenge by their numeric IDs (0-based, left-to-right top-to-bottom). Set verify=true to click the Verify/Next button after selecting.",
    parameters: {
      type: "object",
      required: ["ids"],
      properties: {
        ids: { type: "array", items: { type: "number" }, description: "Tile IDs to click (0–15 for 4×4 grid)" },
        verify: { type: "boolean", description: "Click the Verify/Next button after selecting tiles" },
      },
    },
  },
  {
    name: "done",
    description: "Signal that the task is complete",
    parameters: {
      type: "object",
      required: ["summary"],
      properties: {
        summary: { type: "string", description: "Summary of what was accomplished" },
      },
    },
  },
];

export interface ToolResult {
  text: string;
  imageBase64?: string;
}

export async function executeTool(
  page: Page,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "navigate": {
        await page.goto(args.url as string, { waitUntil: "domcontentloaded", timeout: 30000 });
        return { text: `Navigated to ${page.url()}` };
      }
      case "click": {
        const selector = args.selector as string;
        const info = await page.evaluate((sel) => {
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
      case "type": {
        const selector = args.selector as string;
        const text = args.text as string;
        const focused = await page.evaluate((sel, clear) => {
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
      case "select": {
        const selector = args.selector as string;
        const value = args.value as string;
        const selected = await page.evaluate((sel, val) => {
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
      case "scroll": {
        const amount = (args.amount as number) ?? 500;
        const dir = args.direction === "up" ? -amount : amount;
        await page.evaluate((d) => window.scrollBy(0, d as number), dir);
        return { text: `Scrolled ${args.direction as string} by ${amount}px` };
      }
      case "wait": {
        await Bun.sleep(args.ms as number);
        return { text: `Waited ${args.ms as number}ms` };
      }
      case "screenshot": {
        const imageBase64 = await page.screenshot({ encoding: "base64" });
        return { text: "Screenshot taken", imageBase64 };
      }
      case "solveCaptcha": {
        const frames = page.frames();
        const challengeFrame = frames.find((f) => f.url().includes("recaptcha") && f.url().includes("bframe"));
        const challengeText = challengeFrame
          ? await challengeFrame.evaluate(() => {
              const el = document.querySelector(".rc-imageselect-desc-no-canonical, .rc-imageselect-desc");
              return el?.textContent?.trim() ?? "";
            }).catch(() => "")
          : "";
        const imageBase64 = await page.screenshot({ encoding: "base64" });
        return {
          text: `CAPTCHA challenge: "${challengeText}". Grid is 4×4 (IDs 0–15, left-to-right top-to-bottom). Call clickCaptchaTile with IDs of matching tiles, then verify=true when done.`,
          imageBase64,
        };
      }
      case "clickCaptchaTile": {
        const ids = args.ids as number[];
        const frames = page.frames();
        const challengeFrame = frames.find((f) => f.url().includes("recaptcha") && f.url().includes("bframe"));
        if (!challengeFrame) throw new Error("reCAPTCHA challenge frame not found");
        for (const id of ids) {
          await challengeFrame.click(`#${id}`).catch(() => {});
          await Bun.sleep(150);
        }
        if (args.verify) {
          await Bun.sleep(400);
          await challengeFrame.click("#recaptcha-verify-button").catch(() => {});
        }
        return { text: `Clicked CAPTCHA tiles [${ids.join(", ")}]${args.verify ? " and submitted" : ""}` };
      }
      case "done": {
        return { text: `DONE: ${args.summary as string}` };
      }
      default:
        return { text: `Unknown tool: ${name}` };
    }
  } catch (err: unknown) {
    return { text: `Error executing ${name}: ${toMessage(err)}` };
  }
}
