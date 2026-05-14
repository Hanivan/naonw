// src/agent/tools/navigation.ts
import type { Page } from "puppeteer-core";
import type { ToolResult } from "./types.ts";

export async function navigate(page: Page, args: Record<string, unknown>): Promise<ToolResult> {
  await page.goto(args.url as string, { waitUntil: "load", timeout: 30000 });
  return { text: `Navigated to ${page.url()}` };
}

export async function wait(_page: Page, args: Record<string, unknown>): Promise<ToolResult> {
  await Bun.sleep(args.ms as number);
  return { text: `Waited ${args.ms as number}ms` };
}
