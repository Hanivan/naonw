// src/agent/tools/execute.ts
import type { Page } from "puppeteer-core";
import type { ToolResult } from "./types.ts";
import type { RefCache } from "@/browser/snapshot.ts";
import { toMessage } from "@/utils/errors.ts";
import { navigate as doNavigate, wait as doWait, back as doBack, forward as doForward } from "./navigation.ts";
import { click, typeText, selectOption, typeAndSelect, scroll, pressKey, hover, drag, evaluate, fill, UnknownRefError } from "./interaction.ts";
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
  back: (p) => doBack(p),
  forward: (p) => doForward(p),
  scroll: (p, a) => scroll(p, a),
  key: (p, a) => pressKey(p, a),
  hover: (p, a) => hover(p, a),
  drag: (p, a) => drag(p, a),
  evaluate: (p, a) => evaluate(p, a),
  fill: (p, a) => fill(p, a),
  screenshot: (p) => screenshot(p),
  solveCaptcha: (p) => solveCaptcha(p),
  clickCaptchaTile: (p, a) => clickCaptchaTile(p, a),
  done: (p, a) => done(p, a),
  // Signal-only: loop handles actual close using result.closeAction
  closePage:    async () => ({ text: "Page closed",    closeAction: "page"    as const }),
  closeBrowser: async () => ({ text: "Browser closed", closeAction: "browser" as const }),
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
