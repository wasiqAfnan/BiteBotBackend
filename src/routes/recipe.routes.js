import { Router } from "express";
import {
    addRecipe,
    getAllRecipes,
    getRecipeById,
    updateRecipe,
    deleteRecipe,
} from "../controllers/recipe.controllers.js";
import { validateRecipe } from "../middlewares/recipe.middlewares.js";
import { isAuthorized, isLoggedIn } from "../middlewares/auth.middlewares.js";

const recipeRouter = Router();
// CREATE (with validation)
recipeRouter
    .route("/recipes")
    .post(isLoggedIn, isAuthorized("CHEF"), validateRecipe, addRecipe);

// READ
recipeRouter.route("/recipes").get(isLoggedIn, getAllRecipes);

// when a user clicks on a recipe from the list to view the detailed recipe
recipeRouter.route("/recipes/:id").get(getRecipeById);

// UPDATE (with validation)
recipeRouter.route("/recipes/:id").put(validateRecipe, updateRecipe);

// DELETE
recipeRouter.route("/recipes/:id").delete(deleteRecipe);

export default recipeRouter;
