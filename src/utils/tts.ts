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

export async function listVoices(): Promise<string[]> {
  if (BACKEND !== "sapi") return [];
  const proc = Bun.spawnSync([
    "powershell.exe", "-NoProfile", "-c",
    `Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name + ' [' + $_.VoiceInfo.Culture + ']' }`,
  ]);
  return proc.stdout.toString().trim().split("\n").map((l) => l.trim()).filter(Boolean);
}

export async function speak(text: string, lang = "en"): Promise<void> {
  if (!text.trim() || BACKEND === "none") return;
  lastProc?.kill();
  lastProc = null;
  const escaped = text.replace(/'/g, "''");

  let proc: ReturnType<typeof Bun.spawn>;

  if (BACKEND === "sapi") {
    // Pick a voice matching the BCP-47 prefix; fall back to default if not found
    const culturePrefix = lang === "id" ? "id-" : lang === "ja" ? "ja-" : "en-";
    proc = Bun.spawn([
      "powershell.exe", "-NoProfile", "-c",
      `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture -like '${culturePrefix}*' } | Select-Object -First 1; if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }; $s.Speak('${escaped}')`,
    ]);
  } else if (BACKEND === "say") {
    // macOS: Indonesian → no built-in voice, skip lang selection
    proc = Bun.spawn(["say", text]);
  } else if (BACKEND === "espeak-ng") {
    const espeakLang = lang === "id" ? "id" : "en";
    proc = Bun.spawn(["espeak-ng", "-v", espeakLang, text]);
  } else {
    proc = Bun.spawn(["spd-say", "--wait", text]);
  }

  lastProc = proc;
  await proc.exited;
  lastProc = null;
}
