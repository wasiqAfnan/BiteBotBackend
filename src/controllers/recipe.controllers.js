import mongoose from "mongoose";
import Recipe from "../models/recipe.models.js";
import { ApiResponse, ApiError } from "../utils/index.js";
import User from "../models/user.models.js";
import { similaritySearch } from "../services/vectorService.js";
import { recipeQueue } from "../configs/queue.config.js";
import UserCacheService from "../services/cache/user.cache.js";
import RecipeCacheService from "../services/cache/recipe.cache.js";
import { recalculateRecipeRatings } from "../utils/recalculateRecipeRatings.js";

// create Recipe
const addRecipe = async (req, res, next) => {
    try {
        // Step 1: Extract files
        const thumbnailFile = req.files?.thumbnailFile?.[0];
        const stepImagesFiles = req.files?.stepImages || [];

        // Step 2: Validate images
        // Thumbnail validation
        if (!thumbnailFile) {
            throw new ApiError(400, "Thumbnail image is required");
        }
        // Steps images validation
        if (stepImagesFiles.length === 0) {
            throw new ApiError(400, "Step images are required");
        }
        // Match step count with image count
        if (stepImagesFiles.length !== req.body.steps.length) {
            throw new ApiError(
                400,
                `Mismatch: Expected ${steps.length} step images, received ${stepImagesFiles.length}`
            );
        }

        // Step 3: Add recipe to queue
        await recipeQueue.add(
            "recipe-queue",
            {
                type: "ADD",
                data: req.body,
                files: {
                    thumbnail: thumbnailFile.path,
                    steps: stepImagesFiles.map((f) => f.path),
                },
                userId: req.user._id.toString(),
            },
            { removeOnComplete: true, removeOnFail: true }
        );

        // Step 4: Return response immediately
        return res
            .status(202)
            .json(
                new ApiResponse(
                    202,
                    "Recipe is being processed and will be available soon"
                )
            );
    } catch (err) {
        console.error("Error adding recipe:", err);
        err instanceof ApiError
            ? next(err)
            : next(new ApiError(500, "Something went wrong during recipe creation"));
    }
};

// READ All Recipes (Not in use)
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
            matchStage.createdAt = { $lte: thirtyDaysAgo };
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
                likesNum: {
                    $size: { $ifNull: ["$likes", []] },
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
            sortStage = { likesNum: -1, createdAt: -1 };
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

        // Standardization of projection for feed/card views
        pipeline.push({
            $project: {
                reviews: 0,
                steps: 0,
                externalMediaLinks: 0,
                ingredients: 0,
            },
        });

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
        console.log("Error while fetching all recipes:", error);
        return next(
            error instanceof ApiError
                ? error
                : new ApiError(500, "Something went wrong fetching recipes")
        );
    }
};

const getRecipeById = async (req, res, next) => {
    try {
        const recipeId = req.params.id;
        let recipe = await RecipeCacheService.getRecipeDetail(recipeId);

        if (!recipe) {
            recipe = await Recipe.findOne({
                _id: recipeId,
                isActive: true,
            }).populate("chefId", "profile.name profile.avatar chefProfile.averageRating chefProfile.reviews");

            if (!recipe) {
                throw new ApiError(404, "Recipe not found");
            }

            await RecipeCacheService.updateRecipeDetail(recipeId, recipe.toObject());
            recipe = recipe.toObject();
        }

        const chefId = recipe.chefId._id.toString()
        const userId = req.user?._id?.toString();

        // Allow access if user is the chef (recipe owner)
        const isOwner = userId === chefId;

        // Check if user subscribed to chef
        const isSubscribed = req.user?.profile?.subscribed
            ?.map((id) => id.toString())
            .includes(chefId);

        if (recipe.isPremium && !isOwner && !isSubscribed) {
            // console.log(chefId);
            throw new ApiError(
                403,
                "Access denied: Premium Subscription Required",
                chefId
            );
        }

        /* This part deals with updating the user's suggestion queue */
        // normalize dietary labels so order differences don't create duplicates
        const sortedDietaryLabels = [...(recipe.dietaryLabels || [])].sort();

        // remove existing values
        await User.findByIdAndUpdate(userId, {
            $pull: {
                cuisineSuggested: recipe.cuisine,
                dietaryLabelsSuggested: sortedDietaryLabels,
            },
        });

        // push latest values
        await User.findByIdAndUpdate(userId, {
            $push: {
                cuisineSuggested: {
                    $each: [recipe.cuisine],
                    $slice: -10,
                },
                dietaryLabelsSuggested: {
                    $each: [sortedDietaryLabels],
                    $slice: -10,
                },
            },
        });

        await UserCacheService.invalidatePreferences(userId);
        await UserCacheService.invalidateProfile(userId);

        return res
            .status(200)
            .json(new ApiResponse(200, "Recipe found", recipe));
    } catch (error) {
        console.log("Error while fetching single recipe: ", error);
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

const updateRecipe = async (req, res, next) => {
    try {
        const recipeId = req.params.id;
        const recipe = await Recipe.findOneAndUpdate(
            { _id: recipeId, isActive: true },
            req.body,
            {
                new: true,
                runValidators: true,
            }
        ).populate("chefId", "profile.name profile.avatar chefProfile.averageRating chefProfile.reviews");

        if (!recipe) {
            throw new ApiError(404, "Recipe not found");
        }

        // Update detail cache with fresh populated data; invalidate feed caches
        await Promise.all([
            RecipeCacheService.updateRecipeDetail(recipeId, recipe.toObject()),
            RecipeCacheService.invalidateAllFeeds(),
            UserCacheService.invalidateChefRecipes(recipe.chefId)
        ]);

        await recipeQueue.add(
            "recipe-queue",
            {
                type: "UPDATE",
                recipe: recipe.toObject(),
            },
            { removeOnComplete: true, removeOnFail: true }
        );

        return res
            .status(200)
            .json(new ApiResponse(200, "Recipe updated successfully", recipe));
    } catch (error) {
        console.log("Error while updating recipe:", error);
        return next(
            error instanceof ApiError
                ? error
                : new ApiError(500, "Something went wrong during recipe update")
        );
    }
};

const deleteRecipe = async (req, res, next) => {
    try {
        const recipeId = req.params.id;
        const recipe = await Recipe.findOneAndUpdate(
            { _id: recipeId, isActive: true },
            { $set: { isActive: false } },
            { new: true }
        );
        if (!recipe) {
            throw new ApiError(404, "Recipe not found");
        }

        // Invalidate all recipe keys + feed caches
        await Promise.all([
            RecipeCacheService.invalidateRecipeAllKeys(recipeId),
            RecipeCacheService.invalidateAllFeeds(),
            UserCacheService.invalidateChefRecipes(recipe.chefId)
        ]);

        await recipeQueue.add(
            "recipe-queue",
            {
                type: "DELETE",
                recipe: recipe.toObject(),
            },
            { removeOnComplete: true, removeOnFail: true }
        );

        return res
            .status(200)
            .json(new ApiResponse(200, "Recipe deleted successfully"));
    } catch (error) {
        console.log("Error while deleting recipe:", error);
        return next(
            error instanceof ApiError
                ? error
                : new ApiError(500, "Something went wrong during recipe deletion")
        );
    }
};

const handleGetTrendingRecipes = async (req, res, next) => {
    try {
        // const thirtyDaysAgo = new Date();
        // thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const limit = Number(req.query.limit) || 12;

        let trendingRecipes = await RecipeCacheService.getTrendingFeed(limit);

        if (!trendingRecipes) {
            trendingRecipes = await Recipe.aggregate([
                // Only recipes created in last 30 days
                // {
                //     $match: {
                //         createdAt: { $gte: thirtyDaysAgo },
                //     },
                // },

                // Consider only active recipes
                {
                    $match: {
                        isActive: true,
                    },
                },

                // Compute like count
                {
                    $addFields: {
                        likesTotal: {
                            $size: { $ifNull: ["$likes", []] },
                        },
                    },
                },

                // Sort by likes desc
                { $sort: { likesTotal: -1, createdAt: -1 } },

                // Limit to 10
                { $limit: limit },

                {
                    $project: {
                        reviews: 0,
                        steps: 0,
                        externalMediaLinks: 0,
                        ingredients: 0,
                    },
                },
            ]);



            await RecipeCacheService.updateTrendingFeed(limit, trendingRecipes);
        }
        // console.log(likesTotal);
        // console.log(trendingRecipes);

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    "Trending recipes fetched successfully",
                    trendingRecipes
                )
            );
    } catch (error) {
        console.log("Error while fetching trending recipes:", error);
        return next(
            error instanceof ApiError
                ? error
                : new ApiError(500, "Something went wrong fetching trending recipes")
        );
    }
};

const handleGetFreshRecipes = async (req, res, next) => {
    try {
        const limit = Number(req.query.limit) || 12;

        let freshRecipes = await RecipeCacheService.getFreshFeed(limit);

        if (!freshRecipes) {
            freshRecipes = await Recipe.aggregate([
                // Consider only active recipes
                {
                    $match: {
                        isActive: true,
                    },
                },
                {
                    $sort: { createdAt: -1 },
                },
                {
                    $limit: limit,
                },
                {
                    $project: {
                        reviews: 0,
                        steps: 0,
                        externalMediaLinks: 0,
                        ingredients: 0,
                    },
                },
            ]);



            await RecipeCacheService.updateFreshFeed(limit, freshRecipes);
        }

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    "Fresh & New recipes fetched successfully",
                    freshRecipes
                )
            );
    } catch (error) {
        console.log("Error while fetching fresh recipes:", error);
        return next(
            error instanceof ApiError
                ? error
                : new ApiError(500, "Something went wrong fetching fresh recipes")
        );
    }
};

const handleGetQuickRecipes = async (req, res, next) => {
    try {
        const limit = Number(req.query.limit) || 12;
        const maxTime = Number(req.query.maxTime);

        let quickRecipes = await RecipeCacheService.getQuickFeed(limit, maxTime);

        if (!quickRecipes) {
            const pipeline = [];

            // If maxTime is sent from frontend → apply filter
            if (maxTime !== null && !isNaN(maxTime)) {
                pipeline.push({
                    $match: {
                        totalCookingTime: { $lte: maxTime },
                    },
                });
            }

            pipeline.push(
                // Consider only active recipes
                {
                    $match: {
                        isActive: true,
                    },
                },
                { $sort: { totalCookingTime: 1 } },
                { $limit: limit },
                {
                    $project: {
                        reviews: 0,
                        steps: 0,
                        externalMediaLinks: 0,
                        ingredients: 0,
                    },
                }
            );

            quickRecipes = await Recipe.aggregate(pipeline);



            // console.log(quickRecipes);
            await RecipeCacheService.updateQuickFeed(limit, maxTime, quickRecipes);
        }

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    "Quick & Easy recipes fetched successfully",
                    quickRecipes
                )
            );
    } catch (error) {
        console.log("Error while fetching quick recipes:", error);
        return next(
            error instanceof ApiError
                ? error
                : new ApiError(
                    500,
                    "Something went wrong fetching quick recipes"
                )
        );
    }
};

const handleGetPremiumRecipes = async (req, res, next) => {
    try {
        const limit = Number(req.query.limit) || 12;

        let premiumRecipes = await RecipeCacheService.getPremiumFeed(limit);
        if (!premiumRecipes) {
            premiumRecipes = await Recipe.aggregate([
                {
                    $match: {
                        isPremium: true,
                        isActive: true,
                    },
                },
                { $limit: limit },
                {
                    $project: {
                        reviews: 0,
                        steps: 0,
                        externalMediaLinks: 0,
                        ingredients: 0,
                    },
                },
            ]);



            await RecipeCacheService.updatePremiumFeed(limit, premiumRecipes);
        }

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    "Premium recipes fetched successfully",
                    premiumRecipes
                )
            );
    } catch (error) {
        console.log("Error while fetching premium recipes:", error);
        return next(
            error instanceof ApiError
                ? error
                : new ApiError(
                    500,
                    "Something went wrong fetching premium recipes"
                )
        );
    }
};

const handleGetRecommendedRecipes = async (req, res, next) => {
    try {
        const limit = Number(req.query.limit) || 12;
        const userId = req?.user?._id?.toString();

        let recommendedRecipes = await RecipeCacheService.getRecommendedFeed(userId, limit);
        if (!recommendedRecipes) {
            // Get the logged-in user's preferences
            const { cuisine, dietaryLabels } = req?.user?.profile || {};
            const cuisineSuggested = req?.user?.cuisineSuggested || [];
            const dietaryLabelsSuggested = req?.user?.dietaryLabelsSuggested || [];

            // flatten + merge
            const allCuisines = [cuisine, ...(cuisineSuggested || [])].filter(
                Boolean
            );
            const allDietary = [
                ...(dietaryLabels || []),
                ...(dietaryLabelsSuggested?.flat() || []),
            ].filter(Boolean);

            // build a single semantic search query string and exclude duplicates
            const searchQuery =
                [...new Set(allCuisines), ...new Set(allDietary)].join(" ") ||
                "Popular";

            // search for similar recipes
            const similarRecipes = await similaritySearch(searchQuery, limit);
            const uuids = similarRecipes.map((item) => item.id);
            recommendedRecipes = await Recipe.find({
                uuid: { $in: uuids },
            }).select("-ingredients -steps -reviews -externalMediaLinks").lean();



            await RecipeCacheService.updateRecommendedFeed(userId, limit, recommendedRecipes);
        }

        // Send success response
        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    "Recommended recipes fetched successfully",
                    recommendedRecipes
                )
            );
    } catch (error) {
        console.log("Error while fetching recommended recipes:", error);
        return next(
            error instanceof ApiError
                ? error
                : new ApiError(
                    500,
                    "Something went wrong fetching recommended recipes"
                )
        );
    }
};

const handleGetTrendingPremiumRecipes = async (req, res, next) => {
    try {
        const limit = Number(req.query.limit) || 4;

        let trendingPremiumRecipes = await RecipeCacheService.getTrendingPremiumFeed(limit);
        if (!trendingPremiumRecipes) {
            trendingPremiumRecipes = await Recipe.aggregate([
                {
                    $match: {
                        isPremium: true,
                        isActive: true,
                    },
                },
                {
                    $addFields: {
                        likesTotal: {
                            $size: { $ifNull: ["$likes", []] },
                        },
                    },
                },
                { $sort: { likesTotal: -1, createdAt: -1 } },
                { $limit: limit },
                {
                    $project: {
                        reviews: 0,
                        steps: 0,
                        externalMediaLinks: 0,
                        ingredients: 0,
                    },
                },
            ]);



            await RecipeCacheService.updateTrendingPremiumFeed(limit, trendingPremiumRecipes);
        }

        // Send success response
        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    "Trending premium recipes fetched successfully",
                    trendingPremiumRecipes
                )
            );
    } catch (error) {
        console.log("Error while fetching trending premium recipes:", error);
        return next(
            error instanceof ApiError
                ? error
                : new ApiError(
                    500,
                    "Something went wrong fetching trending premium recipes"
                )
        );
    }
};

const handleLikeRecipe = async (req, res, next) => {
    try {
        const { id: recipeId } = req.params;
        const user = req.user; // from auth middleware

        const recipe = await Recipe.findById(recipeId);
        if (!recipe) {
            return next(new ApiError(404, "Recipe not found"));
        }
        const alreadyLiked = recipe.likes?.includes(user._id);

        if (alreadyLiked) {
            return res.status(200).json(
                new ApiResponse(200, "Recipe added to favourites", {
                    recipeId,
                    liked: true,
                    totalLikes: recipe.likes.length,
                })
            );
        }
        // Add like atomically + update user favourites atomically
        const [updatedRecipe, updatedUser] = await Promise.all([
            Recipe.findByIdAndUpdate(
                recipeId,
                { $addToSet: { likes: user._id } },
                { new: true }
            ),
            User.findByIdAndUpdate(
                user._id,
                { $addToSet: { favourites: recipeId } },
                { new: true }
            ),
        ]);

        // Invalidate detail cache and feeds; update user caches from fresh DB data
        await Promise.all([
            RecipeCacheService.invalidateRecipeDetail(recipeId),
            RecipeCacheService.invalidateAllFeeds(),
            UserCacheService.updateProfile(user._id, updatedUser),
            UserCacheService.invalidateFavourites(user._id)
        ]);

        return res.status(200).json(
            new ApiResponse(200, "Recipe added to favourites", {
                recipeId,
                liked: true,
                totalLikes: updatedRecipe.likes.length,
            })
        );
    } catch (error) {
        console.log("Error while adding recipe to favourites:", error);
        return next(
            error instanceof ApiError
                ? error
                : new ApiError(
                    500,
                    "Something went wrong while adding recipe to favourites"
                )
        );
    }
};

const handleUnlikeRecipe = async (req, res, next) => {
    try {
        const { id: recipeId } = req.params;
        const user = req.user; // from auth middleware

        const recipe = await Recipe.findById(recipeId);
        if (!recipe) {
            return next(new ApiError(404, "Recipe not found"));
        }

        const alreadyLiked = recipe.likes?.includes(user._id);

        if (!alreadyLiked) {
            return res.status(200).json(
                new ApiResponse(200, "Recipe removed from favourites", {
                    recipeId,
                    liked: false,
                    totalLikes: recipe.likes.length,
                })
            );
        }

        // Remove like atomically + update user favourites atomically
        const [updatedRecipe, updatedUser] = await Promise.all([
            Recipe.findByIdAndUpdate(
                recipeId,
                { $pull: { likes: user._id } },
                { new: true }
            ),
            User.findByIdAndUpdate(
                user._id,
                { $pull: { favourites: recipeId } },
                { new: true }
            ),
        ]);

        // Invalidate detail cache and feeds; update user caches from fresh DB data
        await Promise.all([
            RecipeCacheService.invalidateRecipeDetail(recipeId),
            RecipeCacheService.invalidateAllFeeds(),
            UserCacheService.updateProfile(user._id, updatedUser),
            UserCacheService.invalidateFavourites(user._id)
        ]);

        return res.status(200).json(
            new ApiResponse(200, "Recipe removed from favourites", {
                recipeId,
                liked: false,
                totalLikes: updatedRecipe.likes.length,
            })
        );
    } catch (error) {
        console.log("Error while removing from favourites:", error);
        return next(
            error instanceof ApiError
                ? error
                : new ApiError(
                    500,
                    "Something went wrong while removing from favourites"
                )
        );
    }
};

const handleGetSearchRecipe = async (req, res, next) => {
    try {
        const {
            query,
            cuisine,
            diet,
            rating,
            priceMin,
            priceMax,
            sort,
            premium,
        } = req.query;

        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 12;
        const skip = (page - 1) * limit;

        const pipeline = [];

        // ================= SEARCH =================
        pipeline.push({
            $match: { isActive: true },
        });

        if (query) {
            pipeline.push({
                $match: {
                    $or: [
                        { title: { $regex: query, $options: "i" } },
                        { description: { $regex: query, $options: "i" } },
                        {
                            "steps.instruction": {
                                $regex: query,
                                $options: "i",
                            },
                        },
                    ],
                },
            });
        }

        // CUISINE
        if (cuisine) {
            pipeline.push({
                $match: { cuisine },
            });
        }

        // DIET
        if (diet) {
            const dietArray = diet
                .split(",")
                .map((d) => d.trim())
                .filter(Boolean);

            if (dietArray.length > 0) {
                pipeline.push({
                    $match: {
                        dietaryLabels: { $in: dietArray },
                    },
                });
            }
        }

        // RATING FILTER
        let isAvgRatingComputed = false;

        if (rating) {
            pipeline.push({
                $addFields: {
                    avgRating: {
                        $ifNull: [{ $avg: "$reviews.rating" }, 0],
                    },
                },
            });

            isAvgRatingComputed = true;

            const ratingNum = Number(rating);
            if (!isNaN(ratingNum)) {
                pipeline.push({
                    $match: {
                        avgRating: { $gte: ratingNum },
                    },
                });
            }
        }

        // PRICE FILTER
        if (priceMin || priceMax) {
            pipeline.push({
                $addFields: {
                    totalCost: {
                        $sum: {
                            $map: {
                                input: "$ingredients",
                                as: "ing",
                                in: { $ifNull: ["$$ing.marketPrice", 0] },
                            },
                        },
                    },
                },
            });

            const priceQuery = {};
            const min = Number(priceMin);
            const max = Number(priceMax);

            if (!isNaN(min)) priceQuery.$gte = min;
            if (!isNaN(max)) priceQuery.$lte = max;

            if (Object.keys(priceQuery).length > 0) {
                pipeline.push({
                    $match: {
                        totalCost: priceQuery,
                    },
                });
            }
        }

        if (premium === "true") {
            pipeline.push({
                $match: {
                    isPremium: premium === "true",
                },
            });
        }

        // ================= SORTING =================
        let sortStage = {};

        // Default / Relevance
        if (!sort || sort === "relevance") {
            sortStage = { createdAt: -1 }; // newest first
        }

        // Highest Rated
        if (sort === "rating") {
            // avoid duplicate avgRating computation
            if (!isAvgRatingComputed) {
                pipeline.push({
                    $addFields: {
                        avgRating: {
                            $ifNull: [{ $avg: "$reviews.rating" }, 0],
                        },
                    },
                });
            }

            sortStage = { avgRating: -1 };
        }

        // Most Popular (likes count)
        if (sort === "popularity") {
            pipeline.push({
                $addFields: {
                    likesCount: {
                        $size: { $ifNull: ["$likes", []] },
                    },
                },
            });

            sortStage = { likesCount: -1 };
        }

        // Quickest Recipes
        if (sort === "time") {
            sortStage = { totalCookingTime: 1 };
        }

        // Premium First
        if (sort === "premium") {
            sortStage = { isPremium: -1 };
        }

        // apply sorting
        if (Object.keys(sortStage).length > 0) {
            pipeline.push({
                $sort: sortStage,
            });
        }

        // ================= PAGINATION =================
        pipeline.push({
            $facet: {
                data: [
                    { $skip: skip },
                    { $limit: limit },
                    {
                        $project: {
                            reviews: 0,
                            steps: 0,
                            externalMediaLinks: 0,
                            ingredients: 0,
                        },
                    },
                ],
                totalCount: [{ $count: "count" }],
            },
        });

        const result = await Recipe.aggregate(pipeline);

        const recipes = result[0]?.data || [];
        const total = result[0]?.totalCount[0]?.count || 0;



        res.status(200).json(
            new ApiResponse(200, "Recipes fetched successfully", {
                recipes,
                meta: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                },
            })
        );
    } catch (error) {
        console.log("Error while searching for recipes:", error);
        return next(
            error instanceof ApiError
                ? error
                : new ApiError(
                    500,
                    "Something went wrong while searching for recipes."
                )
        );
    }
};

const getSimilarRecipes = async (req, res, next) => {
    try {
        const limit = Number(req.query.limit) || 12;
        const recipeId = req.params.id;

        const recipe = await Recipe.findOne({
            _id: recipeId,
            isActive: true,
        }).select("cuisine dietaryLabels ingredients.name uuid").lean();

        if (!recipe) {
            throw new ApiError(404, "Recipe not found");
        }

        const searchQuery = `${recipe.cuisine} ${recipe.dietaryLabels.join(" ")} ${recipe.ingredients.map((ing) => ing.name).join(" ")}`;

        const similarRecipes = await similaritySearch(searchQuery, limit + 1);
        const uuids = similarRecipes
            .map((item) => item.id)
            .filter((id) => id !== recipe.uuid)
            .slice(0, limit);
        const recipes = await Recipe.find({
            uuid: { $in: uuids },
        }).select("-ingredients -steps -reviews -externalMediaLinks").lean();



        return res
            .status(200)
            .json(new ApiResponse(200, "Similar recipes found", recipes));
    } catch (error) {
        console.log("Error while fetching similar recipes:", error);
        return next(
            error instanceof ApiError
                ? error
                : new ApiError(
                    500,
                    "Something went wrong while fetching similar recipes."
                )
        );
    }
};

// 1. ADD REVIEW
const addReview = async (req, res, next) => {
    try {
        const { recipeId } = req.params;
        const { rating, message } = req.body;
        const userId = req.user._id;

        // Validation
        if (!mongoose.Types.ObjectId.isValid(recipeId)) {
            throw new ApiError(400, "Invalid recipe ID format");
        }
        if (!rating || rating < 1 || rating > 5) {
            throw new ApiError(400, "Rating is required and must be between 1 and 5");
        }
        if (!message?.trim()) {
            throw new ApiError(400, "Review message is required");
        }
        if (message.length > 1000) {
            throw new ApiError(400, "Message cannot exceed 1000 characters");
        }

        const newReview = {
            userId,
            rating,
            message: message.trim(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        // Atomically push review
        const recipe = await Recipe.findOneAndUpdate(
            {
                _id: recipeId, isActive: true, "reviews.userId": { $ne: userId },
            },
            { $push: { reviews: newReview } },
            { new: true }
        ).populate("chefId", "profile.name profile.avatar chefProfile.averageRating chefProfile.reviews");

        if (!recipe) {
            const exists = await Recipe.exists({
                _id: recipeId,
                isActive: true
            });

            if (!exists) {
                throw new ApiError(404, "Recipe not found");
            }

            throw new ApiError(
                409,
                "You have already reviewed this recipe"
            );
        }

        // User.reviewsGiven
        const updatedReviewer = await User.findByIdAndUpdate(userId, {
            $push: {
                reviewsGiven: {
                    targetType: "Recipe",
                    targetId: recipeId,
                    rating,
                    message: message.trim(),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            },
        }, { new: true }).select("reviewsGiven")
            .populate({
                path: "reviewsGiven.targetId",
                select: "_id profile.name profile.avatar title thumbnail",
            })
            .lean();

        recalculateRecipeRatings(recipe);
        await recipe.save();

        await Promise.all([
            UserCacheService.updateReviewsGiven(userId, updatedReviewer.reviewsGiven),
            RecipeCacheService.updateRecipeDetail(recipeId, recipe.toObject()),
            RecipeCacheService.invalidateRecipeReviews(recipeId),
        ]);

        return res
            .status(201)
            .json(new ApiResponse(201, "Review added successfully"));
    } catch (error) {
        console.error("Error while adding review:", error);
        return next(
            error instanceof ApiError
                ? error
                : new ApiError(500, "Something went wrong while adding review")
        );
    }
};

// UPDATE REVIEW
const updateReview = async (req, res, next) => {
    try {
        const { recipeId } = req.params;
        const { rating, message } = req.body;
        const userId = req.user._id;

        // Validation
        if (!mongoose.Types.ObjectId.isValid(recipeId)) {
            throw new ApiError(400, "Invalid recipe ID format");
        }
        if (!rating || rating < 1 || rating > 5) {
            throw new ApiError(400, "Rating is required and must be between 1 and 5");
        }
        if (message !== undefined) {
            if (!message?.trim()) {
                throw new ApiError(400, "Review message is required");
            }
        }
        if (message?.length > 1000) {
            throw new ApiError(400, "Message cannot exceed 1000 characters");
        }

        const updateFields = {
            "reviews.$.rating": rating,
            "reviews.$.updatedAt": new Date(),
        };

        if (message !== undefined) {
            updateFields["reviews.$.message"] = message.trim();
        }

        // Update rating, message, and updatedAt
        const recipe = await Recipe.findOneAndUpdate(
            {
                _id: recipeId,
                "reviews.userId": userId,
                isActive: true
            },
            {
                $set: updateFields
            },
            {
                new: true
            }
        ).populate("chefId", "profile.name profile.avatar chefProfile.averageRating chefProfile.reviews");

        if (!recipe) {
            const recipeExists = await Recipe.exists({
                _id: recipeId,
                isActive: true
            });

            if (!recipeExists) {
                throw new ApiError(404, "Recipe not found");
            }

            throw new ApiError(404, "Review not found");
        }

        // Keep User.reviewsGiven synchronized
        const userUpdateFields = {
            "reviewsGiven.$[elem].rating": rating,
            "reviewsGiven.$[elem].updatedAt": new Date(),
        };
        if (message !== undefined) {
            userUpdateFields["reviewsGiven.$[elem].message"] = message.trim();
        }

        const updatedReviewer = await User.findByIdAndUpdate(
            userId,
            { $set: userUpdateFields },
            {
                arrayFilters: [
                    {
                        "elem.targetType": "Recipe",
                        "elem.targetId": recipeId,
                    },
                ],
                new: true,
            }
        ).select("reviewsGiven")
            .populate({
                path: "reviewsGiven.targetId",
                select: "_id profile.name profile.avatar title thumbnail",
            })
            .lean();

        recalculateRecipeRatings(recipe);
        await recipe.save();

        await Promise.all([
            UserCacheService.updateReviewsGiven(userId, updatedReviewer.reviewsGiven),
            RecipeCacheService.updateRecipeDetail(recipeId, recipe.toObject()),
            RecipeCacheService.invalidateRecipeReviews(recipeId),
        ]);

        return res
            .status(200)
            .json(new ApiResponse(200, "Review updated successfully"));
    } catch (error) {
        console.error("Error while updating review:", error);
        return next(
            error instanceof ApiError
                ? error
                : new ApiError(500, "Something went wrong while updating review")
        );
    }
};

// DELETE REVIEW
const deleteReview = async (req, res, next) => {
    try {
        const { recipeId } = req.params;
        const userId = req.user._id;

        // Check if recipe exists and isActive
        if (!mongoose.Types.ObjectId.isValid(recipeId)) {
            throw new ApiError(400, "Invalid recipe ID format");
        }

        // pull the user's review
        const recipe = await Recipe.findOneAndUpdate(
            {
                _id: recipeId,
                isActive: true,
                "reviews.userId": userId
            },
            { $pull: { reviews: { userId } } },
            { new: true }
        ).populate("chefId", "profile.name profile.avatar chefProfile.averageRating chefProfile.reviews");

        if (!recipe) {
            const recipeExists = await Recipe.exists({
                _id: recipeId,
                isActive: true
            });

            if (!recipeExists) {
                throw new ApiError(404, "Recipe not found");
            }

            throw new ApiError(404, "Review not found");
        }

        // Keep User.reviewsGiven synchronized
        const updatedReviewer = await User.findByIdAndUpdate(userId, {
            $pull: {
                reviewsGiven: {
                    targetType: "Recipe",
                    targetId: recipeId,
                },
            },
        }, { new: true }).select("reviewsGiven")
            .populate({
                path: "reviewsGiven.targetId",
                select: "_id profile.name profile.avatar title thumbnail",
            })
            .lean();

        recalculateRecipeRatings(recipe);
        await recipe.save();

        await Promise.all([
            UserCacheService.updateReviewsGiven(userId, updatedReviewer.reviewsGiven),
            RecipeCacheService.updateRecipeDetail(recipeId, recipe.toObject()),
            RecipeCacheService.invalidateRecipeReviews(recipeId),
        ]);

        return res
            .status(200)
            .json(new ApiResponse(200, "Review deleted successfully"));
    } catch (error) {
        console.error("Error while deleting review:", error);
        return next(
            error instanceof ApiError
                ? error
                : new ApiError(500, "Something went wrong while deleting review")
        );
    }
};

const getAllReviews = async (req, res, next) => {
    try {
        const { recipeId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        if (!mongoose.Types.ObjectId.isValid(recipeId)) {
            throw new ApiError(400, "Invalid recipe ID format");
        }

        // Cache holds only summary metadata (averageRating, totalReviews, breakdown)
        let summaryData = await RecipeCacheService.getRecipeReviews(recipeId);

        if (!summaryData) {
            const recipe = await Recipe.findOne({
                _id: recipeId,
                isActive: true
            }).select("averageRating reviews.rating").lean();

            if (!recipe) {
                throw new ApiError(404, "Recipe not found or is inactive");
            }

            const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
            const reviewsList = recipe.reviews || [];
            reviewsList.forEach((r) => {
                if (r.rating >= 1 && r.rating <= 5) {
                    breakdown[r.rating]++;
                }
            });

            summaryData = {
                averageRating: recipe.averageRating || 0,
                totalReviews: reviewsList.length,
                breakdown,
            };

            await RecipeCacheService.updateRecipeReviews(recipeId, summaryData);
        }

        // Always fetch paginated reviews from DB (not from cache)
        const recipe = await Recipe.findOne({ _id: recipeId, isActive: true })
            .select("reviews")
            .populate({ path: "reviews.userId", select: "profile.name profile.avatar" })
            .lean();

        const sortedReviews = (recipe?.reviews || []).sort(
            (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        );
        const paginatedReviews = sortedReviews.slice(skip, skip + limit);

        return res.status(200).json(
            new ApiResponse(200, "Review summary fetched successfully", {
                reviews: paginatedReviews,
                meta: {
                    page,
                    limit,
                    totalPages: Math.ceil(summaryData.totalReviews / limit),
                    averageRating: summaryData.averageRating,
                    totalReviews: summaryData.totalReviews,
                    breakdown: summaryData.breakdown,
                }
            })
        );
    } catch (error) {
        console.error("Error while fetching recipe review summary:", error);
        return next(
            error instanceof ApiError
                ? error
                : new ApiError(500, "Something went wrong while fetching recipe review summary")
        );
    }
};

export {
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
};
