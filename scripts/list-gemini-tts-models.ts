import { GoogleGenAI } from "@google/genai";

const PRICING: Record<string, {
  type: string;
  inputText?: number;
  inputAudio?: number;
  inputImage?: number;
  outputText?: number;
  outputAudio?: number;
  batchIn?: number;
  batchOut?: number;
}> = {
  "gemini-3.1-flash-live-preview": {
    type: "Live API",
    inputText: 0.75, inputAudio: 3.00, inputImage: 1.00,
    outputText: 4.50, outputAudio: 12.00,
  },
  "gemini-3.1-flash-tts-preview": {
    type: "TTS",
    inputText: 1.00,
    outputAudio: 20.00,
    batchIn: 0.50, batchOut: 10.00,
  },
  "gemini-2.5-flash-native-audio-preview-12-2025": {
    type: "Live API (Native Audio)",
    inputText: 0.50, inputAudio: 3.00,
    outputText: 2.00, outputAudio: 12.00,
  },
  "gemini-2.5-flash-preview-tts": {
    type: "TTS",
    inputText: 0.50,
    outputAudio: 10.00,
    batchIn: 0.25, batchOut: 5.00,
  },
  "gemini-2.5-pro-preview-tts": {
    type: "TTS",
    inputText: 1.00,
    outputAudio: 20.00,
    batchIn: 0.50, batchOut: 10.00,
  },
};

const TTS_KEYWORDS = ["tts", "audio", "live", "speech"];

function isTTSModel(name: string): boolean {
  const lower = name.toLowerCase();
  return TTS_KEYWORDS.some((kw) => lower.includes(kw));
}

function fmt(label: string, val?: number): string {
  return val !== undefined ? `${label}: $${val.toFixed(2)}/M` : "";
}

async function main() {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    console.error("GEMINI_API_KEY not set");
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });

  const models: { name: string; displayName: string; description: string }[] = [];
  const pager = await ai.models.list();
  for await (const model of pager) {
    if (isTTSModel(model.name ?? "")) {
      models.push({
        name: model.name ?? "",
        displayName: model.displayName ?? model.name ?? "",
        description: model.description ?? "",
      });
    }
  }

  if (models.length === 0) {
    console.log("No TTS/audio models found.");
    return;
  }

  console.log(`\nGemini TTS / Audio / Live Models (${models.length} found)\n${"─".repeat(60)}`);

  for (const m of models) {
    const shortName = m.name.replace("models/", "");
    const pricing = PRICING[shortName];
    console.log(`\n${m.displayName}`);
    console.log(`  ID   : ${shortName}`);
    if (m.description) console.log(`  About: ${m.description}`);
    if (pricing) {
      console.log(`  Type : ${pricing.type}`);
      const inputParts = [
        fmt("text", pricing.inputText),
        fmt("audio", pricing.inputAudio),
        fmt("image/video", pricing.inputImage),
      ].filter(Boolean);
      const outputParts = [
        fmt("text", pricing.outputText),
        fmt("audio", pricing.outputAudio),
      ].filter(Boolean);
      if (inputParts.length) console.log(`  In   : ${inputParts.join(" | ")}`);
      if (outputParts.length) console.log(`  Out  : ${outputParts.join(" | ")}`);
      if (pricing.batchIn !== undefined)
        console.log(`  Batch: in $${pricing.batchIn.toFixed(2)}/M | out $${pricing.batchOut!.toFixed(2)}/M`);
    } else {
      console.log("  Pricing: (not in local table — check ai.google.dev/gemini-api/docs/pricing)");
    }
  }

  console.log(`\n${"─".repeat(60)}\nPricing source: https://ai.google.dev/gemini-api/docs/pricing\n`);
}

main().catch(console.error);
