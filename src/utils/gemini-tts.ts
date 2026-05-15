import { GoogleGenAI } from "@google/genai";
import { spawn } from "node:child_process";

export async function speakGemini(text: string): Promise<void> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey || !text.trim()) return;

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
      },
    },
  });

  const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!data) return;

  const pcm = Buffer.from(data, "base64");
  const player = spawn("paplay", ["--raw", "--rate=24000", "--channels=1", "--format=s16le"], {
    stdio: ["pipe", "ignore", "ignore"],
  });
  player.on("error", (e: Error) => console.error("paplay error:", e.message));
  (player.stdin as NodeJS.WritableStream).end(pcm);
  await new Promise<void>((resolve) => player.once("close", resolve));
}
