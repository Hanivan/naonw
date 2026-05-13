import { createInterface } from "node:readline";
import { BrowserManager } from "@/browser/manager.ts";
import { FallbackClient } from "@/ai/fallback-client.ts";
import { runAgentLoop } from "@/agent/loop.ts";
import { log } from "@/utils/logger.ts";
import { toMessage } from "@/utils/errors.ts";

function askPrompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

function parseKeys(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const keys = raw.split(",").map((k) => k.trim()).filter(Boolean);
  return keys.length ? keys : undefined;
}

const ollamaHost = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const ollamaModel = process.env.OLLAMA_MODEL ?? "minimax-m2.5";
const supportsVision = process.env.VISION === "true";
const supportsThinking = process.env.THINKING === "true";
const headless = process.env.HEADLESS === "true";
const isCloud = !ollamaHost.includes("localhost") && !ollamaHost.includes("127.0.0.1");

const ollamaKeys = parseKeys(process.env.OLLAMA_API_KEY);
const opencodeKeys = parseKeys(process.env.OPENCODE_API_KEY);

const openrouterKeys = parseKeys(process.env.OPENROUTER_API_KEY);

const providerChain: string[] = [];
if (openrouterKeys?.length) {
  providerChain.push(`openrouter  ${process.env.OPENROUTER_MODEL ?? "openrouter/owl-alpha"} [${openrouterKeys.length} keys]`);
}
providerChain.push(`ollama      ${ollamaModel} @ ${ollamaHost} ${isCloud ? "(cloud)" : "(local)"} [${ollamaKeys?.length ?? 0} keys]`);
if (opencodeKeys?.length) {
  providerChain.push(`opencode    ${process.env.OPENCODE_MODEL ?? "minimax-m2.5"} @ ${process.env.OPENCODE_HOST ?? "http://127.0.0.1:4096/v1"} [${opencodeKeys.length} keys]`);
}

log.info("─── Configuration ───────────────────────────────");
log.info("  Provider chain (priority order):");
providerChain.forEach((p, i) => log.info(`    ${i + 1}. ${p}`));
log.info(`  Vision   : ${supportsVision ? "enabled" : "disabled"}`);
log.info(`  Thinking : ${supportsThinking ? "enabled (stream)" : "disabled (non-stream)"}`);
log.info(`  Browser  : ${headless ? "headless" : "visible"}`);
log.info("─────────────────────────────────────────────────");

let initialPrompt = process.argv.slice(2).join(" ").trim();
if (!initialPrompt) {
  initialPrompt = await askPrompt("\x1b[90m> Task: \x1b[0m");
  if (!initialPrompt) {
    log.error("No task provided. Exiting.");
    process.exit(1);
  }
}

const browser = new BrowserManager();
const ai = new FallbackClient({
  ollama: {
    apiKeys: parseKeys(process.env.OLLAMA_API_KEY),
    host: ollamaHost,
    model: ollamaModel,
    supportsVision: supportsVision,
    thinking: supportsThinking,
  },
  opencode: {
    model: process.env.OPENCODE_MODEL,
    baseUrl: process.env.OPENCODE_HOST,
    apiKeys: parseKeys(process.env.OPENCODE_API_KEY),
  },
  openrouter: {
    model: process.env.OPENROUTER_MODEL,
    apiKeys: openrouterKeys,
    siteUrl: process.env.OPENROUTER_SITE_URL,
    siteName: process.env.OPENROUTER_SITE_NAME,
  },
});


async function isYouTubePlaying(): Promise<boolean> {
  if (!browser.isLaunched()) return false;
  try {
    const page = browser.getPage();
    if (!page.url().includes("youtube.com/watch")) return false;
    return page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>("video");
      return !!video && !video.paused && !video.ended;
    });
  } catch {
    return false;
  }
}

function runWithInterrupt(prompt: string): Promise<import("@/agent/loop.ts").AgentResult> {
  const controller = new AbortController();
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
  }
  const onData = (data: Buffer) => {
    if (data[0] === 0x1b && data.length === 1) {
      log.warn("ESC — interrupting agent...");
      controller.abort();
    } else if (data[0] === 0x03) {
      process.exit(0);
    }
  };
  process.stdin.on("data", onData);
  return runAgentLoop(browser, headless, ai, prompt, controller.signal).finally(() => {
    process.stdin.removeListener("data", onData);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
  });
}

try {
  let currentPrompt = initialPrompt;
  let lastSummary = "";

  while (true) {
    log.agent(currentPrompt);
    const result = await runWithInterrupt(currentPrompt);

    if (result.success) {
      log.success(result.summary);
      lastSummary = result.summary;
    } else {
      log.fail(result.summary);
      lastSummary = "";
    }

    if (await isYouTubePlaying()) {
      log.info("YouTube video playing — browser stays open.");
    }

    const followUp = await askPrompt("\x1b[90m> Follow-up (or Enter to exit): \x1b[0m");
    if (!followUp) break;
    currentPrompt = lastSummary
      ? `Previous task result:\n${lastSummary}\n\nFollow-up: ${followUp}`
      : followUp;
  }
} catch (err: unknown) {
  log.error(toMessage(err));
} finally {
  await browser.close();
  await ai.close();
}
