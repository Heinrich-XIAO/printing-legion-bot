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
    db.data.printers.push({ user_id: command.user_id, region: command.text, dm_migration_notified: true });
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

const TARGET_CHANNEL = "C083P4FJM46";

app.event("message", async ({ event }) => {
  if (event.channel !== TARGET_CHANNEL) return;
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
        for (const printer of printers) {
          const transitionNotice = printer.dm_migration_notified
            ? ""
            : "We're moving printer notifications to DMs to avoid getting pinged for every message in a request thread. Future printer matches will be sent here instead. For bug reports or other feedback, email heinrichfromtweetor@gmail.com, or DM <@U08PY1XE5EE> on Slack.\n\n";
          let text = `${transitionNotice}A new printing request matches your printer profile.`;
          let delivered = false;
          try {
            const permalink = await app.client.chat.getPermalink({ channel: event.channel, message_ts: event.ts });
            text += `\n${permalink.permalink}`;
            const dm = await app.client.conversations.open({ users: printer.user_id });
            await app.client.chat.postMessage({
              channel: dm.channel.id,
              text,
            });
            delivered = true;
          } catch (error) {
            const reason = error.data?.error ?? error.message ?? String(error);
            console.warn(`WARN: Could not prepare or send the DM for printer ${printer.user_id} (${reason}); falling back to the request thread.`);
            try {
              const fallbackTransitionNotice = printer.dm_migration_notified
                ? ""
                : "We're moving printer notifications to DMs to avoid getting pinged for every message in a request thread. Future printer matches will be sent here instead. For bug reports or other feedback, email heinrichfromtweetor@gmail.com, or DM <@U08PY1XE5EE> on Slack.\n\n";
              const fallbackText = text.replace(transitionNotice, fallbackTransitionNotice);
              await app.client.chat.postMessage({
                channel: event.channel,
                thread_ts: event.ts,
                text: `<@${printer.user_id}> I couldn't send this as a DM, so here's the request notification in the thread instead.\n\n${fallbackText}`,
              });
              delivered = true;
            } catch (fallbackError) {
              const fallbackReason = fallbackError.data?.error ?? fallbackError.message ?? String(fallbackError);
              console.warn(`WARN: Could not post the fallback thread notification for printer ${printer.user_id} (${fallbackReason}).`);
            }
          }
          if (delivered && !printer.dm_migration_notified) {
            printer.dm_migration_notified = true;
            try {
              await db.write();
            } catch (error) {
              printer.dm_migration_notified = false;
              console.warn(`WARN: Could not save the DM migration notice status for printer ${printer.user_id}: ${error.message ?? error}`);
            }
          }
        }
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