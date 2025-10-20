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
        ingredient: z.string().nullable().default(null), // fix array
        dietaryLabels: z.array(z.string()).nullable().default(null),
        limit: z.number().default(5),
    }),
    async execute(input) {
        const { query, cuisine, ingredient, dietaryLabels, limit } =
            input ?? {};
        if (!query && !cuisine && !ingredient && !dietaryLabels) {
            return [];
        }

        const match = {};

        if (query) {
            const r = new RegExp(escapeRegex(query), "i");
            match.$or = [{ title: r }, { description: r }];
        }

        if (cuisine) {
            match.cuisine = new RegExp(escapeRegex(cuisine), "i");
        }

        if (ingredient) {
            if (Array.isArray(ingredient)) {
                match["ingredients.name"] = {
                    $in: ingredient.map((s) => new RegExp(escapeRegex(s), "i")),
                };
            } else {
                match["ingredients.name"] = new RegExp(
                    escapeRegex(ingredient),
                    "i"
                );
            }
        }

        if (Array.isArray(dietaryLabels) && dietaryLabels.length) {
            match.dietaryLabels = { $in: dietaryLabels };
        }

        const pipeline = [
            { $match: match },
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

        return await Recipe.aggregate(pipeline).exec();
    },
});

export default searchRecipesTool;
