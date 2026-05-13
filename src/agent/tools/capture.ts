import type { Page } from "puppeteer";
import type { ToolResult } from "./types.ts";

export async function screenshot(page: Page): Promise<ToolResult> {
  const imageBase64 = await page.screenshot({ encoding: "base64" });
  return { text: "Screenshot taken", imageBase64 };
}

export async function done(_page: Page, args: Record<string, unknown>): Promise<ToolResult> {
  return { text: `DONE: ${args.summary as string}` };
}
