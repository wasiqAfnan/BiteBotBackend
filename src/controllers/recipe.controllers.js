import { Recipe } from "../models/recipes.models.js";

const sayhello = async (req, res) => {
    try{
        res.send("Welcome to bitebot");
    }catch(err){
        console.log(err);
    }
};

// CREATE Recipe
const addRecipe = async (req, res) => {
    try {
        const recipe = await Recipe.create(req.body);
        return res.status(201).json({
            success: true,
            message: "Recipe added successfully",
            data: recipe,
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message,
        });
    }
};

// READ All Recipes
const getAllRecipes = async (req, res) => {
    try {
        // const recipes = await Recipe.find().populate("chefId", "name email");
        const recipes = await Recipe.find();
        return res.status(200).json({
            success: true,
            count: recipes.length,
            data: recipes,
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

// READ Single Recipe
const getRecipeById = async (req, res) => {
    try {
        // const recipe = await Recipe.findById(req.params.id).populate("chefId", "name email");
        const recipe = await Recipe.findById(req.params.id);
        if (!recipe) {
            return res.status(404).json({
                success: false,
                message: "Recipe not found",
            });
        }
        return res.status(200).json({
            success: true,
            data: recipe,
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

// UPDATE Recipe
const updateRecipe = async (req, res) => {
    try {
        const recipe = await Recipe.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true,
        });
        if (!recipe) {
            return res.status(404).json({
                success: false,
                message: "Recipe not found",
            });
        }
        return res.status(200).json({
            success: true,
            message: "Recipe updated successfully",
            data: recipe,
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message,
        });
    }
};

// DELETE Recipe
const deleteRecipe = async (req, res) => {
    try {
        const recipe = await Recipe.findByIdAndDelete(req.params.id);
        if (!recipe) {
            return res.status(404).json({
                success: false,
                message: "Recipe not found",
            });
        }
        return res.status(200).json({
            success: true,
            message: "Recipe deleted successfully",
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

export {
    sayhello,
    addRecipe,
    getAllRecipes,
    getRecipeById,
    updateRecipe,
    deleteRecipe,
};







