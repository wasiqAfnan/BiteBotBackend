import mongoose from "mongoose";

const recipeSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, "Title is required"],
        },

        description: {
            type: String,
            required: [true, "Description is required"],
        },

        cuisine: {
            type: String,
            required: [true, "Cuisine is required"],
        },

        // need discussion
        chefId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },

        totalCookingTime: {
            type: Number,
            required: [true, "Total Cooking Time is required"],
        },

        servings: {
            type: Number,
            required: [true, "Servings is required"],
        },

        isPremium: {
            type: Boolean,
            default: false,
        },

        ingredients: [
            {
                name: String,
                quantity: Number,
                unit: String,
                marketPrice: Number,
            },
        ],

        steps: [
            {
                stepNo: Number,
                instruction: {
                    type: String,
                    required: [true, "Instruction is required"],
                },

                imageUrl: {
                    public_id: {
                        type: String,
                    },
                    secure_url: {
                        type: String,
                    },
                },
            },
        ],

        dietaryLabels: [
            {
                type: String,
                enum: {
                    values: [
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
                        "low-fat",
                    ],
                    message: "Invalid dietary label",
                },
            },
        ],

        externalMediaLinks: [
            {
                name: String,
                url: String,
            },
        ],

        reviews: [
            {
                name: String,
                rating: {
                    type: Number,
                    min: 1,
                    max: 5,
                },
                message: String,
                createdAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],

        likeCount: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
        ]
    },
    { timestamps: true }
);

export const Recipe = mongoose.model("Recipe", recipeSchema);
