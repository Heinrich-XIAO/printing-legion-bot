import { OpenRouter } from "@openrouter/sdk";
import { config } from "dotenv";

config();
export const client = new OpenRouter({
  apiKey: process.env.HACKCLUB_API_KEY,
  serverURL: "https://ai.hackclub.com/proxy/v1",
});
export const MODEL = "openai/gpt-oss-120b:nitro";