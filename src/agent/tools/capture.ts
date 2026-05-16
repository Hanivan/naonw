import type { Page } from "puppeteer-core";
import type { ToolResult } from "./types.ts";
import { log } from "@/utils/logger.ts";

export async function screenshot(page: Page): Promise<ToolResult> {
  const imageBase64 = await page.screenshot({ encoding: "base64" });
  return { text: "Screenshot taken", imageBase64 };
}

export async function warn(_page: Page, args: Record<string, unknown>): Promise<ToolResult> {
  const msg = (args.message as string | undefined)?.trim() ?? "";
  if (!msg) return { text: "warn() requires a non-empty message" };
  log.warn(`[agent] ${msg}`);
  return {
    text: `Warning surfaced to user: ${msg}`,
    displayText: `warn → ${msg.length > 80 ? msg.slice(0, 80) + "…" : msg}`,
  };
}

export async function done(_page: Page, args: Record<string, unknown>): Promise<ToolResult> {
  return { text: `DONE: ${args.summary as string}`, lang: args.lang as string | undefined };
}
