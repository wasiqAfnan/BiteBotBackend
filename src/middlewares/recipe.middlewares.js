import Joi from "joi";
import User from "../models/user.models.js";

export const validateRecipe = (req, res, next) => {
    try {
        const schema = Joi.object({
            title: Joi.string().trim().min(3).max(100).required(),
            description: Joi.string().trim().min(10).max(1000).required(),

            ingredients: Joi.array()
                .items(
                    Joi.object({
                        name: Joi.string().trim().required(),
                        quantity: Joi.number().positive().required(),
                        unit: Joi.string().trim().required(),
                        marketPrice: Joi.number().positive().required(),
                    })
                )
                .min(1)
                .required(),

            steps: Joi.array()
                .items(
                    Joi.object({
                        stepNo: Joi.number().integer().positive().required(),
                        instruction: Joi.string().trim().required(),
                    })
                )
                .min(1)
                .required(),

            cuisine: Joi.string().trim().required(),

            dietaryLabels: Joi.array()
                .items(
                    Joi.string().valid(
                        "vegetarian",
                        "vegan",
                        "keto",
                        "paleo",
                        "gluten-free",
                        "dairy-free",
                        "low-carb",
                        "high-protein",
                        "sugar-free",
                        "organic",
                        "raw",
                        "mediterranean",
                        "low-fat"
                    )
                )
                .optional(),

            totalCookingTime: Joi.number().positive().required(),
            servings: Joi.number().positive().required(),

            externalMediaLinks: Joi.array()
                .items(
                    Joi.object({
                        name: Joi.string().trim().required(),
                        url: Joi.string().uri().required(),
                    })
                )
                .optional(),

            isPremium: Joi.boolean().default(false),
        });

        const { value, error } = schema.validate(req.body, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            throw new ApiError(400, "Validation failed");
        }

        req.body = value; // setting sanitized data to req.body
        next();
    } catch (error) {
        console.log("Some Error Occured: ", error);
        // If the error is already an instance of ApiError, pass it to the error handler
        if (error instanceof ApiError) {
            return next(error);
        }

        // For all other errors, send a generic error message
        return next(
            new ApiError(500, "Something went wrong during recipe validation")
        );
    }
};

export const isSubscribed = async (req, res, next) => {
    try {
        // Expecting: userId, chefId, isPremium from frontend
        const { chefId, isPremium } = req.body;
        const userId = req.user._id;

        // If required fields missing
        if (!chefId || !isPremium) {
            throw new ApiError(400, "All fields are required to check subscription status");
        }

        // If recipe is NOT premium, no restriction
        if (!isPremium) {
            return next();
        }        

        // Fetch user and check subscription
        const user = await User.findById(userId);

        if (!user) {
            throw new ApiError(404, "User not found");
        }

        // Check if user has subscribed to this chef
        const subscriptionStatus = user.profile.subscribed.some(
            (id) => id.toString() === chefId.toString()
        );

        if (!subscriptionStatus) {
            throw new ApiError(
                403,
                "Access denied: You need to subscribe to this chef to view premium recipes"
            );
        }

        // All good — user has access
        next();
    } catch (error) {
        console.log("isSubscribed middleware error: ", error);
        return next(
            error instanceof ApiError
                ? error
                : new ApiError(500, "Something went wrong while verifying subscription status")
        );
    }
};
