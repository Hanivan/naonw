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

let initialPrompt = process.argv.slice(2).join(" ").trim();

if (!initialPrompt) {
  initialPrompt = await askPrompt("\x1b[90m> Task: \x1b[0m");
  if (!initialPrompt) {
    log.error("No task provided. Exiting.");
    process.exit(1);
  }
}

const ollamaHost = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const ollamaModel = process.env.OLLAMA_MODEL ?? "qwen3-vl:4b-instruct";
const ollamaVision = process.env.OLLAMA_VISION === "true";
const ollamaThinking = process.env.OLLAMA_THINKING === "true";
const headless = process.env.HEADLESS === "true";
const isCloud = !ollamaHost.includes("localhost") && !ollamaHost.includes("127.0.0.1");

log.info("─── Configuration ───────────────────────────────");
log.info(`  Ollama  : ${ollamaHost} ${isCloud ? "(cloud)" : "(local)"}`);
log.info(`  Model   : ${ollamaModel}`);
log.info(`  Vision  : ${ollamaVision ? "enabled (screenshots attached)" : "disabled (screenshots skipped)"}`);
log.info(`  Thinking: ${ollamaThinking ? "enabled (stream)" : "disabled (non-stream)"}`);
log.info(`  Fallback: ${process.env.OPENCODE_MODEL ?? "anthropic/claude-sonnet-4-5-20250514"}`);
log.info(`  Browser : ${headless ? "headless" : "visible"}`);
log.info("─────────────────────────────────────────────────");

const browser = new BrowserManager();
const ai = new FallbackClient({
  ollama: {
    apiKey: process.env.OLLAMA_API_KEY,
    host: ollamaHost,
    model: ollamaModel,
    supportsVision: ollamaVision,
    thinking: ollamaThinking,
  },
  opencode: {
    model: process.env.OPENCODE_MODEL,
    hostname: process.env.OPENCODE_HOST,
    port: process.env.OPENCODE_PORT ? parseInt(process.env.OPENCODE_PORT, 10) : undefined,
  },
});


async function isYouTubePlaying(page: Awaited<ReturnType<typeof browser.launch>>): Promise<boolean> {
  try {
    if (!page.url().includes("youtube.com/watch")) return false;
    return page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>("video");
      return !!video && !video.paused && !video.ended;
    });
  } catch {
    return false;
  }
}

try {
  log.info("Launching browser...");
  const page = await browser.launch(headless);

  let currentPrompt = initialPrompt;

  while (true) {
    log.agent(currentPrompt);
    const result = await runAgentLoop(page, ai, currentPrompt);

    if (result.success) {
      log.success(result.summary);
    } else {
      log.fail(result.summary);
    }

    if (await isYouTubePlaying(page)) {
      log.info("YouTube video playing — browser stays open.");
    }

    const followUp = await askPrompt("\x1b[90m> Follow-up (or Enter to exit): \x1b[0m");
    if (!followUp) break;
    currentPrompt = followUp;
  }
} catch (err: unknown) {
  log.error(toMessage(err));
} finally {
  await browser.close();
  await ai.close();
}
