function normalizeFinalOutput(finalOutput) {
    if (!finalOutput) {
        return { reply: "Output is empty", recipes: [] };
    }

    if (typeof finalOutput === "object" && finalOutput !== null) {
        const reply =
            (finalOutput.reply && String(finalOutput.reply)) ||
            "Output is empty";
        const recipes = Array.isArray(finalOutput.recipes)
            ? finalOutput.recipes
            : [];
        return { reply, recipes };
    }

    if (typeof finalOutput === "string") {
        return { message: finalOutput, recipes: [] };
    }

    return { message: String(finalOutput), recipes: [] };
}

export default normalizeFinalOutput;
