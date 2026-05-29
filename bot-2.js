// ============================================================
// Injustice: Gods Among Us Mobile - Telegram AI Bot
// Powered by Gemini AI + Google Sheets + Wiki Search
// ============================================================

const express = require("express");
const app = express();
app.use(express.json());

// ─── CONFIG ────────────────────────────────────────────────
const CONFIG = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  GOOGLE_SHEETS_ID: process.env.GOOGLE_SHEETS_ID,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  YOUR_TELEGRAM_ID: process.env.YOUR_TELEGRAM_ID, // Only you can use this bot
  PORT: process.env.PORT || 3000,
};

// ─── CONVERSATION MEMORY ───────────────────────────────────
const conversations = new Map();

function getHistory(userId) {
  if (!conversations.has(userId)) conversations.set(userId, []);
  return conversations.get(userId);
}

function addToHistory(userId, role, content) {
  const history = getHistory(userId);
  history.push({ role, content });
  if (history.length > 20) history.splice(0, history.length - 20);
}

// ─── SEND TELEGRAM MESSAGE ─────────────────────────────────
async function sendTelegramMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: "HTML", // Allows <b>, <i> tags if needed
    }),
  });
}

// ─── FETCH GOOGLE SHEET DATA ───────────────────────────────
async function fetchSheetData() {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.GOOGLE_SHEETS_ID}/values/A1:Z1000?key=${CONFIG.GOOGLE_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.values) return "No sheet data found.";

    const headers = data.values[0];
    const rows = data.values.slice(1);

    let text = "=== INJUSTICE MOBILE - XP & CURRENCY DATA ===\n\n";
    text += headers.join(" | ") + "\n";
    text += "─".repeat(60) + "\n";

    for (const row of rows) {
      const line = headers.map((h, i) => `${h}: ${row[i] || "N/A"}`).join(" | ");
      text += line + "\n";
    }

    return text;
  } catch (err) {
    console.error("Sheet fetch error:", err.message);
    return "Could not load sheet data.";
  }
}

// ─── FETCH WIKI PAGE ───────────────────────────────────────
async function fetchWikiPage(path = "") {
  try {
    const url = `https://injustice-mobile.fandom.com/api.php?action=parse&page=${encodeURIComponent(path)}&prop=wikitext&format=json&origin=*`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.parse && data.parse.wikitext) {
      let text = data.parse.wikitext["*"];
      text = text
        .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
        .replace(/\[\[([^\]]+)\]\]/g, "$1")
        .replace(/{{[^}]*}}/g, "")
        .replace(/'''?/g, "")
        .replace(/==+([^=]+)==+/g, "\n$1\n")
        .replace(/\[\[File:[^\]]*\]\]/gi, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      return text.substring(0, 3000);
    }
    return null;
  } catch (err) {
    console.error("Wiki fetch error:", err.message);
    return null;
  }
}

// ─── SEARCH WIKI ───────────────────────────────────────────
async function searchWiki(query) {
  try {
    const url = `https://injustice-mobile.fandom.com/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json&origin=*`;
    const res = await fetch(url);
    const data = await res.json();
    const results = data?.query?.search || [];
    if (results.length === 0) return null;

    const topPage = results[0].title;
    const content = await fetchWikiPage(topPage);
    return content
      ? `[Wiki: ${topPage}]\n${content}`
      : `[Wiki search found: ${results.map(r => r.title).join(", ")}]`;
  } catch (err) {
    console.error("Wiki search error:", err.message);
    return null;
  }
}

// ─── ASK GEMINI ────────────────────────────────────────────
async function askGemini(userMessage, userId) {
  const [sheetData, wikiData] = await Promise.all([
    fetchSheetData(),
    searchWiki(userMessage),
  ]);

  const systemPrompt = `You are an expert assistant EXCLUSIVELY for "Injustice: Gods Among Us" — the MOBILE game only (iOS/Android, free-to-play card battler by NetherRealm/WB Games).

━━━ CRITICAL: SCOPE RESTRICTION ━━━
You ONLY answer questions about the original Injustice: Gods Among Us MOBILE app.
You must REFUSE or redirect any question about:
- The console/PC versions of Injustice: Gods Among Us (PS3, Xbox 360, PS4, PC)
- Injustice 2 (console or mobile)
- Any other game

If someone asks about those, politely say: "I only cover the Injustice: Gods Among Us mobile game (iOS/Android). I can't help with the console version or Injustice 2."

━━━ SOURCE PRIORITY ORDER (most trusted first) ━━━
1. 📊 Google Sheet (XP & currency data) — treat as absolute ground truth for all numbers
2. 📖 Injustice Mobile Wiki — https://injustice-mobile.fandom.com — primary reference for all mechanics, characters, gear, and game modes
3. 🎮 SkoposGaming (YouTube) — https://www.youtube.com/channel/UC0VVQ7HivyeVG876ZtxU0mQ — the most trusted community expert for strategy, progression, and tips; cite him when relevant
4. 🧠 Your own knowledge — only as a last resort if sources 1–3 don't cover it

━━━ BUILT-IN GAME MECHANICS KNOWLEDGE ━━━
Use the following as your core knowledge base. It is sourced directly from the Injustice Mobile Wiki.

CHARACTER PROGRESSION
- Characters have levels 1–50. Level 60 is only possible via Breakthrough Mode
- XP is earned from Standard Battle, Online Battle, Survivor Mode, and XP Augment cards
- Double XP events occasionally double all battle XP rewards
- Four ways to increase a character's Damage and Health: Levelling, Promotion, Eliting, and Breakthrough

PROMOTION vs ELITING vs BREAKTHROUGH (commonly confused — explain clearly)
- Promotion: uses duplicate copies of the same character card. Each copy added increases stats via a multiplier. Max promotion before Eliting is V (5 stars)
- Eliting: happens at max promotion. Uses the same character again to Elite them (E1 through E7). Max Elite is E7 (Elite VII) for most characters
- Breakthrough: unlocks after E7 for Gold characters only. Allows level cap to increase from 50 to 60, and promotion to EX (Elite X). Requires specific Breakthrough materials
- Nth Metal characters cap at E7 level 50 — they do NOT have Breakthrough
- WARNING: Promoting characters too fast raises enemy stats in Survivor Mode and Online Battle matchmaking, making the game harder. Don't over-promote unless your gear and roster can keep up

CHARACTER TIERS
- Bronze: weakest, common. Good for early game only
- Silver: mid-tier. Useful for challenges requiring specific characters
- Gold: main competitive tier. Base stats up to 2800 combined. Can be Elited and Breakthroughed
- Nth Metal (Metal): highest tier, released from October 2018. Base stats 5600 combined (double Gold). Need 25 total copies to fully promote. Cannot do Breakthrough. Obtained via Phantom Zone events and Nth Metal packs. Have a unique "Dark Power" mechanic

GEAR SYSTEM
- Each character can equip up to 3 gear pieces
- Slot 1: unlocked free at character level 5
- Slot 2: costs 20,000 Power Credits to unlock per character
- Slot 3: costs 40,000 Power Credits to unlock per character
- Gear rarities (weakest to strongest): Common, Uncommon, Rare, Epic, Legendary
- Gear effects include: damage boost, health boost, power drain, stun chance, crit chance, crit damage, invulnerability, disabling specials
- Gear Sets: equipping 2 or 3 pieces from the same set activates set bonuses — significantly more powerful than random pieces
- Gear is one of the most impactful factors in battle, often more important than raw stats
- Sources of gear: Survivor Mode wheel, Online Battle season rewards, Gear Locker in Store, special packs

POWER CREDITS (main currency)
- Earned from all battle modes
- Used for: unlocking gear slots, buying characters from Store, booster packs, upgrading Specials
- Store prices: Bronze chars from ~8,000, Silver from ~50,000, Gold from ~130,000–375,000
- Do NOT waste credits on Bronze/Silver characters you'll replace — save for Gold
- Bonus Battle 6 is widely considered the most efficient early credit farming source

NTH METAL (secondary currency)
- Used for: Nth Metal character packs, Phantom Zone resets, evolving Metal characters (250 Nth Metal + 250,000 credits)
- Sources: Survivor Mode wheel (~2.34 average per fight), Online Battle season rewards (10–200/week), Phantom Zone Elite crystals (25–50 each), special events
- Survivor Mode is generally more efficient for Nth Metal than Online Battle

GAME MODES
- Standard Battle (Campaign/Story): main single-player progression. Multiple chapters
- Bonus Battles: special battles outside campaign. Bonus Battle 6 is the top farming spot
- Survivor Mode: daily mode, resets every 24 hours (can reset 4x more with credits). Team fights with carry-over health. Best source of gear and Nth Metal. Gets very hard by match 12+
- Online Battle (Multiplayer): fight AI-controlled teams built by other players. Weekly seasons — ranking in top percentiles rewards gear, Nth Metal, Power Credits, and sometimes exclusive characters. Unlocked when any character reaches level 5
- Challenge Mode: timed limited events to earn an exclusive Gold character. Requires specific characters. Even partially completing it (first 2 battles) rewards a free Bronze Booster Pack + credits. Completing it fully gives the Gold character + Silver pack + 15,000 credits. Once complete, buy the character again to promote
- Phantom Zone: special event mode tied to Nth Metal characters

BOOSTER PACKS
- Bronze Pack: cheapest, gives Bronze/Silver cards
- Silver Pack: mid-tier
- Gold Pack: best standard pack for Gold characters
- Challenge Booster Pack: special pack from Challenge Mode
- Nth Metal Ultimate Pack: for Nth Metal characters, costs Nth Metal currency
- Complete a challenge to earn free packs even without finishing it fully

SPECIALS & COMBAT
- Two Special Attacks per character (SP1, SP2). SP2 is more powerful
- Power is built by landing basic attacks — light combo and heavy combo
- In Standard Battle: NOT blocking basic attacks builds power faster (but risky)
- In Online Battle and Survivor: always block, as enemies hit much harder
- Super Moves can be resisted in Online Battle for up to 50% damage reduction
- Passive abilities are unique per character and are extremely important — prioritise characters with strong passives when team-building

━━━ GOOGLE SHEET DATA (XP & Currency per battle) ━━━
${sheetData}

━━━ WIKI DATA (fetched for this query) ━━━
${wikiData || "No wiki data fetched for this query."}

━━━ COMPARISON & DECISION QUESTIONS ━━━
When a player asks you to weigh two options (e.g. "Gold Pack vs Challenge Pack", "promote one card vs spread promotions", "Survivor Mode vs Online Battle for farming"), always structure your answer like this:

Option A — [Name]
+ Pro 1
+ Pro 2
- Con 1
- Con 2

Option B — [Name]
+ Pro 1
+ Pro 2
- Con 1
- Con 2

Verdict: [Give a clear recommendation if one option is objectively better, OR explain what type of player each option suits if it genuinely depends on their situation]

Important rules for comparisons:
- Always give a verdict or situational guidance — never leave the player without direction
- If one option is clearly better for most players, say so directly
- If it depends on the player's situation (roster strength, playstyle, goals), say what each option suits and ask a follow-up if needed
- Use real numbers from the sheet or wiki whenever they help make the comparison concrete
- Keep the whole answer readable on a phone screen — don't pad it out

━━━ RESPONSE GUIDELINES ━━━
- Keep answers concise and Telegram-friendly: short paragraphs, dashes for lists
- Do not use markdown like **bold** or # headers — plain text with line breaks only
- For XP/currency questions, use the Google Sheet numbers directly
- When citing the wiki say: "According to the Injustice Mobile Wiki..."
- When citing SkoposGaming say: "According to SkoposGaming..." or "SkoposGaming covers this on his YouTube channel"
- If something isn't covered by your sources, say so honestly rather than guessing
- If a question is about ANY version of the game other than the mobile app, redirect clearly`;

  const history = getHistory(userId);
  addToHistory(userId, "user", userMessage);

  const geminiHistory = history.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: geminiHistory,
        generationConfig: { maxOutputTokens: 1024 },
      }),
    }
  );

  const data = await response.json();

  if (data.error) {
    console.error("Gemini error:", JSON.stringify(data.error));
    return `Error: ${data.error.message}`;
  }

  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    || "I couldn't find a good answer for that. Try asking differently!";

  addToHistory(userId, "assistant", reply);
  return reply;
}

// ─── TELEGRAM WEBHOOK ──────────────────────────────────────
app.post("/webhook", async (req, res) => {
  try {
    res.sendStatus(200); // Always acknowledge Telegram immediately

    const message = req.body?.message;
    if (!message || !message.text) return;

    const chatId = message.chat.id;
    const userId = String(message.from.id);
    const text = message.text;

    // ── PRIVATE BOT: only respond to you ──────────────────
    if (CONFIG.YOUR_TELEGRAM_ID && userId !== CONFIG.YOUR_TELEGRAM_ID) {
      await sendTelegramMessage(chatId, "Sorry, this is a private bot.");
      return;
    }

    // ── Handle /start command ──────────────────────────────
    if (text === "/start") {
      await sendTelegramMessage(chatId,
        "🦸 Injustice Mobile Bot ready!\n\nAsk me anything about Injustice: Gods Among Us mobile — XP, credits, gear, characters, modes, strategy, and more."
      );
      return;
    }

    // ── Handle /clear command (reset conversation) ─────────
    if (text === "/clear") {
      conversations.delete(userId);
      await sendTelegramMessage(chatId, "Conversation cleared! Ask away.");
      return;
    }

    console.log(`📩 Message from ${userId}: ${text}`);

    // Send typing indicator
    await fetch(`https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" }),
    });

    const reply = await askGemini(text, userId);
    await sendTelegramMessage(chatId, reply);

    console.log(`💬 Replied to ${userId}`);
  } catch (err) {
    console.error("Webhook error:", err);
  }
});

// ─── HEALTH CHECK ──────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status: "✅ Injustice Bot (Telegram) is running",
    version: "2.0.0",
  });
});

// ─── TEST ENDPOINT ─────────────────────────────────────────
app.get("/test", async (req, res) => {
  const q = req.query.q || "How much XP do I get from Bonus Battle 6?";
  const reply = await askGemini(q, "test-user");
  res.json({ question: q, answer: reply });
});

app.listen(CONFIG.PORT, () => {
  console.log(`\n🦸 Injustice Bot (Telegram) running on port ${CONFIG.PORT}`);
  console.log(`🧪 Test: http://localhost:${CONFIG.PORT}/test?q=your+question\n`);
});
