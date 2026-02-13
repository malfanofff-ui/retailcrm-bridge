import WebSocket from "ws";
import fetch from "node-fetch";

const BOT_TOKEN = process.env.BOT_TOKEN;
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

// базовый адрес MG (без ws/https — просто домен)
const MG_HOST = process.env.MG_HOST || "mg-s1.retailcrm.pro";
const EVENTS = process.env.MG_EVENTS || "message_new";

if (!BOT_TOKEN || !MAKE_WEBHOOK_URL) {
  console.error("Missing env: BOT_TOKEN, MAKE_WEBHOOK_URL");
  process.exit(1);
}

function buildCandidates() {
  const base = `wss://${MG_HOST}/api/bot/v1/ws`;
  const ev1 = `events=${encodeURIComponent(EVENTS)}`;
  const ev2 = `events[]=${encodeURIComponent(EVENTS)}`;

  return [
    // 1) токен в query (самый частый для WS)
    `${base}?${ev1}&token=${encodeURIComponent(BOT_TOKEN)}`,
    `${base}?${ev2}&token=${encodeURIComponent(BOT_TOKEN)}`,

    // 2) access_token в query
    `${base}?${ev1}&access_token=${encodeURIComponent(BOT_TOKEN)}`,
    `${base}?${ev2}&access_token=${encodeURIComponent(BOT_TOKEN)}`,

    // 3) токен заголовком X-Bot-Token (как HTTP)
    { url: `${base}?${ev1}`, headers: { "X-Bot-Token": BOT_TOKEN } },
    { url: `${base}?${ev2}`, headers: { "X-Bot-Token": BOT_TOKEN } },

    // 4) токен заголовком Authorization (иногда так)
    { url: `${base}?${ev1}`, headers: { "Authorization": `Bearer ${BOT_TOKEN}` } },
    { url: `${base}?${ev2}`, headers: { "Authorization": `Bearer ${BOT_TOKEN}` } },
  ];
}

async function connectWithCandidate(candidate, idx, total) {
  const url = typeof candidate === "string" ? candidate : candidate.url;
  const headers = typeof candidate === "string" ? undefined : candidate.headers;

  console.log(`Trying WS [${idx}/${total}]: ${url.replace(BOT_TOKEN, "***")}`);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, headers ? { headers } : undefined);

    ws.on("open", () => resolve(ws));
    ws.on("error", (err) => reject(err));
  });
}

async function connect() {
  const candidates = buildCandidates();

  for (let i = 0; i < candidates.length; i++) {
    try {
      const ws = await connectWithCandidate(candidates[i], i + 1, candidates.length);

      console.log("✅ Connected to MG WS");

      ws.on("message", async (data) => {
        let payload;
        try { payload = JSON.parse(data.toString()); }
        catch { payload = { raw: data.toString() }; }

        // анти-зацикливание
        const fromType = payload?.payload?.from?.type || payload?.from?.type;
        if (fromType === "bot") return;

        await fetch(MAKE_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        console.log("Forwarded event to Make");
      });

      ws.on("close", () => {
        console.log("Disconnected. Reconnect in 3s...");
        setTimeout(connect, 3000);
      });

      ws.on("error", (err) => {
        console.log("WS error:", err.message);
        ws.close();
      });

      return; // успешно подключились — выходим
    } catch (err) {
      console.log("❌ Failed:", err.message);
    }
  }

  console.log("All WS candidates failed. Retry in 5s...");
  setTimeout(connect, 5000);
}

connect();
