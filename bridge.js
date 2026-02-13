import WebSocket from "ws";
import fetch from "node-fetch";

const MG_WS_URL = process.env.MG_WS_URL;
const BOT_TOKEN = process.env.BOT_TOKEN;
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

if (!MG_WS_URL || !BOT_TOKEN || !MAKE_WEBHOOK_URL) {
  console.error("Missing environment variables");
  process.exit(1);
}

function connect() {
  console.log("Connecting to RetailCRM MessageGateway...");

  const ws = new WebSocket(MG_WS_URL, {
    headers: {
      "X-Bot-Token": BOT_TOKEN
    }
  });

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

    console.log("Event received from RetailCRM");

    await fetch(MAKE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  });

  ws.on("close", () => {
    console.log("Disconnected. Reconnecting in 3 seconds...");
    setTimeout(connect, 3000);
  });

  ws.on("error", (err) => {
    console.log("WS error:", err.message);
    ws.close();
  });
}

connect();
