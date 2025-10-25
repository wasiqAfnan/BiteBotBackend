import { Agent } from "@openai/agents";
import { z } from "zod";
import searchRecipesTool from "./searchRecipeTool.js";
import { readFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

// Setup file path to load fine-tuning data
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const filePath = join(__dirname, "FINE_TUNE_DATA_v4.txt");

// Load fine-tuning instructions for the agent
const FINE_TUNE_DATA = await readFile(filePath, "utf8");

// Define the structured output the agent should return
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

// Create a recipe search agent with a model, tools, and output validation
const recipeAgent = new Agent({
    name: "Recipe Search Assistant",
    model: "gpt-4.1",
    instructions: FINE_TUNE_DATA.trim(),
    tools: [searchRecipesTool],
    outputType: OutputSchema,
});

// Export the agent for use elsewhere in the application
export default recipeAgent;
