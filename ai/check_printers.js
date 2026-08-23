import { client, MODEL } from "./client.js";
import { db } from "../db/database.js";
import { get3DFileDimentions } from "../github/stl_parsing.js";

export const checkPrinters = async (submission) => {
  const regions = db.data.printers.map(printer => printer.region);
  const promises = regions.map(region => {
    return client.chat.send({
      chatRequest: {
        model: MODEL,
        messages: [
          { role: "user", content: `Is the region "${region}" close to the region "${submission.location.state_province}, ${submission.location.country}"? Do not answer yes if countries don't overlap. Eg. If the first region is "Quebec, Canada" and the second region is "New York, USA", the answer should be "no", but "Quebec, Canada" and "Vancouver, Canada" should be "yes". Answer with "yes" or "no".` }
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
  const printerFilters = db.data.printers.map(printer => printer.custom_filter);
  // console.log(printerFilters);
  const filteredPrinters = await Promise.all(
    closePrinters.map(async printer => {
    if (!printer.custom_filter || printer.custom_filter.length === 0) {
      return printer;
    }
    // Ask AI if the submission matches the printer's filter while giving the AI the 3D file dimensions
    const filter = printer.custom_filter;
    const dimensions = await get3DFileDimentions(submission.git_url);
    const message = `Does the submission match this criteria: "${filter}"? If dimension requirements are provided, make sure that the optimal way of packing the 3D print files is used. If PCB files are included, or dimensions are duplicate, please ignore them. SUBMISSION: ${JSON.stringify(submission)} DIMENSIONS (in milimeters): ${JSON.stringify(dimensions)}. ANSWER "yes" OR "no".`
    console.log(message)
    const response = await client.chat.send({
      chatRequest: {
        model: MODEL,
        messages: [
          { role: "user", content: message }
        ],
        stream: false,
      }
    });
    // console.log(response)
    const answer = response.choices[0].message.content.trim().toLowerCase();
    console.log(answer)
    if (answer == "no") {
      return null;
    }
    return printer;
  })).then(results => results.filter(printer => printer !== null));
  console.log(filteredPrinters);
  const printerUserIds = filteredPrinters.map(printer => printer.user_id);
  console.log(printerUserIds);
  return printerUserIds;  
};