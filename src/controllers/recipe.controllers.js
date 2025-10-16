import { Recipe } from "../models/recipe.models.js";
import { ApiResponse, ApiError } from "../utils/index.js";

// CREATE Recipe (Ok)
const addRecipe = async (req, res, next) => {
    try {
        const payload = {
            ...req.body, // all validated, allowed fields
            chefId: req.user._id, // override or inject server‐set field
        };
        const newRecipe = await Recipe.create(payload);

        // respond with the newly created recipe object
        return res
            .status(201)
            .json(new ApiResponse(201, "Recipe added successfully", newRecipe));
    } catch (error) {
        console.log("Some Error Occured: ", error);
        // If the error is already an instance of ApiError, pass it to the error handler
        if (error instanceof ApiError) {
            return next(error);
        }

        // For all other errors, send a generic error message
        return next(
            new ApiError(500, "Something went wrong during recipe creation")
        );
    }
};

// READ All Recipes (Not Implemented)
const getAllRecipes = async (req, res, next) => {
    try {
        // Fetch all recipes sorted by newest first
        // const recipes = await Recipe.find().sort({ createdAt: -1 }).lean();

        // Extract pagination parameters from query string
        const startIndex = parseInt(req.query.startIndex) || 0;
        const limit = parseInt(req.query.limit) || 10;

        // Validate pagination parameters
        if (startIndex < 0 || limit < 1) {
            return next(new ApiError(400, "Invalid pagination parameters"));
        }

        // Fetch recipes with pagination
        const recipes = await Recipe.find()
            .sort({ createdAt: 1 })
            .skip(startIndex)
            .limit(limit)
            .lean();
        
        return res.status(200).json(
            new ApiResponse(200, "Recipes fetched successfully", {
                recipes,
            })
        );
    } catch (error) {
        console.log("GetAllRecipes Error:", error);
        return next(
            error instanceof ApiError
                ? error
                : new ApiError(500, "Something went wrong fetching recipes")
        );
    }
};

// READ Single Recipe (OK)
const getRecipeById = async (req, res, next) => {
    try {
        // const recipe = await Recipe.findById(req.params.id).populate("chefId", "name email");
        const recipe = await Recipe.findById(req.params.id);
        if (!recipe) {
            // return res.status(404).json({
            //     success: false,
            //     message: "Recipe not found",
            // });

            return res
                .status(404)
                .json(new ApiResponse(404, "Recipe not found"));
        }
        // return res.status(200).json({
        //     success: true,
        //     data: recipe,
        // });

        return res
            .status(200)
            .json(new ApiResponse(200, "Recipe found", recipe));
    } catch (error) {
        console.log("Some Error Occured: ", error);
        // If the error is already an instance of ApiError, pass it to the error handler
        if (error instanceof ApiError) {
            return next(error);
        }

        // For all other errors, send a generic error message
        return next(
            new ApiError(500, "Something went wrong during fetching recipe")
        );
    }
};

// UPDATE Recipe (Check Required)
const updateRecipe = async (req, res, next) => {
    try {
        const recipe = await Recipe.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true,
        });
        if (!recipe) {
            // return res.status(404).json({
            //     success: false,
            //     message: "Recipe not found",
            // });
            return res
                .status(404)
                .json(new ApiResponse(404, "Recipe not found"));
        }
        // return res.status(200).json({
        //     success: true,
        //     message: "Recipe updated successfully",
        //     data: recipe,
        // });

        return res
            .status(200)
            .json(new ApiResponse(200, "Recipe updated successfully", recipe));
    } catch (error) {
        console.log("Some Error Occured: ", error);
        // If the error is already an instance of ApiError, pass it to the error handler
        if (error instanceof ApiError) {
            return next(error);
        }

        // For all other errors, send a generic error message
        return next(
            new ApiError(500, "Something went wrong during recipe update")
        );
    }
};

// DELETE Recipe (OK)
const deleteRecipe = async (req, res, next) => {
    try {
        const recipe = await Recipe.findByIdAndDelete(req.params.id);
        if (!recipe) {
            // return res.status(404).json({
            //     success: false,
            //     message: "Recipe not found",
            // });
            return res
                .status(404)
                .json(new ApiResponse(404, "Recipe not found"));
        }
        // return res.status(200).json({
        //     success: true,
        //     message: "Recipe deleted successfully",
        // });
        return res
            .status(200)
            .json(new ApiResponse(200, "Recipe deleted successfully"));
    } catch (error) {
        console.log("Some Error Occured: ", error);
        // If the error is already an instance of ApiError, pass it to the error handler
        if (error instanceof ApiError) {
            return next(error);
        }

        // For all other errors, send a generic error message
        return next(
            new ApiError(500, "Something went wrong during recipe deletion")
        );
    }
};

export { addRecipe, getAllRecipes, getRecipeById, updateRecipe, deleteRecipe };
