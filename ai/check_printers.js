import { client, MODEL } from "./client.js";
import { db } from "../db/database.js";

export const checkPrinters = async (submission) => {
  const regions = db.data.printers.map(printer => printer.region);
  const promises = regions.map(region => {
    return client.chat.send({
      chatRequest: {
        model: MODEL,
        messages: [
          { role: "user", content: `Is the region "${region}" close to the region "${submission.location.state_province}, ${submission.location.country}"? Answer with "yes" or "no".` }
        ],
        stream: false,
      }
    });
  });
  const responses = await Promise.all(promises);
  const retried_promises = responses.map(async response => {
    const answer = response.choices[0].message.content.trim().toLowerCase();
    if (answer !== "yes" && answer !== "no") {
      const region = regions[responses.indexOf(response)];
      const response = await client.chat.send({
        chatRequest: {
          model: MODEL,
          messages: [
            { role: "user", content: `The previous answer was "${answer}". Please answer with "yes" or "no". Is the region "${region}" close to the region "${submission.location.state_province}, ${submission.location.country}"?` }
          ],
          stream: false,
        }
      });
      const newAnswer = response.choices[0].message.content.trim().toLowerCase();
      if (newAnswer !== "yes" && newAnswer !== "no") {
        console.log(`Invalid response from AI: ${newAnswer}. Assuming "no".`);
        return false;
      }
      return newAnswer === "yes";
    }
    return answer === "yes";
  });
  const booleans = await Promise.all(retried_promises);
  const closePrinters = db.data.printers.filter((printer, index) => booleans[index]);
  const printerUserIds = closePrinters.map(printer => printer.user_id);
  return printerUserIds;  
};