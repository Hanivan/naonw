import { createInterface } from "node:readline";
import type { Page } from "puppeteer";
import type { AIClient } from "@/ai/client.ts";
import { buildSystemPrompt, buildDOMContext } from "@/ai/prompt.ts";
import { parseDOM, detectCaptcha } from "@/browser/dom-parser.ts";
import { toolDefinitions, executeTool } from "@/agent/tools.ts";
import { log } from "@/utils/logger.ts";

const MAX_ITERATIONS = 20;
const MAX_SAME_URL = 3;

export interface AgentResult {
  success: boolean;
  summary: string;
}

async function waitForEnter(): Promise<void> {
  return new Promise<void>((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question("", () => { rl.close(); log.captcha("Resuming..."); resolve(); });
  });
}

export async function runAgentLoop(
  page: Page,
  ai: AIClient,
  userPrompt: string,
): Promise<AgentResult> {
  const supportsVision = process.env.OLLAMA_VISION === "true";
  const activeTools = supportsVision ? toolDefinitions : toolDefinitions.filter((t) => t.name !== "screenshot");
  ai.addSystem(buildSystemPrompt(supportsVision));
  ai.addUser(userPrompt);

  let lastUrl = "";
  let sameUrlCount = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (await detectCaptcha(page)) {
      log.captcha("Solve it in the browser, then press Enter to continue...");
      await waitForEnter();
    }

    const dom = await parseDOM(page);
    log.debug(`DOM [${dom.url}] — ${dom.elements.length} elements:\n${dom.elements.map((e) => `  ${e.inModal ? "[MODAL] " : ""}${e.tag}${e.type ? `[${e.type}]` : ""} ${e.selector}${e.text ? ` "${e.text}"` : ""}${e.href ? ` → ${e.href}` : ""}`).join("\n")}`);

    // --- stuck-URL break hint (disabled) ---
    // if (dom.url === lastUrl) {
    //   sameUrlCount++;
    // } else {
    //   lastUrl = dom.url;
    //   sameUrlCount = 0;
    // }
    // if (sameUrlCount >= MAX_SAME_URL) {
    //   log.warn(`Stuck on ${dom.url} for ${sameUrlCount} iterations — injecting break hint`);
    //   const typeable = dom.elements.find((e) =>
    //     e.tag === "textarea" || (e.tag === "input" && !["submit", "button", "checkbox", "radio"].includes(e.type ?? ""))
    //   );
    //   const breakHint = typeable
    //     ? `You are stuck. You are already on ${dom.url}. STOP navigating. Type into "${typeable.selector}" NOW using: type("${typeable.selector}", "your query", true)`
    //     : `You are stuck on ${dom.url}. Try: navigate("https://www.google.com/search?q=<your query>") to search directly.`;
    //   ai.addUser(breakHint);
    //   sameUrlCount = 0;
    // }
    // --- end stuck-URL break hint ---

    if (dom.elements.some((e) => e.inModal)) {
      log.warn("Dialog/modal detected — modal elements surfaced at top of DOM context");
    }

    ai.addUser(buildDOMContext(dom));

    log.info("Waiting for AI...");
    const response = await ai.chat(activeTools);

    if (!response.streamed) {
      if (response.thinking) log.think(response.thinking);
      if (response.content) log.agent(`AI: ${response.content}`);
    }

    // model returned nothing usable — likely doesn't support tools
    if (!response.content && !response.toolCalls.length) {
      const fallback = response.thinking?.trim();
      if (fallback) {
        log.warn("AI returned only thinking — model may not support tools. Treating as text response.");
        log.agent(`AI (thinking): ${fallback}`);
        response.content = fallback;
      } else {
        log.warn("AI returned empty response — model may not support tool calling with this model");
      }
    }

    if (response.content) {
      ai.addAssistant(response.content);
    }

    if (response.toolCalls.length > 0) {
      log.agent(`AI → ${response.toolCalls.map((tc) => tc.name).join(", ")}`);
    }

    if (response.toolCalls.length === 0) {
      if (response.content) {
        log.warn("AI returned text without tool call — reminding to use tools");
        const typeable = dom.elements.find((e) =>
          e.tag === "textarea" || (e.tag === "input" && !["submit", "button", "hidden", "checkbox", "radio"].includes(e.type ?? ""))
        );
        const clickable = dom.elements.find((e) =>
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
      log.tool(call.name, call.arguments);

      const result = await executeTool(page, call.name, call.arguments);
      log.result(result.text);

      ai.addToolResult(call.name, result.text);
      if (result.imageBase64 && supportsVision) {
        ai.addImage(result.imageBase64);
      }

      if (call.name === "done") {
        return {
          success: true,
          summary: (call.arguments.summary as string) ?? result.text,
        };
      }
    }
  }

  return { success: false, summary: "Max iterations reached" };
}
