import type { Page } from "puppeteer";
import type { ToolResult } from "./types.ts";
import { toMessage } from "@/utils/errors.ts";
import { navigate, scroll, wait } from "./navigation.ts";
import { click, typeText, selectOption, typeAndSelect } from "./interaction.ts";
import { solveCaptcha, clickCaptchaTile } from "./captcha.ts";
import { screenshot, done } from "./capture.ts";

const handlers: Record<string, (page: Page, args: Record<string, unknown>) => Promise<ToolResult>> = {
  navigate,
  click,
  type: typeText,
  typeAndSelect,
  select: selectOption,
  scroll,
  wait,
  screenshot,
  solveCaptcha,
  clickCaptchaTile,
  done,
};

export async function executeTool(
  page: Page,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const handler = handlers[name];
  if (!handler) return { text: `Unknown tool: ${name}` };
  try {
    return await handler(page, args);
  } catch (err: unknown) {
    return { text: `Error executing ${name}: ${toMessage(err)}` };
  }
}
