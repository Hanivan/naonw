import type { Page } from "puppeteer";
import type { ToolResult } from "./types.ts";
import { DEEP_QUERY_SCRIPT } from "@/browser/query.ts";

export async function ensureDeepQuery(page: Page): Promise<void> {
  for (let i = 0; i < 5; i++) {
    try {
      await page.evaluate(DEEP_QUERY_SCRIPT);
      const ok = await page.evaluate(() => typeof (window as unknown as { __deepQuery: unknown }).__deepQuery === "function");
      if (ok) return;
    } catch {
      // page may still be loading — retry
    }
    await Bun.sleep(200);
  }
}

export async function navigate(page: Page, args: Record<string, unknown>): Promise<ToolResult> {
  await page.goto(args.url as string, { waitUntil: "load", timeout: 30000 });
  await ensureDeepQuery(page);
  return { text: `Navigated to ${page.url()}` };
}

export async function scroll(page: Page, args: Record<string, unknown>): Promise<ToolResult> {
  const amount = (args.amount as number) ?? 500;
  const dir = args.direction === "up" ? -amount : amount;
  await page.evaluate((d) => window.scrollBy(0, d as number), dir);
  return { text: `Scrolled ${args.direction as string} by ${amount}px` };
}

export async function wait(_page: Page, args: Record<string, unknown>): Promise<ToolResult> {
  await Bun.sleep(args.ms as number);
  return { text: `Waited ${args.ms as number}ms` };
}
