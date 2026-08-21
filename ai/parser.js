import { client, MODEL } from "./client.js";

export const parseInfo = async (text) => {
  return await client.chat.send({
    chatRequest: {
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text }
    ],
    stream: false,
  }
  });
};