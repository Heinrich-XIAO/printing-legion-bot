import { App } from "@slack/bolt";
import { config } from "dotenv";
import { OpenRouter } from "@openrouter/sdk";
import { SYSTEM_PROMPT } from "./prompts/submission.js";
import { db } from "./db/database.js";
import { parseInfo } from "./ai/parser.js";
import { checkPrinters } from "./ai/check_printers.js";

config();

const app = new App({
  token: process.env.BOT_TOK,
  appToken: process.env.APP_TOK,
  socketMode: true,
});

app.command("/add-me-as-printer", async ({ command, ack, respond }) => {
  const start = Date.now();
  console.log(command);
  await ack();
  const existingPrinter = db.data.printers.find(printer => printer.user_id === command.user_id);
  if (!existingPrinter) {
    db.data.printers.push({ user_id: command.user_id, region: command.text });
    await db.write();
    console.log(`Added ${command.user_id} as a printer.`);
  } else {
    await respond({ text: `You are already registered as a printer.` });
  }
  const latency = Date.now() - start;
  await respond({ text: `Pong!\nLatency: ${latency}ms` });
});

app.event("message", async ({ event }) => {
  if (event.type == "message" && event.subtype == undefined) {
    const startms = process.hrtime.bigint()/1000000n;
    const response = await parseInfo(event.text);    
    const endms = process.hrtime.bigint()/1000000n;
    const time = endms - startms;
    const parsedJSON = JSON.parse(response.choices[0].message.content);
    if (parsedJSON.valid) {
      // Check for duplicates w/ git_url
      const duplicate = db.data.submissions.find(submission => submission.git_url === parsedJSON.git_url);
      if (duplicate) {
        console.log(`Duplicate submission found for git_url: ${parsedJSON.git_url} in ${time}ms`);
        return;
      }
      db.data.submissions.push(parsedJSON);
      await db.write();
      console.log(`Submission parsed and added to database in ${time}ms`);
      const printers = await checkPrinters(parsedJSON);
      if (printers.length > 0) {
        const pingText = printers.map(user_id => `<@${user_id}>`).join(" ");
        await app.client.chat.postMessage({
          channel: event.channel,
          thread_ts: event.ts,
          text: `These printers are close to the location: ${pingText}`,
        });
      }
      return
    } else {
      console.log(`Invalid submission: ${JSON.stringify(parsedJSON)} in ${time}ms`);
      return
    }
  }
  console.log(event);
});

(async () => {
  await app.start();
  console.log("started");
})();