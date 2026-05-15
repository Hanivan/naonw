import { speakGemini } from "@/utils/gemini-tts.ts";
import { readFileSync } from "node:fs";
import { log } from "./logger";

function detectBackend(): "sapi" | "say" | "espeak-ng" | "spd-say" | "none" {
  if (process.platform === "darwin") return "say";
  if (process.platform === "win32") return "sapi";
  if (process.platform === "linux") {
    try {
      const ver = readFileSync("/proc/version", "utf8").toLowerCase();
      if (ver.includes("microsoft") || ver.includes("wsl")) return "sapi";
    } catch {}
    try {
      Bun.spawnSync(["espeak-ng", "--version"]);
      return "espeak-ng";
    } catch {}
    try {
      Bun.spawnSync(["spd-say", "--version"]);
      return "spd-say";
    } catch {}
  }
  return "none";
}

const BACKEND = detectBackend();

let lastProc: ReturnType<typeof Bun.spawn> | null = null;

// Encode a PowerShell script as UTF-16LE base64 for -EncodedCommand.
// Avoids shell escaping issues and works identically from WSL and Win32.
function encodePS(script: string): string {
  const bytes = new Uint8Array(script.length * 2);
  for (let i = 0; i < script.length; i++) {
    const c = script.charCodeAt(i);
    bytes[i * 2] = c & 0xff;
    bytes[i * 2 + 1] = (c >> 8) & 0xff;
  }
  return Buffer.from(bytes).toString("base64");
}

const PS_PREAMBLE = `$ProgressPreference='SilentlyContinue'`;

const WINRT_HELPER = `
$g=([System.WindowsRuntimeSystemExtensions].GetMethods()|Where-Object{$_.Name-eq'AsTask'-and$_.GetParameters().Count-eq1-and$_.GetParameters()[0].ParameterType.Name-eq'IAsyncOperation\`1'})[0]
function Aw($op,$t){$tk=$g.MakeGenericMethod($t).Invoke($null,@($op));$tk.Wait(-1)|Out-Null;$tk.Result}
`.trim();

export async function listVoices(): Promise<string[]> {
  if (BACKEND !== "sapi") return [];
  const script = `
${PS_PREAMBLE}
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Media.SpeechSynthesis.SpeechSynthesizer,Windows.Media.SpeechSynthesis,ContentType=WindowsRuntime]::AllVoices | ForEach-Object { $_.DisplayName + ' [' + $_.Language + ']' }
`.trim();
  const proc = Bun.spawnSync([
    "powershell.exe",
    "-NoProfile",
    "-EncodedCommand",
    encodePS(script),
  ]);
  return proc.stdout
    .toString()
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export async function speakLocal(text: string, lang = "en"): Promise<void> {
  if (!text.trim() || BACKEND === "none") return;
  lastProc?.kill();
  lastProc = null;

  let proc: ReturnType<typeof Bun.spawn>;

  if (BACKEND === "sapi") {
    const langPrefix = lang === "id" ? "id-" : lang === "ja" ? "ja-" : "en-";
    const escaped = text.replace(/'/g, "''");
    const script = `
${PS_PREAMBLE}
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Speech
${WINRT_HELPER}
$s=[Windows.Media.SpeechSynthesis.SpeechSynthesizer,Windows.Media.SpeechSynthesis,ContentType=WindowsRuntime]::new()
$v=[Windows.Media.SpeechSynthesis.SpeechSynthesizer,Windows.Media.SpeechSynthesis,ContentType=WindowsRuntime]::AllVoices|Where-Object{$_.Language-like'${langPrefix}*'}|Select-Object -First 1
if($v){$s.Voice=$v}
$st=Aw ($s.SynthesizeTextToStreamAsync('${escaped}')) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
$tmp=[System.IO.Path]::ChangeExtension([System.IO.Path]::GetTempFileName(),'.wav')
$r=[Windows.Storage.Streams.DataReader,Windows.Storage,ContentType=WindowsRuntime]::new($st)
$null=Aw ($r.LoadAsync([uint32]$st.Size)) ([uint32])
$b=New-Object byte[] $st.Size;$r.ReadBytes($b)
[System.IO.File]::WriteAllBytes($tmp,$b)
(New-Object System.Media.SoundPlayer $tmp).PlaySync()
Remove-Item $tmp -Force -ErrorAction SilentlyContinue
`.trim();
    proc = Bun.spawn([
      "powershell.exe",
      "-NoProfile",
      "-EncodedCommand",
      encodePS(script),
    ]);
  } else if (BACKEND === "say") {
    proc = Bun.spawn(["say", text]);
  } else if (BACKEND === "espeak-ng") {
    proc = Bun.spawn(["espeak-ng", "-v", lang === "id" ? "id" : "en", text]);
  } else {
    proc = Bun.spawn(["spd-say", "--wait", text]);
  }

  lastProc = proc;
  await proc.exited;
  lastProc = null;
}

export async function speak(text: string, lang = "en"): Promise<void> {
  log.debug(
    JSON.stringify({
      text: text.slice(0, 10),
      lang,
    }),
  );
  if (process.env["GEMINI_API_KEY"]) {
    return speakGemini(text);
  }
  return speakLocal(text, lang);
}

export function stopSpeak(): void {
  lastProc?.kill();
  lastProc = null;
}
