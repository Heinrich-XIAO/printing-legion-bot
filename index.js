import { App } from "@slack/bolt";
import { config } from "dotenv";

config();

const app = new App({
  token: process.env.BOT_TOK,
  appToken: process.env.APP_TOK,
  socketMode: true,
  signingSecret: process.env.SIGNING_SECRET,
});

(async () => {
  await app.start();
  console.log("started");
})();