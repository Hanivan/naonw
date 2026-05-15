import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_MAP: Record<string, string> = {
  openrouterApiKey:        "OPENROUTER_API_KEY",
  openrouterModel:         "OPENROUTER_MODEL",
  openrouterSiteUrl:       "OPENROUTER_SITE_URL",
  openrouterSiteName:      "OPENROUTER_SITE_NAME",
  ollamaHost:              "OLLAMA_HOST",
  ollamaApiKey:            "OLLAMA_API_KEY",
  ollamaModel:             "OLLAMA_MODEL",
  opencodeApiKey:          "OPENCODE_API_KEY",
  opencodeModel:           "OPENCODE_MODEL",
  opencodeHost:            "OPENCODE_HOST",
  geminiApiKey:            "GEMINI_API_KEY",
  headless:                "HEADLESS",
  cdpUrl:                  "NAONW_CDP_URL",
  vision:                  "VISION",
  thinking:                "THINKING",
  tts:                     "TTS",
  debug:                   "DEBUG",
  logType:                 "LOG_TYPE",
  proxy:                   "PROXY",
  fingerprint:             "FINGERPRINT",
  cloakbrowserAutoUpdate:  "CLOAKBROWSER_AUTO_UPDATE",
  logFile:                 "LOG_FILE",
};

function parseJsonc(text: string): Record<string, unknown> {
  const stripped = text
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  return JSON.parse(stripped);
}

function readJsonc(path: string): Record<string, unknown> | null {
  try {
    return parseJsonc(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function loadConfig(): void {
  const global  = readJsonc(join(homedir(), ".config", "naonw", "config.jsonc")) ?? {};
  const project = readJsonc(join(process.cwd(), ".config", "naonw.jsonc")) ?? {};
  const merged  = { ...global, ...project };

  for (const [key, envVar] of Object.entries(CONFIG_MAP)) {
    if (key in merged && !(envVar in process.env)) {
      const val = merged[key];
      if (val !== null && val !== undefined) {
        process.env[envVar] = String(val);
      }
    }
  }
}
