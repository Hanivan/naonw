// src/agent/tools/execute.ts
import type { Page } from "puppeteer-core";
import type { ToolResult } from "./types.ts";
import type { RefCache } from "@/browser/snapshot.ts";
import { toMessage } from "@/utils/errors.ts";
import { navigate as doNavigate, wait as doWait } from "./navigation.ts";
import { click, typeText, selectOption, typeAndSelect, UnknownRefError } from "./interaction.ts";
import { solveCaptcha, clickCaptchaTile } from "./captcha.ts";
import { screenshot, done } from "./capture.ts";

type Handler = (page: Page, args: Record<string, unknown>, refCache: RefCache) => Promise<ToolResult>;

const handlers: Record<string, Handler> = {
  navigate: (p, a) => doNavigate(p, a),
  click,
  type: typeText,
  typeAndSelect,
  select: selectOption,
  wait: (p, a) => doWait(p, a),
  screenshot: (p) => screenshot(p),
  solveCaptcha: (p) => solveCaptcha(p),
  clickCaptchaTile: (p, a) => clickCaptchaTile(p, a),
  done: (p, a) => done(p, a),
};

export async function executeTool(
  page: Page,
  name: string,
  args: Record<string, unknown>,
  refCache: RefCache,
): Promise<ToolResult & { isStaleRef?: boolean }> {
  const handler = handlers[name];
  if (!handler) return { text: `Unknown tool: ${name}` };
  try {
    return await handler(page, args, refCache);
  } catch (err: unknown) {
    if (err instanceof UnknownRefError) {
      return { text: err.message, isStaleRef: true };
    }
    return { text: `Error executing ${name}: ${toMessage(err)}` };
  }
}
