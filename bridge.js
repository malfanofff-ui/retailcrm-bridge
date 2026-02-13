import WebSocket from "ws";
import fetch from "node-fetch";

const BOT_TOKEN = process.env.BOT_TOKEN;
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;
const MG_WS_URL = "wss://mg-s1.retailcrm.pro/api/bot/v1/ws?events=message_new";

if (!BOT_TOKEN || !MAKE_WEBHOOK_URL) {
  console.error("Missing env: BOT_TOKEN, MAKE_WEBHOOK_URL");
  process.exit(1);
}

function connect() {
  console.log("Connecting to MG WS...");

  const ws = new WebSocket(MG_WS_URL, {
    headers: {
      "X-Bot-Token": BOT_TOKEN,
    },
  });

  ws.on("open", () => console.log("Connected to MG WS"));

  ws.on("message", async (data) => {
    let payload;
    try {
      payload = JSON.parse(data.toString());
    } catch {
      payload = { raw: data.toString() };
    }

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
    console.log("Disconnected. Reconnecting...");
    setTimeout(connect, 3000);
  });

  ws.on("error", (err) => {
    console.log("WS error:", err.message);
    ws.close();
  });
}

connect();
