import { App } from "@slack/bolt";
import { config } from "dotenv";
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
  if (existingPrinter) {
    existingPrinter.region = command.text;
    await db.write();
    console.log(`Updated ${command.user_id}'s printer region to "${command.text}".`);
  } else {
    db.data.printers.push({ user_id: command.user_id, region: command.text });
    await db.write();
    console.log(`Added ${command.user_id} as a printer.`);
  }
  const latency = Date.now() - start;
  const text = existingPrinter ? `Updated your printer region to "${command.text}".\nLatency: ${latency}ms` : `Added you as a printer with region "${command.text}".
Run again to update region.
Run \`/update-filament-stock\` to update your filament stock.\n
Latency: ${latency}ms`;
  await respond({ text });
});

app.command("/add-custom-filter", async ({ command, ack, respond }) => {
  const start = Date.now();
  console.log(command);
  await ack();
  const printer = db.data.printers.find(printer => printer.user_id === command.user_id);
  if (!printer) {
    await respond({ text: "You are not registered as a printer. Use /add-me-as-printer to register." });
    return;
  }
  const existingFilter = printer.custom_filter;
  if (existingFilter) {
    printer.custom_filter = command.text;
    await db.write();
    console.log(`Updated ${command.user_id}'s custom filter to "${command.text}".`);
  } else {
    printer.custom_filter = command.text;
    await db.write();
    console.log(`Added ${command.user_id} as a custom filter with filter "${command.text}".`);
  }
  const latency = Date.now() - start;
  const text = existingFilter ? `Updated your custom filter to "${command.text}".\nLatency: ${latency}ms` : `Added you as a custom filter with filter "${command.text}".\nRun again to update filter.\nLatency: ${latency}ms`;
  await respond({ text });
});

app.command("/update-filament-stock", async ({ command, ack, respond }) => {
  const start = Date.now();
  console.log(command);
  await ack();
  const existingPrinter = db.data.printers.find(printer => printer.user_id === command.user_id);
  if (!existingPrinter) {
    await respond({ text: "You are not registered as a printer. Use /add-me-as-printer to register." });
    return;
  }
  existingPrinter.filament_stock = command.text;
  await db.write();
  console.log(`Updated ${command.user_id}'s filament stock to "${command.text}".`);
  const latency = Date.now() - start;
  await respond({ text: `Updated your filament stock to "${command.text}".\nLatency: ${latency}ms` });
});

app.event("message", async ({ event }) => {
  if (event.type == "message" && event.subtype == undefined && !event.thread_ts && !event.bot_id) {
    console.log("LOG: message event", event);
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
        await app.client.chat.postMessage({
          channel: event.channel,
          thread_ts: event.ts,
          text: `Duplicate submission found for git_url: ${parsedJSON.git_url} processing anyway...`,
        });
        // return;
      }
      db.data.submissions.push(parsedJSON);
      await db.write();
      console.log(`Submission parsed and added to database in ${time}ms`);
      const printerIds = await checkPrinters(parsedJSON);
      console.log(`Printer IDs: ${printerIds}`);
      if (printerIds.length > 0) {
        const printers = db.data.printers.filter(printer =>
          printerIds.includes(printer.user_id)
        );
        console.log(printers);
        const pingText = printers
          .map(printer =>
            printer.filament_stock
              ? `<@${printer.user_id}> (${printer.filament_stock})`
              : `<@${printer.user_id}>`
          )
          .join(" ");
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