import { Recipe } from "../models/recipe.models.js";
import { ApiResponse, ApiError } from "../utils/index.js";

// CREATE Recipe (Check Required)
const addRecipe = async (req, res) => {
    try {
        const recipe = await Recipe.create(req.body);

        return res
            .status(201)
            .json(new ApiResponse(201, "Recipe added successfully", recipe));
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
const getAllRecipes = async (req, res) => {
    try {
        // const recipes = await Recipe.find().populate("chefId", "name email");
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

// READ Single Recipe (OK)
const getRecipeById = async (req, res) => {
    try {
        // const recipe = await Recipe.findById(req.params.id).populate("chefId", "name email");
        const recipe = await Recipe.findById(req.params.id);
        if (!recipe) {
            // return res.status(404).json({
            //     success: false,
            //     message: "Recipe not found",
            // });

            return res.status(404).json(new ApiResponse(404, "Recipe not found"));
        }
        // return res.status(200).json({
        //     success: true,
        //     data: recipe,
        // });

        return res.status(200).json(new ApiResponse(200, "Recipe found", recipe));
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
const updateRecipe = async (req, res) => {
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
            return res.status(404).json(new ApiResponse(404, "Recipe not found"));
        }
        // return res.status(200).json({
        //     success: true,
        //     message: "Recipe updated successfully",
        //     data: recipe,
        // });

        return res.status(200).json(new ApiResponse(200, "Recipe updated successfully", recipe));
    } catch (error) {
        console.log("Some Error Occured: ", error);
        // If the error is already an instance of ApiError, pass it to the error handler
        if (error instanceof ApiError) {
            return next(error);
        }

        // For all other errors, send a generic error message
        return next(new ApiError(500, "Something went wrong during recipe update"));
    }
};

// DELETE Recipe (OK)
const deleteRecipe = async (req, res) => {
    try {
        const recipe = await Recipe.findByIdAndDelete(req.params.id);
        if (!recipe) {
            // return res.status(404).json({
            //     success: false,
            //     message: "Recipe not found",
            // });
            return res.status(404).json(new ApiResponse(404, "Recipe not found"));
        }
        // return res.status(200).json({
        //     success: true,
        //     message: "Recipe deleted successfully",
        // });
        return res.status(200).json(new ApiResponse(200, "Recipe deleted successfully"));
    } catch (error) {
        console.log("Some Error Occured: ", error);
        // If the error is already an instance of ApiError, pass it to the error handler
        if (error instanceof ApiError) {
            return next(error);
        }

        // For all other errors, send a generic error message
        return next(new ApiError(500, "Something went wrong during recipe deletion"));
    }
};

export { addRecipe, getAllRecipes, getRecipeById, updateRecipe, deleteRecipe };
