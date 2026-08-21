import { App } from "@slack/bolt";
import { config } from "dotenv";

config();

const app = new App({
  token: process.env.BOT_TOK,
  appToken: process.env.APP_TOK,
  socketMode: true,
});

app.event("message", async ({ event }) => {
  console.log(event);
});

(async () => {
  await app.start();
  console.log("started");
})();