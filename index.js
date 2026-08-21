import { App } from "@slack/bolt";
import { config } from "dotenv";
import { OpenRouter } from "@openrouter/sdk";
import { JSONFilePreset } from 'lowdb/node';

config();

const app = new App({
  token: process.env.BOT_TOK,
  appToken: process.env.APP_TOK,
  socketMode: true,
});

const client = new OpenRouter({
  apiKey: process.env.HACKCLUB_API_KEY,
  serverURL: "https://ai.hackclub.com/proxy/v1",
});

const defaultData = {
  submissions: [],
};
const db = await JSONFilePreset("db.json", defaultData);

const SYSTEM_PROMPT = `
You are a strict information-extraction system for processing messages submitted in a channel.

Your task is to extract five required pieces of information from the user's message:

1. project_name — The name of the project.
2. git_url — The project's GitHub, GitLab, or other source-code repository URL.
3. location — The user's general area, consisting only of their state/province and country.
4. filament — The type, color, or other relevant description of the 3D-printing filament they need.
5. ysws — The YSWS (You Ship We Ship) program/event that the project was submitted to.

Every valid submission should contain all five fields.

Return ONLY valid JSON. Never return Markdown, explanations, comments, or text outside the JSON object.

If all five fields are present and can be confidently extracted, return:

{
  "valid": true,
  "project_name": "...",
  "git_url": "...",
  "location": {
    "state_province": "...",
    "country": "..."
  },
  "filament": "...",
  "ysws": "..."
}

If one or more required fields are missing, ambiguous, or cannot be confidently extracted, return:

{
  "valid": false,
  "missing": ["field_name"],
  "reason": "Brief explanation of what is missing or unclear."
}

Rules:

- Never invent, assume, or fabricate information.
- Do not infer missing information from general knowledge.
- Only extract information explicitly stated or unambiguously provided in the user's message.
- Do not infer a state/province from a city. If the message only provides a city and not its state/province, consider the location incomplete.
- Only extract the general geographic area: state/province and country. Never output an exact address, postal code, street, or other precise location.
- \`git_url\` must be an actual repository URL present in the message. Do not construct one from a project name.
- Preserve the project's name as written, while removing obvious surrounding formatting if appropriate.
- If multiple filament types/colors/materials are requested, include all relevant requirements in the \`filament\` field.
- If the filament requirement includes quantity, size, or other useful specifications, preserve those details.
- If multiple YSWS programs are explicitly mentioned as submissions, include all of them in the \`ysws\` field.
- Do not treat unrelated mentions of projects, repositories, locations, filament, or YSWS programs as the user's submission information.
- If a required field is ambiguous enough that choosing one value would require guessing, mark that field as missing.
- \`missing\` must contain the exact field names from this list: \`project_name\`, \`git_url\`, \`location\`, \`filament\`, \`ysws\`.
- If multiple fields are missing, include every missing field in \`missing\`.
- The \`reason\` should be concise and describe the missing or ambiguous information.
- Do not add fields that are not specified in the output schema.`;

const parseInfo = async (text) => {
  console.log(text)
  return await client.chat.send({
    chatRequest: {
    model: "stealth/ox-alpha",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text }
    ],
    stream: false,
  }
  });
};


app.event("message", async ({ event }) => {
  if (event.type == "message" && event.subtype == undefined) {
    const startms = process.hrtime.bigint()/1000000n;
    const response = await parseInfo(event.text);    
    const endms = process.hrtime.bigint()/1000000n;
    const time = endms - startms;
    const parsedJSON = JSON.parse(response.choices[0].message.content);
    if (parsedJSON.valid) {
      db.data.submissions.push(parsedJSON);
      await db.write();
      console.log(`Submission parsed and added to database in ${time}ms`);
    } else {
      console.log(`Invalid submission: ${JSON.stringify(parsedJSON)} in ${time}ms`);
    }
    return
  }
  console.log(event);
});

(async () => {
  await app.start();
  console.log("started");
})();