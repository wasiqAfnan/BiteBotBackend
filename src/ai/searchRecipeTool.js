import { tool } from "@openai/agents";
import { z } from "zod";
import { Recipe } from "../models/recipe.models.js";

function escapeRegex(text = "") {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const searchRecipesTool = tool({
    name: "search_recipes",
    description:
        "Search recipes in MongoDB using an aggregation pipeline. All params optional. Returns an array of matching recipe plain objects.",
    parameters: z.object({
        query: z.string().nullable().default(null),
        cuisine: z.string().nullable().default(null),
        ingredient: z.array(z.string()).nullable().default(null),
        dietaryLabels: z.array(z.string()).nullable().default(null),
        limit: z.number().default(5),
    }),
    async execute(input) {
        console.log(input);
        const { query, cuisine, ingredient, dietaryLabels, limit } =
            input ?? {};

        // Build an array of independent filter conditions (OR semantics)
        const orConditions = [];

        if (query) {
            const r = new RegExp(escapeRegex(query), "i");
            orConditions.push({ $or: [{ title: r }, { description: r }] });
        }

        if (cuisine) {
            orConditions.push({
                cuisine: new RegExp(escapeRegex(cuisine), "i"),
            });
        }

        if (Array.isArray(ingredient) && ingredient.length) {
            orConditions.push({
                "ingredients.name": {
                    $in: ingredient.map((s) => new RegExp(escapeRegex(s), "i")),
                },
            });
        }

        if (Array.isArray(dietaryLabels) && dietaryLabels.length) {
            orConditions.push({ dietaryLabels: { $in: dietaryLabels } });
        }

        // If no filters provided, return empty (same guard as you had)
        if (!orConditions.length) return [];

        // If only one condition, use it directly; otherwise use $or
        const matchStage =
            orConditions.length === 1 ? orConditions[0] : { $or: orConditions };

        const pipeline = [
            { $match: matchStage },
            {
                $project: {
                    _id: 1,
                    title: 1,
                    cuisine: 1,
                    thumbnail: 1,
                },
            },
            { $limit: limit },
        ];

        const results = await Recipe.aggregate(pipeline).exec();
        console.log(results);
        return results;
    },
});

export default searchRecipesTool;
