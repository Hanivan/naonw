import { appendFileSync, writeFileSync } from "node:fs";
import { store, type ProviderData } from "@/ui/store.ts";

let activeGroupId: string | null = null;
let groupCounter = 0;

const LOG_FILE = process.env.LOG_FILE ?? "logs/run.log";
const AI_LOG_FILE = process.env.AI_LOG_FILE ?? "logs/ai-context.log";

function ts(): string {
  return new Date().toISOString().slice(5, 23).replace("T", " ");
}

export function timestamp(): string {
  return ts();
}

function writeFile(level: string, msg: string): void {
  try {
    appendFileSync(LOG_FILE, `${ts()} [${level.padEnd(7)}] ${msg}\n`);
  } catch {}
}

export function initLog(): void {
  try {
    const ttsOn = process.env.TTS !== "false";
    const tts = !ttsOn ? "tts=off" : process.env["GEMINI_API_KEY"] ? "tts=gemini" : "tts=local";
    writeFileSync(LOG_FILE, `=== Naonw ${new Date().toISOString()} · ${tts} ===\n`);
    writeFileSync(AI_LOG_FILE, `=== Naonw AI context ${new Date().toISOString()} ===\n`);
  } catch {}
}

/**
 * Append a labelled entry to the dedicated AI-context log (logs/ai-context.log).
 * Use this for everything the agent feeds into / receives from the LLM:
 * SYSTEM, USER, TASK, SNAPSHOT, TOOL_RESULT, IMAGE, RESPONSE, etc.
 */
export function logAI(label: string, content: string): void {
  try {
    appendFileSync(AI_LOG_FILE, `\n──── ${ts()} ${label} ────\n${content}\n`);
  } catch {}
}

export { writeFile as writeLog };

export const log = {
  brand(_msg: string): void {},
  provider(name: string, model: string, cloud: boolean, keys: number): void {
    store.addProvider({ name, model, cloud, keys });
    writeFile("PROVIDER", `${name} ${model}${cloud ? " cloud" : ""}  ${keys} key${keys !== 1 ? "s" : ""}`);
  },
  info(msg: string): void {
    store.pushLog({ level: "INFO", msg, timestamp: ts(), groupId: activeGroupId ?? undefined });
    writeFile("INFO", msg);
  },
  tool(name: string, args: Record<string, unknown>, provider?: string, tag?: string): void {
    const argsStr = Object.keys(args).length ? ` ${JSON.stringify(args)}` : "";
    const provStr = provider ? `[${provider}] ` : "";
    const tagStr = tag ? ` ${tag}` : "";
    const msg = `${provStr}${name}${tagStr}${argsStr}`;
    store.pushLog({ level: "TOOL", msg, timestamp: ts(), groupId: activeGroupId ?? undefined });
    writeFile("TOOL", msg);
  },
  result(msg: string): void {
    store.pushLog({ level: "RESULT", msg, timestamp: ts(), groupId: activeGroupId ?? undefined });
    writeFile("RESULT", msg);
  },
  warn(msg: string): void {
    store.pushLog({ level: "WARN", msg, timestamp: ts(), groupId: activeGroupId ?? undefined });
    writeFile("WARN", msg);
  },
  error(msg: string): void {
    store.pushLog({ level: "ERROR", msg, timestamp: ts() });
    writeFile("ERROR", msg);
  },
  captcha(msg: string): void {
    store.pushLog({ level: "CAPTCHA", msg, timestamp: ts() });
    writeFile("CAPTCHA", msg);
  },
  agent(msg: string): void {
    groupCounter += 1;
    activeGroupId = `g${groupCounter}`;
    store.pushLog({ level: "AGENT", msg, timestamp: ts(), groupId: activeGroupId });
    writeFile("AGENT", msg);
  },
  think(msg: string): void {
    store.pushLog({ level: "THINK", msg, timestamp: ts(), groupId: activeGroupId ?? undefined });
    writeFile("THINK", msg);
  },
  element(detail: string, html: string): void {
    store.pushLog({ level: "ELEMENT", msg: `${detail}  ${html}`, timestamp: ts() });
  },
  debug(msg: string): void {
    if (process.env.DEBUG) {
      store.pushLog({ level: "DEBUG", msg, timestamp: ts() });
      writeFile("DEBUG", msg);
    }
  },
  stream(chunk: string): void {
    store.appendStream(chunk, activeGroupId ?? undefined);
  },
  token(pin: number, pout: number): void {
    store.setStatus({
      tokensIn: store.status.tokensIn + pin,
      tokensOut: store.status.tokensOut + pout,
    });
  },
  success(msg: string): void {
    activeGroupId = null;
    store.pushLog({ level: "DONE", msg, timestamp: ts() });
    writeFile("DONE", msg);
  },
  fail(msg: string): void {
    activeGroupId = null;
    store.pushLog({ level: "FAIL", msg, timestamp: ts() });
    writeFile("FAIL", msg);
  },
};
