import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import { logStatusAsText } from "./socketManager.js"; // 👈 nuova funzione che ti fornisco sotto

dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", () => {
  console.log(`🤖 Bot connesso come ${client.user.tag}`);

  const channelId = process.env.DISCORD_CHANNEL_ID;

  if (!channelId) {
    console.error("❌ DISCORD_CHANNEL_ID non definito nel .env");
    return;
  }

  const channel = client.channels.cache.get(channelId);

  if (!channel) {
    console.error("❌ Canale Discord non trovato");
    return;
  }

  setInterval(() => {
    const statusText = logStatusAsText();
    channel.send("📊 **STATO SERVER**\n" + statusText);
  }, 3 * 60 * 1000); // ogni 3 minuti
});

client.login(process.env.DISCORD_BOT_TOKEN);
