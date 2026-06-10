import { Router } from "express";
import {
    addRecipe,
    getAllRecipes,
    getRecipeById,
    updateRecipe,
    deleteRecipe,
    handleGetTrendingRecipes,
    handleGetFreshRecipes,
    handleGetQuickRecipes,
    handleGetPremiumRecipes,
    handleGetRecommendedRecipes,
    handleGetTrendingPremiumRecipes,
    handleLikeRecipe,
    handleUnlikeRecipe,
    handleGetSearchRecipe,
    getSimilarRecipes,
    addReview,
    updateReview,
    deleteReview,
    getAllReviews,
} from "../controllers/recipe.controllers.js";
import {
    parseRecipeJsonFields,
    validateRecipe,
} from "../middlewares/recipe.middlewares.js";
import { isAuthorized, isLoggedIn } from "../middlewares/auth.middlewares.js";
import upload from "../middlewares/multer.middlewares.js";
import { rateLimiter } from "../middlewares/rateLimiter.middleware.js";

const recipeRoutes = Router();

recipeRoutes
    .route("/")
    .post(
        isLoggedIn,
        rateLimiter(60, 5),
        isAuthorized("CHEF"),
        upload.fields([
            { name: "thumbnailFile", maxCount: 1 }, // single file
            { name: "stepImages", maxCount: 20 }, // array of files
        ]),
        // validateRecipeFiles,
        parseRecipeJsonFields,
        validateRecipe,
        addRecipe
    )
    .get(rateLimiter(60, 60), getAllRecipes);

recipeRoutes.route("/trending").get(rateLimiter(60, 60), handleGetTrendingRecipes);
recipeRoutes.route("/fresh").get(rateLimiter(60, 60), handleGetFreshRecipes);
recipeRoutes.route("/quick").get(rateLimiter(60, 60), handleGetQuickRecipes);
recipeRoutes.route("/premium").get(rateLimiter(60, 60), handleGetPremiumRecipes);
recipeRoutes.route("/recommended").get(isLoggedIn, rateLimiter(60, 60), handleGetRecommendedRecipes);
recipeRoutes.route("/trending-premium").get(rateLimiter(60, 60), handleGetTrendingPremiumRecipes);

recipeRoutes.route("/search").get(rateLimiter(60, 50), handleGetSearchRecipe);
recipeRoutes.route("/like/:id").get(isLoggedIn, rateLimiter(60, 30), handleLikeRecipe);
recipeRoutes.route("/unlike/:id").get(isLoggedIn, rateLimiter(60, 30), handleUnlikeRecipe);
recipeRoutes.route("/similar/:id").get(isLoggedIn, rateLimiter(60, 30), getSimilarRecipes);

recipeRoutes
    .route("/:recipeId/reviews")
    .get(rateLimiter(60, 30), getAllReviews)
    .post(
        isLoggedIn,
        rateLimiter(60, 10),
        addReview
    )
    .put(
        isLoggedIn,
        rateLimiter(60, 10),
        updateReview
    )
    .delete(
        isLoggedIn,
        rateLimiter(60, 15),
        deleteReview
    );

recipeRoutes
    .route("/:id")
    .get(isLoggedIn, rateLimiter(60, 30), getRecipeById)
    .put(isLoggedIn, rateLimiter(60, 10), isAuthorized("CHEF"), validateRecipe, updateRecipe)
    .delete(isLoggedIn, rateLimiter(60, 10), isAuthorized("CHEF"), deleteRecipe);

export default recipeRoutes;
