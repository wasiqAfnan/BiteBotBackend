import { tool } from "@openai/agents";
import { z } from "zod";
import { Recipe } from "../models/recipe.models.js";

// Utility function to escape special characters for use in regular expressions
function escapeRegex(text = "") {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Define a tool for searching recipes in MongoDB
const searchRecipesTool = tool({
    name: "search_recipes",
    description:
        "Search recipes in MongoDB using an aggregation pipeline. All params optional. Returns an array of matching recipe plain objects.",

    // Input validation schema using zod
    parameters: z.object({
        query: z.string().nullable().default(null), // Text search in title or description
        cuisine: z.string().nullable().default(null), // Filter by cuisine type
        ingredient: z.array(z.string()).nullable().default(null), // Filter by ingredients
        dietaryLabels: z.array(z.string()).nullable().default(null), // Filter by dietary labels
        limit: z.number().default(5), // Max number of results
    }),

    // Main execution logic for the tool
    async execute(input) {
        console.log(input); // Log input for debugging
        const { query, cuisine, ingredient, dietaryLabels, limit } =
            input ?? {};

        // Build MongoDB match conditions dynamically based on provided input
        const matchConditions = [];

        if (cuisine) {
            matchConditions.push({
                cuisine: new RegExp(escapeRegex(cuisine), "i"),
            });
        }

        if (Array.isArray(ingredient) && ingredient.length) {
            matchConditions.push({
                "ingredients.name": {
                    $in: ingredient.map((s) => new RegExp(escapeRegex(s), "i")),
                },
            });
        }

        if (Array.isArray(dietaryLabels) && dietaryLabels.length) {
            matchConditions.push({ dietaryLabels: { $all: dietaryLabels } });
        }

        if (query) {
            const r = new RegExp(escapeRegex(query), "i");
            matchConditions.push({ $or: [{ title: r }, { description: r }] });
        }

        // If no filters provided, return empty array
        if (!matchConditions.length) return [];

        // Build aggregation pipeline to fetch matching recipes
        const pipeline = [
            { $match: { $and: matchConditions } },
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

        // Execute aggregation pipeline and return results
        const results = await Recipe.aggregate(pipeline).exec();
        console.log(results); // Log results for debugging
        return results;
    },
});

export default searchRecipesTool;
