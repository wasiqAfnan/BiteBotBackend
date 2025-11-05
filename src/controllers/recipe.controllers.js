import { Recipe } from "../models/recipe.models.js";
import { ApiResponse, ApiError } from "../utils/index.js";

// CREATE Recipe
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

// READ All Recipes (Not in used)
const getAllRecipes = async (req, res, next) => {
    try {
        const startIndex = parseInt(req.query.startIndex) || 0;
        const limit = parseInt(req.query.limit) || 8;

        // Multiple filter support
        const filters = {
            trending: req.query.trending === "true",
            fresh: req.query.fresh === "true",
            quick: req.query.quick === "true",
            recommended: req.query.recommended === "true",
            premium: req.query.premium === "true",
            cuisine: req.query.cuisine,
            dietaryPreference: req.query.dietaryPreference
                ? req.query.dietaryPreference
                      .split(",")
                      .filter((pref) => pref.trim() !== "")
                      .map((pref) => pref.trim().toLowerCase())
                : [],
            minPrice: req.query.minPrice
                ? parseFloat(req.query.minPrice)
                : null,
            maxPrice: req.query.maxPrice
                ? parseFloat(req.query.maxPrice)
                : null,
            rating: req.query.rating ? parseFloat(req.query.rating) : null, // single rating value
        };

        // Pagination validation
        if (startIndex < 0 || limit < 1) {
            return next(new ApiError(400, "Invalid pagination parameters"));
        }

        let pipeline = [];
        let matchStage = {};

        // Premium recipes only
        if (filters.premium) {
            matchStage.isPremium = true;
        }

        // Recommended filter with soft matching
        if (filters.recommended) {
            if (filters.cuisine)
                matchStage.cuisine = {
                    $regex: new RegExp(filters.cuisine, "i"),
                };

            if (filters.dietaryPreference.length > 0)
                matchStage.dietaryLabels = {
                    $in: filters.dietaryPreference,
                };
        }

        // Cuisine filter
        if (filters.cuisine && !filters.recommended) {
            matchStage.cuisine = filters.cuisine;
        }

        // Dietary Preference filter
        if (filters.dietaryPreference.length > 0 && !filters.recommended) {
            matchStage.dietaryLabels = { $in: filters.dietaryPreference };
        }

        // Trending filter (last 30 days)
        if (filters.trending) {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            matchStage.createdAt = { $gte: thirtyDaysAgo };
        }

        // QUICK RECIPES: Auto filter for fast recipes (no frontend input)
        if (filters.quick) {
            matchStage.totalCookingTime = { $lte: 30 }; // recipes ≤ 30 mins
        }

        // Add match stage if conditions exist
        if (Object.keys(matchStage).length > 0) {
            pipeline.push({ $match: matchStage });
        }

        // Add all calculated fields upfront (industry standard)
        pipeline.push({
            $addFields: {
                // Total ingredient price
                totalPrice: {
                    $sum: {
                        $map: {
                            input: { $ifNull: ["$ingredients", []] },
                            as: "ingredient",
                            in: { $ifNull: ["$$ingredient.marketPrice", 0] },
                        },
                    },
                },
                // Average rating (0 if no reviews)
                avgRating: {
                    $ifNull: [{ $avg: "$reviews.rating" }, 0],
                },
                // Like count (needed for trending/premium/recommended sorting)
                likeCountNum: {
                    $size: { $ifNull: ["$likeCount", []] },
                },
            },
        });

        // Filter by price range if provided
        if (filters.minPrice !== null || filters.maxPrice !== null) {
            let priceMatchStage = {};

            if (filters.minPrice !== null && filters.maxPrice !== null) {
                // Both min and max provided
                priceMatchStage.totalPrice = {
                    $gte: filters.minPrice,
                    $lte: filters.maxPrice,
                };
            } else if (filters.minPrice !== null) {
                // Only min provided
                priceMatchStage.totalPrice = { $gte: filters.minPrice };
            } else {
                // Only max provided
                priceMatchStage.totalPrice = { $lte: filters.maxPrice };
            }

            pipeline.push({ $match: priceMatchStage });
        }

        // Rating filter (recipes with average rating >= given rating)
        if (filters.rating !== null) {
            pipeline.push({
                $match: {
                    avgRating: { $gte: filters.rating },
                },
            });
        }

        // Sorting logic
        let sortStage = {};
        if (filters.trending || filters.premium || filters.recommended) {
            sortStage = { likeCountNum: -1, createdAt: -1 };
        } else if (filters.quick) {
            sortStage = { totalCookingTime: 1, createdAt: -1 };
        } else if (filters.fresh) {
            sortStage = { createdAt: -1 };
        }

        // Add sort stage if conditions exist
        if (Object.keys(sortStage).length > 0) {
            pipeline.push({ $sort: sortStage });
        }

        // Pagination
        pipeline.push({ $skip: startIndex });
        pipeline.push({ $limit: limit });

        // Execute aggregation
        const recipes = await Recipe.aggregate(pipeline);
        const count = recipes.length;

        // Final response
        return res.status(200).json(
            new ApiResponse(200, "Recipes fetched successfully", {
                count,
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
        const recipe = await Recipe.findById(req.params.id).populate("chefId");

        if (!recipe) {
            throw new ApiError(404, "Recipe not found");
        }

        // Premium Access Logic
        const chefId = recipe.chefId._id
            ? recipe.chefId._id.toString()
            : recipe.chefId.toString();

        const userId = req.user?._id?.toString();

        // Allow access if user is the chef (recipe owner)
        const isOwner = userId === chefId;

        // Check if user subscribed to chef
        const isSubscribed = req.user.profile.subscribed
            .map((id) => id.toString())
            .includes(chefId);

        if (recipe.isPremium && !isOwner && !isSubscribed) {
            console.log(chefId);
            throw new ApiError(
                403,
                "Access denied: Premium Subscription Required",
                chefId
            );
        }

        return res
            .status(200)
            .json(new ApiResponse(200, "Recipe found", recipe));
    } catch (error) {
        console.log("Some Error Occured: ", error);
        return next(
            error instanceof ApiError
                ? error
                : new ApiError(
                      500,
                      "Something went wrong during fetching recipe"
                  )
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
            throw new ApiError(404, "Recipe not found");
        }

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

const HandleGetTrendingRecipes = async (req, res, next) => {
    try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const trendingRecipes = await Recipe.aggregate([
        // Only recipes created in last 30 days
        {
            $match: {
            createdAt: { $lte: thirtyDaysAgo }
            }
        },

        // Compute like count
        {
            $addFields: {
            likeCountTotal: { $size: { $ifNull: ["$likeCount", []] } }
            }
        },

        // Sort by likeCount desc
        { $sort: { likeCountTotal: -1, createdAt: -1 } },

        // Limit to 10
        { $limit: 10 },
    ]);
console.log(trendingRecipes)

    return res.status(200).json(new ApiResponse(200, "Trending recipes fetched successfully", trendingRecipes));

  } catch (error) {
    console.log("Error Occured While Fetching Trending Recipes: ", error);

    return next(
        error.instanceof(ApiError)
            ? error
            : new ApiError(500, "Something went wrong fetching trending recipes")
    );
  }
};
const HandleGetFreshRecipes = async (req, res, next) => {};
const HandleGetQuickRecipes = async (req, res, next) => {};
const HandleGetPremiumRecipes = async (req, res, next) => {};
const HandleGetRecommendedRecipes = async (req, res, next) => {};

export { 
    addRecipe, 
    getAllRecipes, 
    getRecipeById, 
    updateRecipe, 
    deleteRecipe,
    HandleGetTrendingRecipes,
    HandleGetFreshRecipes,
    HandleGetQuickRecipes,
    HandleGetPremiumRecipes,
    HandleGetRecommendedRecipes
};
