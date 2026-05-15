// src/index.ts
import { loadConfig } from "@/utils/config.ts";
loadConfig();
import { render } from "ink";
import { createElement } from "react";
import { BrowserManager } from "@/browser/manager.ts";
import { FallbackClient } from "@/ai/fallback-client.ts";
import { runAgentLoop } from "@/agent/loop.ts";
import { store } from "@/ui/store.ts";
import { App } from "@/ui/app.tsx";
import { log, initLog, writeLog } from "@/utils/logger.ts";
import { toMessage } from "@/utils/errors.ts";
import { speak, stopSpeak } from "@/utils/tts.ts";

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

// ── Input channel ─────────────────────────────────────────
// Bridges InputBar (React) → async agent loop (outside React)
let inputResolve: ((val: string) => void) | null = null;
function waitForInput(): Promise<string> {
  return new Promise((resolve) => { inputResolve = resolve; });
}
function handleSubmit(text: string): void {
  inputResolve?.(text);
  inputResolve = null;
}

// ── Interrupt ─────────────────────────────────────────────
let activeController = new AbortController();
function handleInterrupt(): void {
  // log.warn("ESC — stopping...");
  activeController.abort();
  if (inputResolve) { inputResolve(""); inputResolve = null; }
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
  // Get initial task
  let initialPrompt = process.argv.slice(2).join(" ").trim();
  if (!initialPrompt) {
    store.setStatus({ promptLabel: "Task" });
    initialPrompt = await waitForInput();
    if (!initialPrompt) {
      log.error("No task provided. Exiting.");
      process.exit(1);
    }
  }

  let currentPrompt = initialPrompt;
  let displayPrompt = initialPrompt;
  let lastSummary = "";

  while (true) {
    activeController = new AbortController();
    store.setStatus({ promptLabel: "…running" });
    log.agent(displayPrompt);

    const result = await runAgentLoop(browser, headless, ai, currentPrompt, activeController.signal, waitForInput);

    store.setStatus({ agentStatus: result.success ? "done" : "interrupted" });
    const elapsedMs = Date.now() - store.status.agentStartTime;
    const elapsedSec = Math.floor(elapsedMs / 1000);
    const elapsedStr = elapsedSec >= 60
      ? `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`
      : `${elapsedSec}s`;

    const { tokensIn, tokensOut } = store.status;
    const tokenStr = `${tokensIn} in → ${tokensOut} out (${tokensIn + tokensOut} total)`;
    if (result.success) {
      log.success(result.summary);
      lastSummary = result.summary;
      if (process.env.TTS !== "false") speak(result.summary, result.lang).catch(() => {});
    } else {
      log.fail(result.summary);
      lastSummary = "";
    }
    log.info(`⁂ Worked for ${elapsedStr} · ${tokenStr}`);

    if (await isYouTubePlaying()) {
      log.info("YouTube video playing — browser stays open.");
    }

    store.setStatus({ promptLabel: "Follow-up (Ctrl+C to exit)" });
    let followUp = "";
    while (!followUp) followUp = await waitForInput();

    displayPrompt = followUp;
    currentPrompt = lastSummary
      ? `Previous task result:\n${lastSummary}\n\nFollow-up: ${followUp}`
      : followUp;
  }
} catch (err: unknown) {
  log.error(toMessage(err));
  process.exit(1);
} finally {
  await browser.close();
  await ai.close();
  process.exit(0);
}
