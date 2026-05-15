import { GoogleGenAI } from "@google/genai";
import { spawn } from "node:child_process";
import { log } from "./logger";

function summarizeGeminiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // Body is JSON appended to message, e.g. ApiError: {"error":{...}}
  const jsonStart = msg.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const body = JSON.parse(msg.slice(jsonStart));
      const e = body?.error;
      if (e) {
        const retry = e.details?.find?.((d: any) => d?.retryDelay)?.retryDelay;
        return `${e.status ?? e.code ?? "ERROR"}: ${e.message ?? msg}${retry ? ` (retry in ${retry})` : ""}`;
      }
    } catch {}
  }
  return msg;
}

export async function speakGemini(text: string): Promise<void> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey || !text.trim()) return;

  const ai = new GoogleGenAI({ apiKey });

  let response;
  try {
    response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
        },
      },
    });
  } catch (err) {
    log.warn(`Gemini TTS failed — ${summarizeGeminiError(err)}`);
    return;
  }

  const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!data) {
    log.warn("Gemini TTS returned no audio");
    return;
  }

  const pcm = Buffer.from(data, "base64");
  const player = spawn("paplay", ["--raw", "--rate=24000", "--channels=1", "--format=s16le"], {
    stdio: ["pipe", "ignore", "ignore"],
  });
  player.on("error", (e: Error) => console.error("paplay error:", e.message));
  (player.stdin as NodeJS.WritableStream).end(pcm);
  await new Promise<void>((resolve) => player.once("close", resolve));
}
