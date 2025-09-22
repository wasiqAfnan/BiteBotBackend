import { Router } from "express";
const router = Router();
import {
    sayhello,
    addRecipe,
    getAllRecipes,
    getRecipeById,
    updateRecipe,
    deleteRecipe,
} from "../controllers/recipe.controller.js";
import { validateRecipe } from "../middlewares/recipe.middleware.js";



// CREATE (with validation)
router.post("/recipes", validateRecipe, addRecipe);

// READ
router.get("/recipes", getAllRecipes);

// when a user clicks on a recipe from the list to view the detailed recipe
router.get("/recipes/:id", getRecipeById);

// UPDATE (with validation)
router.put("/recipes/:id", validateRecipe, updateRecipe);

// DELETE
router.delete("/recipes/:id", deleteRecipe);

export default router;
