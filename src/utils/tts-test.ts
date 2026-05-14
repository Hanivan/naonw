import { speak, listVoices } from "./tts.ts";

console.log("Available voices:");
const voices = await listVoices();
for (const v of voices) console.log(" ", v);

const langs = [
  { lang: "en", label: "English", text: "Hello! Text to speech is working." },
  { lang: "id", label: "Bahasa Indonesia", text: "Halo! Teks ke suara berfungsi dengan baik." },
  { lang: "ja", label: "Japanese (easter egg)", text: "こんにちは！音声合成が正常に動作しています。" },
];

for (const voice of langs) {
  console.log(`\n=== Voice: ${voice.label} (${voice.lang}) ===`);
  for (const content of langs) {
    console.log(`  Speaking ${content.label} text with ${voice.label} voice...`);
    await speak(content.text, voice.lang);
  }
}

console.log("\nDone.");
