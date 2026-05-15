// src/index.ts
import { loadConfig } from "@/config/index.ts";
loadConfig();
import { render } from "ink";
import { createElement } from "react";
import { BrowserManager } from "@/browser/manager.ts";
import { FallbackClient } from "@/ai/fallback.ts";
import { runAgentLoop } from "@/agent/loop.ts";
import { store } from "@/ui/store.ts";
import { App } from "@/ui/app.tsx";
import { log, initLog, writeLog } from "@/utils/logger.ts";
import { toMessage } from "@/utils/errors.ts";
import { speak, stopSpeak } from "@/utils/tts.ts";
import { compactNum } from "@/utils/format.ts";

function parseKeys(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const keys = raw.split(",").map((k) => k.trim()).filter(Boolean);
  return keys.length ? keys : undefined;
}

// ── Config ────────────────────────────────────────────────
const ollamaHost = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const ollamaModel = process.env.OLLAMA_MODEL ?? "minimax-m2.5";
const supportsVision = process.env.VISION === "true";
const supportsThinking = process.env.THINKING === "true";
const headless = process.env.HEADLESS === "true";
const isCloud = !ollamaHost.includes("localhost") && !ollamaHost.includes("127.0.0.1");

const ollamaKeys = parseKeys(process.env.OLLAMA_API_KEY);
const opencodeKeys = parseKeys(process.env.OPENCODE_API_KEY);
const openrouterKeys = parseKeys(process.env.OPENROUTER_API_KEY);

// ── Input channels ────────────────────────────────────────
// Two independent waiters: follow-up (between tasks) and captcha (mid-task).
// handleSubmit routes user input based on which waiter is active and the captcha flag.
let followUpResolve: ((val: string) => void) | null = null;
let captchaResolve: (() => void) | null = null;

function waitForFollowUp(): Promise<string> {
  return new Promise((resolve) => { followUpResolve = resolve; });
}

function waitForCaptcha(): Promise<void> {
  store.setCaptchaPending(true);
  return new Promise((resolve) => {
    captchaResolve = () => {
      store.setCaptchaPending(false);
      resolve();
    };
  });
}

function handleSubmit(text: string): void {
  if (store.captchaPending) {
    if (text === "") {
      const r = captchaResolve;
      captchaResolve = null;
      r?.();
    } else {
      store.enqueue(text);
    }
    return;
  }
  if (followUpResolve) {
    const r = followUpResolve;
    followUpResolve = null;
    r(text);
    return;
  }
  store.enqueue(text);
}

// ── Interrupt ─────────────────────────────────────────────
let activeController = new AbortController();
function handleInterrupt(): void {
  activeController.abort();
  // Resolve any pending waiter with empty string so the loop unblocks.
  if (followUpResolve) { const r = followUpResolve; followUpResolve = null; r(""); }
  if (captchaResolve) { const r = captchaResolve; captchaResolve = null; r(); }
  else if (store.captchaPending) store.setCaptchaPending(false);
}

// ── Browser + AI ──────────────────────────────────────────
const browser = new BrowserManager();
const ai = new FallbackClient({
  ollama: {
    apiKeys: ollamaKeys,
    host: ollamaHost,
    model: ollamaModel,
    supportsVision,
    thinking: supportsThinking,
  },
  opencode: {
    model: process.env.OPENCODE_MODEL,
    baseUrl: process.env.OPENCODE_HOST,
    apiKeys: opencodeKeys,
  },
  openrouter: {
    model: process.env.OPENROUTER_MODEL,
    apiKeys: openrouterKeys,
    siteUrl: process.env.OPENROUTER_SITE_URL,
    siteName: process.env.OPENROUTER_SITE_NAME,
  },
});

// ── File log ──────────────────────────────────────────────
initLog();
process.on("uncaughtException", (err) => {
  writeLog("ERROR", `uncaughtException: ${err.message}\n${err.stack ?? ""}`);
});
process.on("unhandledRejection", (reason) => {
  writeLog("ERROR", `unhandledRejection: ${reason}`);
});

// ── Boot status ───────────────────────────────────────────
store.setStatus({ supportsVision, supportsThinking });
log.brand("Naonw");
if (openrouterKeys?.length) {
  log.provider("openrouter", process.env.OPENROUTER_MODEL ?? "openrouter/owl-alpha", false, openrouterKeys.length);
}
log.provider("ollama", ollamaModel, isCloud, ollamaKeys?.length ?? 0);
if (opencodeKeys?.length) {
  log.provider("opencode", process.env.OPENCODE_MODEL ?? "minimax-m2.5", false, opencodeKeys.length);
}
if (supportsVision || supportsThinking) {
  log.info(`vision ${supportsVision ? "●" : "○"}  think ${supportsThinking ? "●" : "○"}`);
}

// ── Pre-flight checks ─────────────────────────────────────
// Validate AI provider config BEFORE Ink takes over the terminal so the user
// sees a plain stderr message rather than a crash inside the alternate screen.
{
  const preflightErr = await ai.validate();
  if (preflightErr !== null) {
    process.stderr.write(`\nConfig error: ${preflightErr}\n\n`);
    process.exit(1);
  }
}

// ── Terminal setup ────────────────────────────────────────
// Disable ALL mouse modes (clears any leftover state from crashed sessions)
// then hide cursor. No mouse mode = text selection works natively.
process.stdout.write("\x1B[?1000l\x1B[?1002l\x1B[?1003l\x1B[?1006l\x1B[?1007l\x1B[?25l");
const restoreTerminal = () => process.stdout.write("\x1B[?25h");
process.on("exit", restoreTerminal);
process.on("exit", stopSpeak);
process.on("SIGTERM", () => { restoreTerminal(); process.exit(0); });
process.on("SIGINT", () => { process.exit(130); });

// ── Render TUI ────────────────────────────────────────────
// alternateScreen: Ink manages \x1B[?1049h enter/exit natively
render(createElement(App, { onSubmit: handleSubmit, onInterrupt: handleInterrupt }), { alternateScreen: true, exitOnCtrlC: false, patchConsole: true, maxFps: 24, kittyKeyboard: { flags: ["disambiguateEscapeCodes"] } });

// ── Agent loop (outside React) ────────────────────────────
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

try {
  // Get initial task: CLI arg, then queue, then wait for user.
  let displayPrompt = process.argv.slice(2).join(" ").trim();
  if (!displayPrompt) {
    const fromQueue = store.dequeue();
    if (fromQueue) {
      displayPrompt = fromQueue.prompt;
    } else {
      store.setStatus({ promptLabel: "Task" });
      displayPrompt = await waitForFollowUp();
      while (!displayPrompt) displayPrompt = await waitForFollowUp();
    }
  }

  let currentPrompt = displayPrompt;
  let lastSummary = "";

  while (true) {
    activeController = new AbortController();
    store.setStatus({ promptLabel: "…running" });
    log.agent(displayPrompt);

    let result;
    try {
      result = await runAgentLoop(browser, headless, ai, currentPrompt, activeController.signal, waitForFollowUp, waitForCaptcha);
    } catch (err: unknown) {
      const msg = toMessage(err);
      log.error(`Agent loop crashed — ${msg}`);
      result = { success: false, summary: `Crashed: ${msg}` };
    }

    store.setStatus({ agentStatus: result.success ? "done" : "interrupted" });
    const elapsedMs = Date.now() - store.status.agentStartTime;
    const elapsedSec = Math.floor(elapsedMs / 1000);
    const elapsedStr = elapsedSec >= 60
      ? `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`
      : `${elapsedSec}s`;

    const { tokensIn, tokensOut, iteration } = store.status;
    const tokenStr = `${compactNum(tokensIn)} in → ${compactNum(tokensOut)} out (${compactNum(tokensIn + tokensOut)} total)`;
    const iterStr = `${iteration} iter${iteration !== 1 ? "s" : ""}`;
    if (result.success) {
      log.success(result.summary);
      lastSummary = result.summary;
      if (process.env.TTS !== "false") speak(result.summary, result.lang).catch(() => {});
    } else {
      log.fail(result.summary);
      lastSummary = "";
    }
    log.info(`⁂ Worked for ${elapsedStr} with ${iterStr} · ${tokenStr}`);

    if (await isYouTubePlaying()) {
      log.info("YouTube video playing — browser stays open.");
    }

    // Pick next prompt: queue first, then user input.
    const fromQueue = store.dequeue();
    let next: string;
    if (fromQueue) {
      next = fromQueue.prompt;
    } else {
      store.setStatus({ promptLabel: "Follow-up (Ctrl+C to exit)" });
      next = await waitForFollowUp();
      while (!next) next = await waitForFollowUp();
    }

    displayPrompt = next;
    currentPrompt = lastSummary
      ? `Previous task result:\n${lastSummary}\n\nFollow-up: ${next}`
      : next;
  }
} catch (err: unknown) {
  log.error(toMessage(err));
  process.exit(1);
} finally {
  await browser.close();
  await ai.close();
  process.exit(0);
}
