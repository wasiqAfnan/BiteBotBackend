import { Agent } from "@openai/agents";
import { z } from "zod";
import searchRecipesTool from "./searchRecipeTool.js";
import { readFile } from 'fs/promises';

const FINE_TUNE_DATA = await readFile('./src/ai/FINE_TUNE_DATA_v2.txt', 'utf8');

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
    instructions: FINE_TUNE_DATA.trim(),
    tools: [searchRecipesTool],
    outputType: OutputSchema,
});

export default recipeAgent;
