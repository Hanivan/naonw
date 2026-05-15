import { speakGemini } from "@/utils/gemini-tts.ts";

async function main() {
  await speakGemini("こんにちは、お元気ですか？");
  console.log("Done.");
}

main().catch(console.error);
