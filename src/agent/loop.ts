// src/agent/loop.ts
import type { Page } from "puppeteer-core";
import type { AIClient } from "@/ai/client.ts";
import type { BrowserManager } from "@/browser/manager.ts";
import type { SnapshotNode, RefCache } from "@/browser/snapshot.ts";
import { buildSystemPrompt, buildSnapshotContext } from "@/ai/prompt.ts";
import { takeSnapshot } from "@/browser/snapshot.ts";
import { diffSnapshots } from "@/browser/snapshot-diff.ts";
import { detectCaptcha } from "@/browser/detectors.ts";
import { toolDefinitions } from "@/agent/tools/definitions.ts";
import { executeTool } from "@/agent/tools/execute.ts";
import { log } from "@/utils/logger.ts";
import { waitForEnter } from "@/utils/prompt.ts";
import { store } from "@/ui/store.ts";

const MAX_ITERATIONS = 20;
const MAX_SAME_URL = 3;

export interface AgentResult {
  success: boolean;
  summary: string;
  lang?: string;
}

const BROWSER_TOOLS = new Set(["navigate", "click", "type", "typeAndSelect", "select", "wait", "screenshot", "solveCaptcha", "clickCaptchaTile"]);
const PROGRESS_ACTIONS = new Set(["click", "type", "typeAndSelect", "select", "navigate", "solveCaptcha", "clickCaptchaTile"]);

export async function runAgentLoop(
  browser: BrowserManager,
  headless: boolean,
  ai: AIClient,
  userPrompt: string,
  signal?: AbortSignal,
  waitForInput?: () => Promise<string>,
): Promise<AgentResult> {
  let currentHeadless = headless;
  let page: Page | null = browser.isLaunched() ? browser.getPage() : null;

  async function ensurePage(): Promise<Page> {
    if (!page) {
      log.info("Launching browser...");
      page = await browser.launch(currentHeadless);
      store.setStatus({ browserOpen: true });
    }
    return page;
  }

  ai.clearHistory();
  store.setStatus({
    agentStatus: "idle",
    iteration: 0,
    maxIterations: MAX_ITERATIONS,
    tokensIn: 0,
    tokensOut: 0,
    currentUrl: "",
    agentStartTime: Date.now(),
  });

  const supportsVision = process.env.VISION === "true";
  const activeTools = supportsVision ? toolDefinitions : toolDefinitions.filter((t) => t.name !== "screenshot");
  ai.addSystem(buildSystemPrompt(supportsVision));
  ai.addUser(userPrompt);

  let lastUrl = "";
  let sameUrlCount = 0;
  let lastToolAction = "";
  let madeProgress = false;
  let prevNodes: SnapshotNode[] = [];
  let refCache: RefCache = new Map();
  let needFullSnapshot = true;

  const abortRace = signal
    ? new Promise<never>((_, reject) => {
        if (signal.aborted) reject(new DOMException("Aborted", "AbortError"));
        else signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      })
    : null;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (signal?.aborted) {
      log.warn("Agent interrupted — stopping loop");
      break;
    }
    store.setStatus({ iteration: i + 1, currentUrl: page?.url() ?? "" });

    if (page && await detectCaptcha(page)) {
      if (supportsVision) {
        log.captcha("CAPTCHA detected — injecting solveCaptcha hint for AI");
        ai.addUser("CAPTCHA is visible. Call solveCaptcha() to get a screenshot and challenge text, then clickCaptchaTile() to select matching tiles.");
      } else {
        if (currentHeadless) {
          log.captcha("CAPTCHA detected — relaunching browser as visible...");
          page = await browser.relaunch(false);
          currentHeadless = false;
          needFullSnapshot = true;
        }
        log.captcha("Solve it in the browser, then press Enter to continue...");
        if (waitForInput) await waitForInput();
        else await waitForEnter();
        if (currentHeadless !== headless) {
          log.captcha(`Switching back to ${headless ? "headless" : "visible"}...`);
          page = await browser.relaunch(headless);
          currentHeadless = headless;
        }
        log.captcha("Resuming...");
        needFullSnapshot = true;
      }
    }

    if (page) {
      const currentUrl = page.url();
      if (currentUrl === lastUrl && !madeProgress) {
        sameUrlCount++;
      } else {
        lastUrl = currentUrl;
        sameUrlCount = 0;
      }

      let snapshotContext: string;

      if (needFullSnapshot) {
        const snap = await takeSnapshot(page);
        prevNodes = snap.nodes;
        refCache = snap.refCache;
        needFullSnapshot = false;
        snapshotContext = buildSnapshotContext(snap.compact, snap.url, snap.title, sameUrlCount >= MAX_SAME_URL ? prevNodes : null);
        if (sameUrlCount >= MAX_SAME_URL) sameUrlCount = 0;
      } else {
        const next = await takeSnapshot(page);
        const diff = diffSnapshots(prevNodes, next.nodes, next.url, next.title);
        prevNodes = next.nodes;
        refCache = next.refCache;
        snapshotContext = diff.compact || "(no changes)";
      }

      log.debug(`PAGE STATE:\n${snapshotContext}`);
      ai.addUser(snapshotContext);
    }

    madeProgress = false;

    // log.info("Waiting for AI...");
    store.setStatus({ agentStatus: "thinking" });
    let response;
    try {
      response = await (abortRace ? Promise.race([ai.chat(activeTools), abortRace]) : ai.chat(activeTools));
    } catch (e) {
      if (signal?.aborted) break;
      throw e;
    }

    const provTag = `[${response.provider}]`;
    store.setStatus({ provider: response.provider });

    if (!response.streamed) {
      if (response.thinking) log.think(response.thinking);
    }

    if (!response.content && !response.toolCalls.length) {
      const fallback = response.thinking?.trim();
      if (fallback) {
        log.warn("AI returned only thinking — treating as text response.");
        log.agent(`${provTag} AI (thinking): ${fallback}`);
        response.content = fallback;
      } else {
        log.warn("AI returned empty response");
      }
    }

    if (response.content) ai.addAssistant(response.content);

    if (response.toolCalls.length === 0) {
      if (response.content) {
        const typeable = prevNodes.find((n) => n.role === "textbox" || n.role === "searchbox");
        const clickable = prevNodes.find((n) => n.role === "button" || n.role === "link");
        const hints: string[] = [];
        if (typeable) hints.push(`To type: type("${typeable.ref}", "your text", true)`);
        if (clickable) hints.push(`To click: click("${clickable.ref}")`);
        const hintStr = hints.length ? `\nAvailable actions:\n${hints.join("\n")}` : "";
        ai.addUser(`STOP writing text. Call a tool NOW.${hintStr}\nIf task is done: done("summary", "en")`);
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

      if (call.name !== "done") log.tool(call.name, call.arguments, response.provider);

      if (call.name === "closePage") {
        store.setStatus({ agentStatus: "tool" });
        if (page) { await page.close(); page = null; }
        prevNodes = []; refCache = new Map(); needFullSnapshot = true;
        log.result("Page closed");
        ai.addToolResult(call.name, "Page closed");
        continue;
      }

      if (call.name === "closeBrowser") {
        store.setStatus({ agentStatus: "tool" });
        await browser.close();
        page = null;
        prevNodes = []; refCache = new Map(); needFullSnapshot = true;
        store.setStatus({ browserOpen: false });
        log.result("Browser closed");
        ai.addToolResult(call.name, "Browser closed");
        continue;
      }

      if (BROWSER_TOOLS.has(call.name)) page = await ensurePage();
      store.setStatus({ agentStatus: "tool" });

      const result = await executeTool(page!, call.name, call.arguments, refCache);

      if (result.isStaleRef) {
        needFullSnapshot = true;
        ai.addToolResult(call.name, result.text);
        continue;
      }

      if (call.name !== "done") log.result(result.text);
      if (PROGRESS_ACTIONS.has(call.name) && !result.text.startsWith("Error")) madeProgress = true;

      if (call.name === "navigate") needFullSnapshot = true;

      ai.addToolResult(call.name, result.text);
      if (result.imageBase64 && supportsVision) ai.addImage(result.imageBase64);

      if (call.name === "done") {
        const lang = result.lang ?? (call.arguments.lang as string | undefined);
        const toolTag = lang ? `[lang: ${lang}]` : undefined;
        log.tool(call.name, call.arguments, response.provider, toolTag);
        log.tokenTotal();
        return { success: true, summary: (call.arguments.summary as string) ?? result.text, lang };
      }
    }
  }

  log.tokenTotal();
  if (signal?.aborted) return { success: false, summary: "Interrupted by user" };
  return { success: false, summary: "Max iterations reached" };
}
