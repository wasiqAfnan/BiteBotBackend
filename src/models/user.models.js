import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import constants from "../constants.js";

const userSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: [true, "Email is require"],
            unique: true,
            lowercase: true,
            match: [
                /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
                "Please fill in a valid email address",
            ],
        },
        password: {
            type: String,
            required: [true, "Password is required"],
            minlength: [8, "Password must be at least 6 characters long"],
            select: false, // Don't include password in queries by default
        },
        role: {
            type: String,
            enum: ["ADMIN", "USER", "CHEF"],
            default: "USER",
        },

        // Unified profile object for all user types
        profile: {
            name: {
                type: String,
                required: [true, "Display name is required"],
                trim: true,
            },

            avatar: {
                public_id: {
                    type: String,
                },
                secure_url: {
                    type: String,
                },
            },

            bio: {
                type: String,
                trim: true,
                maxlength: [500, "Bio cannot exceed 500 characters"],
            },

            // Fields mainly used by normal users but available to all
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

            allergens: [
                {
                    type: String,
                },
            ],

            cuisine: [
                {
                    type: String,
                    enum: {
                        values: [
                            "indian",
                            "italian",
                            "chinese",
                            "mexican",
                            "thai",
                            "japanese",
                            "french",
                            "mediterranean",
                            "american",
                            "korean",
                            "vietnamese",
                            "middle-eastern",
                            "british",
                            "spanish",
                            "german",
                            "greek",
                        ],
                        message: "Invalid cuisine type",
                    },
                },
            ],
        },

        // Chef-specific profile (only populated for CHEFs)
        chefProfile: {
            education: {
                type: String,
            },

            experience: {
                type: String,
            },

            externalLinks: [
                {
                    type: String,
                    default: [],
                },
            ],

            subscriptionPrice: {
                type: Number,
            },

            recipes: [
                {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Recipe",
                },
            ],
        },

        // Embedded favourites array (mainly for normal users)
        favourites: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Recipe",
            },
        ],
        refreshToken: {
            type: String,
        },
    },
    { timestamps: true }
);

userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) {
        return next();
    }

    this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.isPasswordCorrect = async function (password) {
    return await bcrypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = async function () {
    return jwt.sign(
        {
            _id: this._id,
        },
        constants.ACCESS_TOKEN_SECRET,
        {
            expiresIn: constants.ACCESS_TOKEN_EXPIRY,
        }
    );
};

userSchema.methods.generateRefreshToken = async function () {
    return jwt.sign(
        {
            _id: this._id,
        },
        constants.REFRESH_TOKEN_SECRET,
        {
            expiresIn: constants.REFRESH_TOKEN_EXPIRY,
        }
    );
};

const User = mongoose.model("User", userSchema);

export default User;
