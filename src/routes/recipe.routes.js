import { Router } from "express";
import {
    addRecipe,
    getAllRecipes,
    getRecipeById,
    updateRecipe,
    deleteRecipe,
    HandleGetTrendingRecipes,
    HandleGetFreshRecipes,
    HandleGetQuickRecipes,
    HandleGetPremiumRecipes,
    HandleGetRecommendedRecipes,
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

recipeRouter.route("/trending").get(HandleGetTrendingRecipes);
recipeRouter.route("/fresh").get(HandleGetFreshRecipes);
recipeRouter.route("/quick").get(HandleGetQuickRecipes);
recipeRouter.route("/premium").get(HandleGetPremiumRecipes);
recipeRouter.route("/recommended").get(isLoggedIn, HandleGetRecommendedRecipes);

recipeRouter
    .route("/:id")
    .get(isLoggedIn, getRecipeById)
    .put(validateRecipe, updateRecipe)
    .delete(deleteRecipe);

export default recipeRouter;
