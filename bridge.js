import WebSocket from "ws";
import fetch from "node-fetch";

const BOT_API_BASE = process.env.BOT_API_BASE;          // например: https://mg-s1.retailcrm.pro/api/bot/v1
const BOT_TOKEN = process.env.BOT_TOKEN;                // токен mgBot
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;  // webhook Make

if (!BOT_API_BASE || !BOT_TOKEN || !MAKE_WEBHOOK_URL) {
  console.error("Missing environment variables: BOT_API_BASE, BOT_TOKEN, MAKE_WEBHOOK_URL");
  process.exit(1);
}

async function getWebsocketUrl() {
  // пробуем самый частый endpoint
  const url = `${BOT_API_BASE.replace(/\/$/, "")}/my/websocket?types[]=message_new`;

  const res = await fetch(url, {
    method: "GET",
    headers: { "X-Bot-Token": BOT_TOKEN },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Failed to get websocket data (${res.status}): ${text}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`WS data is not JSON: ${text}`);
  }

  // в разных версиях может называться по-разному — перебираем варианты
  const wsUrl =
    data?.url ||
    data?.wsUrl ||
    data?.websocketUrl ||
    data?.connection?.url ||
    data?.data?.url ||
    data?.data?.connection?.url;

  if (!wsUrl || !String(wsUrl).startsWith("ws")) {
    throw new Error(`WebSocket URL not found in response: ${text}`);
  }

  return wsUrl;
}

async function connect() {
  try {
    console.log("Getting WebSocket URL from MG...");
    const wsUrl = await getWebsocketUrl();
    console.log("Connecting to:", wsUrl);

    const ws = new WebSocket(wsUrl);

    ws.on("open", () => {
      console.log("Connected to MG");
    });

    ws.on("message", async (data) => {
      let payload;

      try {
        payload = JSON.parse(data.toString());
      } catch {
        payload = { raw: data.toString() };
      }

      // защита от циклов (если вдруг прилетит событие от бота)
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
      console.log("Disconnected. Reconnecting in 3 seconds...");
      setTimeout(connect, 3000);
    });

    ws.on("error", (err) => {
      console.log("WS error:", err.message);
      ws.close();
    });
  } catch (err) {
    console.error("Startup error:", err.message);
    console.log("Retry in 5 seconds...");
    setTimeout(connect, 5000);
  }
}

connect();
