import { App } from "@slack/bolt";
import { config } from "dotenv";

config();

const app = new App({
  token: process.env.BOT_TOK,
  appToken: process.env.APP_TOK,
  socketMode: true,
});

app.event("message", async ({ event }) => {
  if (event.type == "message" && event.subtype == undefined) {
    
    await app.client.chat.postMessage({
      channel: event.channel,
      text: `Hello <@${event.user}>!`,
    });
    return
  }
  console.log(event);
});

(async () => {
  await app.start();
  console.log("started");
})();