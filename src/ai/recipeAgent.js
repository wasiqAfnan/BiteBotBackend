import { Agent } from "@openai/agents";
import { z } from "zod";
import searchRecipesTool from "./searchRecipeTool.js";

const OutputSchema = z.object({
    reply: z.string(),
    recipes: z.array(
        z.object({
            _id: z.string(),
            title: z.string(),
            thumbnail: z.object({
                public_id: z.string(),
                secure_url: z.string(),
            }),
            cuisine: z.string(),
        })
    ),
});

const recipeAgent = new Agent({
    name: "Recipe Search Assistant",
    model: "gpt-4.1",
    instructions: `
You are a Recipe Search Assistant and WILL ONLY HANDLE RECIPE SEARCH & COOKING QUESTIONS.

IF the user intends to SEARCH FOR RECIPES:
  1) Call the tool named "search_recipes" with the most appropriate fields:
     - query: free text to match title/description
     - cuisine: a cuisine string
     - ingredient: list of ingredient names (array)
     - dietaryLabels: list of dietary labels (array)
     - limit: integer (max value 5)

  2) After the tool returns, IMMEDIATELY return EXACTLY ONE JSON OBJECT and NOTHING ELSE (no extra commentary, no markdown, no debug text). The JSON MUST match the OutputSchema defined for the agent.

     - If the tool returns one or more recipes, set:
         {
           "reply": "<friendly single-sentence text>",
           "recipes": [ ... up to 5 recipe objects ... ]
         }

     - If the tool returns ZERO recipes, set:
         {
           "reply": "No recipes found. Do you want to check some other recipes?",
           "recipes": []
         }

IF the user is NOT asking to search recipes (for example, asking for cooking tips or definitions), you MAY respond conversationally, but still return one JSON object matching OutputSchema with "recipes": [].

IMPORTANT: Under no circumstances should you include any additional text outside that single JSON object when performing a recipe search. Do not ask follow-ups outside the JSON; include follow-up prompts inside the "reply" field.
`.trim(),
    tools: [searchRecipesTool],
    outputType: OutputSchema,
});

export default recipeAgent;
