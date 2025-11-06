import recipeAgent from "../ai/recipeAgent.js";
import { ApiError, ApiResponse } from "../utils/index.js";
import { run } from "@openai/agents";
import normalizeFinalOutput from "../utils/normalizeLLMOutput.js";

export async function recipeChat(req, res, next) {
    try {
        const { userInput } = req.body;
        if (!userInput) {
            throw new ApiError(400, "No user input provided");
        }

        const result = await run(recipeAgent, userInput);
        const normalized = normalizeFinalOutput(result.finalOutput);

        return res
            .status(200)
            .json(new ApiResponse(200, "Agent response received", normalized));
    } catch (error) {
        console.error(error);
        return next(
            new ApiError(500, `chatbot.controller :: recipeChat: ${error}`)
        );
    }
}
