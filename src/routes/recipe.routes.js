import { Router } from "express";
const recipeRouter = Router();
import {
    addRecipe,
    getAllRecipes,
    getRecipeById,
    updateRecipe,
    deleteRecipe,
} from "../controllers/recipe.controllers.js";
import { validateRecipe } from "../middlewares/recipe.middlewares.js";



// CREATE (with validation)
recipeRouter.post("/recipes", validateRecipe, addRecipe);

// READ
recipeRouter.get("/recipes", getAllRecipes);

// when a user clicks on a recipe from the list to view the detailed recipe
recipeRouter.get("/recipes/:id", getRecipeById);

// UPDATE (with validation)
recipeRouter.put("/recipes/:id", validateRecipe, updateRecipe);

// DELETE
recipeRouter.delete("/recipes/:id", deleteRecipe);

export default recipeRouter;
