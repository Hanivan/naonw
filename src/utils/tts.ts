import { readFileSync } from "node:fs";

function detectBackend(): "sapi" | "say" | "espeak-ng" | "spd-say" | "none" {
  if (process.platform === "darwin") return "say";
  if (process.platform === "win32") return "sapi";
  if (process.platform === "linux") {
    try {
      const ver = readFileSync("/proc/version", "utf8").toLowerCase();
      if (ver.includes("microsoft") || ver.includes("wsl")) return "sapi";
    } catch {}
    try { Bun.spawnSync(["espeak-ng", "--version"]); return "espeak-ng"; } catch {}
    try { Bun.spawnSync(["spd-say", "--version"]); return "spd-say"; } catch {}
  }
  return "none";
}

const BACKEND = detectBackend();

let lastProc: ReturnType<typeof Bun.spawn> | null = null;

export async function speak(text: string): Promise<void> {
  if (!text.trim() || BACKEND === "none") return;
  lastProc?.kill();
  lastProc = null;
  const escaped = text.replace(/'/g, "''");

  let proc: ReturnType<typeof Bun.spawn>;

  if (BACKEND === "sapi") {
    proc = Bun.spawn([
      "powershell.exe", "-NoProfile", "-c",
      `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Speak('${escaped}')`,
    ]);
  } else if (BACKEND === "say") {
    proc = Bun.spawn(["say", text]);
  } else if (BACKEND === "espeak-ng") {
    proc = Bun.spawn(["espeak-ng", text]);
  } else {
    proc = Bun.spawn(["spd-say", "--wait", text]);
  }

  lastProc = proc;
  await proc.exited;
  lastProc = null;
}
