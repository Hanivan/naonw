// src/ai/prompt-conditional.ts
//
// Topic-specific rules that load ONLY when the user's task matches the trigger.
// Keeps the base prompt slim — pay these tokens only when relevant.

interface ConditionalRules {
  match: (taskLowercased: string) => boolean;
  rules: string;
  label: string;
}

const MEDIA_RULES = `--- MEDIA (play/watch/listen/putar/dengar) ---
HEADLESS browser → warn("Browser is headless — audio/video will not play. Restart without HEADLESS=true.") then continue.
Land on actual watch/listen URL before done() — never /search, /results, or /homepage.
NEVER fabricate /watch?v=<id>. Video IDs are 11 chars (e.g. BO6A-bmRn48), NOT channel IDs (UC...). Click an actual link from PAGE STATE.
Channel videos/streams → click the channel's "Videos"/"Live" tab from PAGE STATE.

YouTube /watch flow: click video link → confirm URL has /watch?v= → wait(10000) → re-read PAGE STATE → if "Skip Ad"/"Lewati Iklan" visible click it (retry once) → done(). YT autoplays — do NOT click Play.

AUTOPLAY (no Play click): YouTube /watch, YT Music, SoundCloud, Twitch, TikTok, Vimeo
PLAY required: Spotify /track, Apple Music, Bandcamp, generic <video>/<audio> (only if no Pause visible)
Rule: scan PAGE STATE for Pause button (name~="Pause"|"Jeda"). If present, playing already → done(). Click Play only when Play is visible AND no Pause.
Autoplay-blocked overlay ("Click to play"/"Tap to start") → click overlay first, recheck Pause.
Login required for playback → warn() + done() with what you achieved.`;

const CAPTCHA_RULES = `--- CAPTCHA ---
solveCaptcha() → identify tile IDs (0-15) → clickCaptchaTile(ids, verify=false). New tiles? solveCaptcha() again. Done → clickCaptchaTile([], verify=true).`;

const SHOPPING_RULES = `--- SHOPPING/PRODUCTS ---
Always include price + currency next to each item in done(). For comparison tasks, list at least 3 results with Price | Store | Spec.
Do NOT add to cart, click Buy/Checkout, or submit any form unless user explicitly asked.
Source URL must be the product page itself, not the category/search listing.`;

const FORM_RULES = `--- FORM FILLING ---
Use fill({label: value, ...}) for multiple fields — one call, all at once.
Required fields are marked in PAGE STATE. Fill them all before submitting.
For combobox (autocomplete) fields use typeAndSelect TWO STEPS — never guess the suggestion.
Do NOT submit unless user said "submit"/"send"/"kirim". Fill + done() is the safe default.`;

const NEWS_RULES = `--- NEWS / ARTICLES ---
Open the actual article page — never quote from a search/aggregator preview.
done() format per item: Title | Source (direct article URL) | Publisher | Date | Summary (2-3 sentences).
Prefer Indonesian sources (detik, kompas, tempo, tirto, antara, cnn indonesia, metro tv) when user wrote in Indonesian.
Cite at least 2-3 sources for "latest" / "berita terbaru" tasks unless user asks for one.`;

const TRAVEL_RULES = `--- TRAVEL (flight/hotel/booking) ---
Read prices/schedules from the listing — do NOT click "Book Now"/"Pesan" unless user said so.
Always include: route/city pair, date, price, duration/transit, airline/hotel name.
For flights: list 3-5 options sorted by price unless user specified otherwise.
Confirm currency (IDR/USD) — Indonesian sites usually show Rp.`;

const WEATHER_RULES = `--- WEATHER ---
For Indonesian cities: prefer bmkg.go.id or accuweather.com.
done() must include: location, temp (°C), condition, humidity, today's high/low. If forecast asked, include 3-5 days.`;

const FINANCE_RULES = `--- FINANCE / CRYPTO / STOCKS ---
Read-only. NEVER click Buy/Sell/Transfer/Withdraw — even if user says "harga BTC" they want a price quote, not a trade.
Sources: coinmarketcap.com, coingecko.com (crypto); rti.co.id, idnfinancials.com (IDX stocks); google.com/finance (general).
Include: symbol, current price, 24h % change, market cap or volume.`;

const MAPS_RULES = `--- MAPS / DIRECTIONS / LOCATION ---
Use google.com/maps or maps.google.com. For "rute/directions": include distance, ETA, mode (drive/walk/transit).
For "alamat/address" or "buka jam berapa": include name, full address, hours, phone if visible, rating.
Do NOT call/share location — just report what's on the page.`;

const TRANSLATION_RULES = `--- TRANSLATION ---
Don't translate yourself — open translate.google.com or deepl.com (better quality), set source/target lang, paste text via type(), read result.
Pass the result verbatim in done(). Include both source and target language in the summary.`;

const REVIEWS_RULES = `--- REVIEWS / RATINGS / TOP-N ---
For "best X" / "top 10" / "review": open a curated source (RTINGS, NotebookCheck, GSMArena, dpreview, IMDb, Rotten Tomatoes, etc.) — not just Google search snippets.
done() lists at least 3-5 items with: name, score/rating, key pro+con, source URL per item.`;

const DOCS_RULES = `--- DOCUMENTATION / CODE ---
Prefer official docs (e.g. nodejs.org, react.dev, mdn) over StackOverflow.
For API questions: include the function/method signature + a minimal usage example in done().
For error questions: read the official troubleshooting page first; cite the relevant section URL.`;

const SCHEDULE_RULES = `--- SCHEDULE / TIME-SENSITIVE ---
For "jadwal sholat / prayer times": jadwalsholat.org or bimasislam.kemenag.go.id with city.
For "jadwal kereta/pesawat": official operator site (KAI Access, Garuda, etc.).
ALWAYS include the date and city in the answer — never just "5:30" without context.`;

const ACCOUNT_RULES = `--- ACCOUNT / SUBSCRIPTION (DANGER) ---
Cancel/delete/unsubscribe actions are IRREVERSIBLE. Stop at the confirmation dialog and call warn() + done() asking the user to confirm in the browser.
NEVER auto-confirm "Are you sure you want to delete X?" prompts.
For "logout/keluar": this IS reversible — proceed normally.`;

const RULES: ConditionalRules[] = [
  {
    label: "media",
    match: (t) => /\b(play|watch|listen|stream|putar|dengar|tonton|nonton)\b/.test(t),
    rules: MEDIA_RULES,
  },
  {
    label: "captcha",
    match: (t) => /\b(captcha|recaptcha|verify human|verifikasi)\b/.test(t),
    rules: CAPTCHA_RULES,
  },
  {
    label: "shopping",
    match: (t) => /\b(price|harga|buy|beli|product|produk|tokopedia|shopee|amazon|compare)\b/.test(t),
    rules: SHOPPING_RULES,
  },
  {
    label: "form",
    match: (t) => /\b(fill|isi|submit|kirim|register|daftar|sign\s*up|contact form|form kontak)\b/.test(t),
    rules: FORM_RULES,
  },
  {
    label: "news",
    match: (t) => /\b(news|berita|headline|article|artikel|terbaru|terkini|breaking)\b/.test(t),
    rules: NEWS_RULES,
  },
  {
    label: "travel",
    match: (t) => /\b(flight|tiket|pesawat|kereta|hotel|booking|pesan|trip|travel|liburan|airbnb|tiketcom|traveloka|agoda)\b/.test(t),
    rules: TRAVEL_RULES,
  },
  {
    label: "weather",
    match: (t) => /\b(weather|cuaca|hujan|suhu|temperature|forecast|prakiraan|panas|dingin)\b/.test(t),
    rules: WEATHER_RULES,
  },
  {
    label: "finance",
    match: (t) => /\b(stock|saham|crypto|bitcoin|btc|eth|ethereum|coin|harga\s+(bitcoin|saham|emas|usd|idr|btc|eth)|forex|kurs|exchange rate|nasdaq|idx|finance)\b/.test(t),
    rules: FINANCE_RULES,
  },
  {
    label: "maps",
    match: (t) => /\b(map|maps|peta|direction|rute|route|alamat|address|lokasi|location|nearby|terdekat|jam buka|opening hours)\b/.test(t),
    rules: MAPS_RULES,
  },
  {
    label: "translation",
    match: (t) => /\b(translate|terjemah(kan|an)?|translasi|english|inggris|jepang|japanese|arab(ic)?|korean|korea)\b.*\b(into|to|ke|jadi)\b/.test(t)
      || /\b(translate|terjemah)/.test(t),
    rules: TRANSLATION_RULES,
  },
  {
    label: "reviews",
    match: (t) => /\b(review|ulasan|rating|ranking|top\s*\d+|best|terbaik|recommend|rekomendasi|compare|bandingkan|vs)\b/.test(t),
    rules: REVIEWS_RULES,
  },
  {
    label: "docs",
    match: (t) => /\b(docs?|documentation|api|how to|cara|tutorial|example|contoh|github|stackoverflow|mdn|reference|syntax|error|fix)\b/.test(t),
    rules: DOCS_RULES,
  },
  {
    label: "schedule",
    match: (t) => /\b(jadwal|schedule|kapan|when|hari ini|today|besok|tomorrow|sholat|prayer|kereta|jam berapa)\b/.test(t),
    rules: SCHEDULE_RULES,
  },
  {
    label: "account",
    match: (t) => /\b(cancel|batal|unsubscribe|delete account|hapus akun|close account|tutup akun|deactivate)\b/.test(t),
    rules: ACCOUNT_RULES,
  },
];

export function pickConditionalRules(userTask: string): { rules: string; labels: string[] } {
  const t = userTask.toLowerCase();
  const matched = RULES.filter((r) => r.match(t));
  return {
    rules: matched.map((r) => r.rules).join("\n\n"),
    labels: matched.map((r) => r.label),
  };
}
