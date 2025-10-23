import { Router } from "express";
import {
    addRecipe,
    getAllRecipes,
    getRecipeById,
    updateRecipe,
    deleteRecipe,
} from "../controllers/recipe.controllers.js";
import {
    isSubscribed,
    validateRecipe,
} from "../middlewares/recipe.middlewares.js";
import { isAuthorized, isLoggedIn } from "../middlewares/auth.middlewares.js";

const recipeRouter = Router();

recipeRouter
    .route("/")
    .post(isLoggedIn, isAuthorized("CHEF"), validateRecipe, addRecipe)
    .get(getAllRecipes);

recipeRouter
    .route("/:id")
    .get(isLoggedIn, isSubscribed, getRecipeById)
    .put(validateRecipe, updateRecipe)
    .delete(deleteRecipe);

export default recipeRouter;
