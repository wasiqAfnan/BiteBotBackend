import Recipe from "../models/recipe.models.js";
import { ApiResponse, ApiError, uploadImageToCloud, deleteLocalFiles } from "../utils/index.js";
import User from "../models/user.models.js";

// CREATE Recipe
const addRecipe = async (req, res, next) => {
    try {
        /** ============================
         * 1️⃣ Extract files
         * ============================ */
        // const thumbnailFile = req.files?.thumbnailFile?.[0] || null;
        // const stepImagesFiles = req.files?.stepImages || [];
        const thumbnailFile = req.files?.thumbnailFile?.[0];
        const stepImagesFiles = req.files?.stepImages || [];
        // console.log("Got files : ", thumbnailFile, stepImagesFiles);

        /** ============================
         * 2️⃣ Extract sanitized body
         * ============================ */
        const {
            title,
            description,
            ingredients,
            steps, // [{ stepNo, instruction }]
            cuisine,
            dietaryLabels,
            totalCookingTime,
            servings,
            externalMediaLinks,
            isPremium,
        } = req.body;

        /** ============================
         * 3️⃣ Validate images
         * ============================ */

        // Thumbnail validation
        if (!thumbnailFile) {
            throw new ApiError(400, "Thumbnail image is required");
        }

        // Steps images validation
        if (stepImagesFiles.length === 0) {
            throw new ApiError(400, "Step images are required");
        }

        // Match step count with image count
        if (stepImagesFiles.length !== steps.length) {
            throw new ApiError(
                400,
                `Mismatch: Expected ${steps.length} step images, received ${stepImagesFiles.length}`
            );
        }

        /** ============================
         * 4️⃣ Upload Thumbnail
         * ============================ */
        const uploadedThumb = await uploadImageToCloud(thumbnailFile.path);

        const thumbnail = {
            public_id: uploadedThumb.public_id,
            secure_url: uploadedThumb.secure_url,
        };

        /** ============================
         * 5️⃣ Upload Step Images
         * ============================ */
        const uploadedSteps = [];

        for (const file of stepImagesFiles) {
            const result = await uploadImageToCloud(file.path);
            uploadedSteps.push(result);
        }

        await deleteLocalFiles();
        // console.log("File cleanup Success");

        /** ============================
         * 6️⃣ Merge steps + image URLs
         * ============================ */
        const finalSteps = steps.map((stepObj, index) => ({
            stepNo: stepObj.stepNo,
            instruction: stepObj.instruction,
            imageUrl: {
                public_id: uploadedSteps[index].public_id,
                secure_url: uploadedSteps[index].secure_url,
            },
        }));

        /** ============================
         * 7️⃣ Build recipe payload
         * ============================ */
        const recipeData = {
            title,
            description,
            ingredients,
            steps: finalSteps,
            cuisine,
            dietaryLabels: dietaryLabels || [],
            totalCookingTime,
            servings,
            externalMediaLinks: externalMediaLinks || [],
            isPremium,
            thumbnail,
            chefId: req.user?._id,
        };

        /** ============================
         * 8️⃣ Save recipe
         * ============================ */
        const recipe = await Recipe.create(recipeData);

        return res
            .status(201)
            .json(new ApiResponse(201, "Recipe created successfully", recipe));
    } catch (error) {
        await deleteLocalFiles();
        console.log("Some Error Occured: ", error);

        if (error instanceof ApiError) {
            return next(error);
        }

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
            // console.log(chefId);
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
        const limit = Number(req.query.limit) || 10;

        const trendingRecipes = await Recipe.aggregate([
            // Only recipes created in last 30 days
            {
                $match: {
                    createdAt: { $gte: thirtyDaysAgo },
                },
            },

            // Compute like count
            {
                $addFields: {
                    likeCountTotal: { $size: { $ifNull: ["$likeCount", []] } },
                },
            },

            // Sort by likeCount desc
            { $sort: { likeCountTotal: -1, createdAt: -1 } },

            // Limit to 10
            { $limit: limit },
        ]);
        // console.log(likeCountTotal);
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
        console.log("Error Occured While Fetching Trending Recipes: ", error);

        return next(
            error instanceof ApiError
                ? error
                : new ApiError(
                      500,
                      "Something went wrong fetching trending recipes"
                  )
        );
    }
};
const HandleGetFreshRecipes = async (req, res, next) => {
    try {
        const limit = Number(req.query.limit) || 10;

        const freshRecipes = await Recipe.aggregate([
            {
                $sort: { createdAt: -1 }, // newest first
            },
            { $limit: limit },
        ]);

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
        console.log("Error fetching fresh recipes:", error);

        return next(
            error instanceof ApiError
                ? error
                : new ApiError(
                      500,
                      "Something went wrong fetching fresh recipes"
                  )
        );
    }
};
const HandleGetQuickRecipes = async (req, res, next) => {
    try {
        const limit = Number(req.query.limit) || 10;
        const maxTime = Number(req.query.maxTime);

        const pipeline = [];

        // If maxTime is sent from frontend → apply filter
        if (maxTime !== null && !isNaN(maxTime)) {
            pipeline.push({
                $match: {
                    totalCookingTime: { $lte: maxTime },
                },
            });
        }

        pipeline.push({ $sort: { totalCookingTime: 1 } }, { $limit: limit });

        const quickRecipes = await Recipe.aggregate(pipeline);

        // console.log(quickRecipes);

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
        console.log("Error fetching quick recipes:", error);

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
const HandleGetPremiumRecipes = async (req, res, next) => {
    try {
        const limit = Number(req.query.limit) || 10;

        const premiumRecipes = await Recipe.aggregate([
            {
                $match: {
                    isPremium: true,
                },
            },
            { $limit: limit },
        ]);

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
        console.log("Error fetching premium recipes:", error);

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
const HandleGetRecommendedRecipes = async (req, res, next) => {
    try {
        // Get the logged-in user's ID from auth middleware
        const userId = req.user?._id;

        // Find the user in DB to access their preferences
        const user = await User.findById(userId)
            .select("profile.cuisine profile.dietaryLabels")
            .lean();

        if (!user) {
            return next(new ApiError(404, "User not found"));
        }

        // Extract preferred cuisine and dietary labels from user profile
        const { cuisine, dietaryLabels } = user.profile || {};

        // Create an empty filter object that we’ll fill dynamically
        const matchStage = {};

        // If user has a preferred cuisine, we match recipes by cuisine name.
        // Using regex makes it case-insensitive and allows partial matches.
        if (cuisine) {
            matchStage.cuisine = { $regex: new RegExp(cuisine, "i") };
        }

        // If user has dietary preferences, we use $in to find recipes
        // that contain any of those dietary labels.
        if (dietaryLabels && dietaryLabels.length > 0) {
            matchStage.dietaryLabels = { $in: dietaryLabels };
        }

        // Limit the number of recipes returned (default 10)
        const limit = Number(req.query.limit) || 10;

        // console.log("MatchStage: ", matchStage);
        // console.log("Uyser pref: ", cuisine, dietaryLabels);

        // The aggregation pipeline starts here
        const recommendedRecipes = await Recipe.aggregate([
            // Step 1: Filter recipes based on user's preferences (cuisine/dietary)
            { $match: matchStage },

            // Step 2: Sort recipes by creation date (latest first)
            { $sort: { createdAt: -1 } },

            // Step 3: Limit results to a certain number (for performance)
            { $limit: limit },
        ]);

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
        console.log("Error fetching recommended recipes:", error);

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

const handleLikeUnlikeRecipe = async (req, res, next) => {
    try {
        const { id: recipeId } = req.params;
        const user = req.user; // from auth middleware

        const recipe = await Recipe.findById(recipeId);
        if (!recipe) {
            return next(new ApiError(404, "Recipe not found"));
        }

        const alreadyLiked = recipe.likeCount?.includes(user._id);

        if (alreadyLiked) {
            // remove like
            recipe.likeCount.pull(user._id);
            user.favourites.pull(recipeId);
        } else {
            // add like
            recipe.likeCount.push(user._id);
            user.favourites.push(recipeId);
        }

        // concurrent save instead of sequential
        await Promise.all([recipe.save(), user.save()]);

        return res.status(200).json(
            new ApiResponse(
                200,
                alreadyLiked
                    ? "Like removed successfully"
                    : "Recipe liked successfully",
                {
                    recipeId,
                    liked: !alreadyLiked,
                    totalLikes: recipe.likeCount.length,
                }
            )
        );
    } catch (error) {
        console.log("Error toggling like:", error);
        return next(
            error instanceof ApiError
                ? error
                : new ApiError(500, "Something went wrong while toggling like")
        );
    }
};

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
    HandleGetRecommendedRecipes,
    handleLikeUnlikeRecipe,
};
