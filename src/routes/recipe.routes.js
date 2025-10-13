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
recipeRouter.route("/recipes").post(validateRecipe, addRecipe);

// READ
recipeRouter.route("/recipes").get(getAllRecipes);

// when a user clicks on a recipe from the list to view the detailed recipe
recipeRouter.route("/recipes/:id").get(getRecipeById);

// UPDATE (with validation)
recipeRouter.route("/recipes/:id").put(validateRecipe, updateRecipe);

// DELETE
recipeRouter.route("/recipes/:id").delete(deleteRecipe);

export default recipeRouter;
