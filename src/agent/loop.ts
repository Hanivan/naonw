import type { Page } from "puppeteer";
import type { AIClient } from "@/ai/client.ts";
import type { BrowserManager } from "@/browser/manager.ts";
import { buildSystemPrompt, buildDOMContext } from "@/ai/prompt.ts";
import { parseDOM, detectCaptcha } from "@/browser/dom-parser.ts";
import { toolDefinitions } from "@/agent/tools/definitions.ts";
import { executeTool } from "@/agent/tools/execute.ts";
import { log } from "@/utils/logger.ts";
import { waitForEnter } from "@/utils/prompt.ts";

const MAX_ITERATIONS = 20;
const MAX_SAME_URL = 3;
const MAX_CONSECUTIVE_SCROLLS = 3;

export interface AgentResult {
  success: boolean;
  summary: string;
}

const BROWSER_TOOLS = new Set(["navigate", "click", "type", "typeAndSelect", "select", "scroll", "wait", "screenshot", "solveCaptcha", "clickCaptchaTile"]);

export async function runAgentLoop(
  browser: BrowserManager,
  headless: boolean,
  ai: AIClient,
  userPrompt: string,
  signal?: AbortSignal,
): Promise<AgentResult> {
  let page: Page | null = browser.isLaunched() ? browser.getPage() : null;

  async function ensurePage(): Promise<Page> {
    if (!page) {
      log.info("Launching browser...");
      page = await browser.launch(headless);
    }
    return page;
  }
  ai.clearHistory();
  const supportsVision = process.env.VISION === "true";
  const activeTools = supportsVision ? toolDefinitions : toolDefinitions.filter((t) => t.name !== "screenshot");
  ai.addSystem(buildSystemPrompt(supportsVision));
  ai.addUser(userPrompt);

  const PROGRESS_ACTIONS = new Set(["click", "type", "typeAndSelect", "select", "navigate", "solveCaptcha", "clickCaptchaTile"]);

  let lastUrl = "";
  let sameUrlCount = 0;
  let consecutiveScrolls = 0;
  let lastToolAction = "";
  let madeProgress = false;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (signal?.aborted) {
      log.warn("Agent interrupted — stopping loop");
      break;
    }

    if (page && await detectCaptcha(page)) {
      if (supportsVision) {
        log.captcha("CAPTCHA detected — injecting solveCaptcha hint for AI");
        ai.addUser("CAPTCHA is visible. Call solveCaptcha() to get a screenshot and challenge text, then clickCaptchaTile() to select matching tiles.");
      } else {
        log.captcha("Solve it in the browser, then press Enter to continue...");
        await waitForEnter();
        log.captcha("Resuming...");
      }
    }

    const dom = page ? await parseDOM(page) : null;
    if (dom) {
      log.debug(`DOM [${dom.url}] — ${dom.elements.length} elements:\n${dom.elements.map((e) => `  ${e.inModal ? "[MODAL] " : ""}${e.tag}${e.type ? `[${e.type}]` : ""} ${e.selector}${e.text ? ` "${e.text}"` : ""}${e.href ? ` → ${e.href}` : ""}`).join("\n")}`);

      if (dom.url === lastUrl && !madeProgress) {
        sameUrlCount++;
      } else {
        lastUrl = dom.url;
        sameUrlCount = 0;
      }

      const modalEls = dom.elements.filter((e) => e.inModal);
      if (modalEls.length) {
        log.warn(`Dialog/modal detected — ${modalEls.length} modal element(s)`);
        for (const e of modalEls) {
          const detail = [e.tag, e.type && `[${e.type}]`, e.label && `"${e.label}"`, e.text && `· ${e.text}`, e.href && `→ ${e.href}`].filter(Boolean).join(" ");
          log.element(`M! ${detail}`, e.html ?? "");
        }
      }

      let domContext = buildDOMContext(dom);

      if (sameUrlCount >= MAX_SAME_URL) {
        log.warn(`Stuck on ${dom.url} for ${sameUrlCount} iterations — forcing break`);
        const typeable = dom.elements.find((e) =>
          e.tag === "textarea" || (e.tag === "input" && !["submit", "button", "checkbox", "radio"].includes(e.type ?? ""))
        );
        const stuckHint = typeable
          ? `⚠️ STUCK on ${dom.url}. STOP navigating/scrolling. Read PAGE TEXT — if answer is there call done() NOW. Otherwise type into "${typeable.selector}" using type("${typeable.selector}", "query", true)`
          : `⚠️ STUCK on ${dom.url}. Read PAGE TEXT. If answer is there → done() immediately. If not → navigate("https://www.google.com/search?q=<query>")`;
        domContext = stuckHint + "\n\n" + domContext;
        sameUrlCount = 0;
      }

      log.debug(`PAGE STATE:\n${domContext}`);
      ai.addUser(domContext);
    }

    madeProgress = false;

    log.info("Waiting for AI...");
    const response = await ai.chat(activeTools);

    const modalEls = dom?.elements.filter((e) => e.inModal) ?? [];
    const modalTag = modalEls.length
      ? `[modal:${modalEls.find((e) => e.label)?.label ?? modalEls[0]?.text?.slice(0, 20) ?? `${modalEls.length}el`}]`
      : "";
    const provTag = `[${response.provider}]`;
    const agentPrefix = `${provTag}${modalTag}`;

    if (!response.streamed) {
      if (response.thinking) log.think(response.thinking);
      if (response.content) log.agent(`${agentPrefix} AI: ${response.content}`);
    }

    if (!response.content && !response.toolCalls.length) {
      const fallback = response.thinking?.trim();
      if (fallback) {
        log.warn("AI returned only thinking — model may not support tools. Treating as text response.");
        log.agent(`${agentPrefix} AI (thinking): ${fallback}`);
        response.content = fallback;
      } else {
        log.warn("AI returned empty response — model may not support tool calling with this model");
      }
    }

    if (response.content) {
      ai.addAssistant(response.content);
    }

    if (response.toolCalls.length > 0) {
      log.agent(`${agentPrefix} AI → ${response.toolCalls.map((tc) => tc.name).join(", ")}`);
    }

    if (response.toolCalls.length === 0) {
      if (response.content) {
        log.warn("AI returned text without tool call — reminding to use tools");
        const typeable = dom?.elements.find((e) =>
          e.tag === "textarea" || (e.tag === "input" && !["submit", "button", "hidden", "checkbox", "radio"].includes(e.type ?? ""))
        );
        const clickable = dom?.elements.find((e) =>
          e.tag === "button" || e.tag === "a" || (e.tag === "input" && ["submit", "button"].includes(e.type ?? ""))
        );
        const hints: string[] = [];
        if (typeable) hints.push(`To type: type("${typeable.selector}", "your text", true)`);
        if (clickable) hints.push(`To click: click("${clickable.selector}")`);
        const hintStr = hints.length ? `\nAvailable actions on this page:\n${hints.join("\n")}` : "";
        ai.addUser(`STOP writing text. Call a tool NOW.${hintStr}\nIf task is done: done("summary")`);
      }
      continue;
    }

    for (const call of response.toolCalls) {
      const actionKey = `${call.name}:${JSON.stringify(call.arguments)}`;
      if (actionKey === lastToolAction && call.name !== "done") {
        log.warn(`Duplicate action detected: ${call.name} — skipping`);
        ai.addToolResult(call.name, `Skipped: you already did this exact action. Try something different or call done().`);
        continue;
      }
      lastToolAction = actionKey;

      // track consecutive scrolls
      if (call.name === "scroll") {
        consecutiveScrolls++;
        if (consecutiveScrolls > MAX_CONSECUTIVE_SCROLLS) {
          log.warn(`${consecutiveScrolls} consecutive scrolls — forcing stop`);
          ai.addToolResult(call.name, `STOP scrolling. You have scrolled ${consecutiveScrolls} times. Read PAGE TEXT above and call done() with what you found, or navigate to a different page.`);
          consecutiveScrolls = 0;
          continue;
        }
      } else {
        consecutiveScrolls = 0;
      }

      log.tool(call.name, call.arguments);

      if (BROWSER_TOOLS.has(call.name)) page = await ensurePage();
      const result = await executeTool(page!, call.name, call.arguments);
      if (call.name !== "done") log.result(result.text);
      if (PROGRESS_ACTIONS.has(call.name) && !result.text.startsWith("Error")) madeProgress = true;

      ai.addToolResult(call.name, result.text);
      if (result.imageBase64 && supportsVision) {
        ai.addImage(result.imageBase64);
      }

      if (call.name === "done") {
        log.tokenTotal();
        return {
          success: true,
          summary: (call.arguments.summary as string) ?? result.text,
        };
      }
    }
  }

  log.tokenTotal();
  if (signal?.aborted) return { success: false, summary: "Interrupted by user" };
  return { success: false, summary: "Max iterations reached" };
}
