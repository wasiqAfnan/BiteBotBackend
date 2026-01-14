import Joi from "joi";
import ApiError from "../utils/ApiError.js";

const DIETARY_LABELS = [
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
];

const ALLERGENS = [
    "peanuts",
    "tree nuts",
    "milk",
    "egg",
    "wheat",
    "soy",
    "fish",
    "shellfish",
    "sesame",
    "mustard",
    "celery",
    "lupin",
    "sulfites",
    "molluscs",
    "corn",
];

export const validateUpdateProfile = (req, res, next) => {
    const schema = Joi.object({
        name: Joi.string().trim().min(2).max(50).optional(),

        bio: Joi.string().trim().allow("").max(300).optional(),

        dietaryLabels: Joi.array()
            .items(Joi.string().valid(...DIETARY_LABELS))
            .optional(),

        allergens: Joi.array()
            .items(Joi.string.valid(...ALLERGENS))
            .optional(),

        cuisine: Joi.string().trim().optional(),
    }).min(1); // At least one field required

    const { error, value } = schema.validate(req.body, {
        abortEarly: false,
        allowUnknown: true, // allow unknown fields
        stripUnknown: true, // important: silently strip
    });

    if (error) {
        console.log(error);
        throw new ApiError(400, error.details.map((d) => d.message).join(", "));
    }

    // Replace body with validated & safe data
    req.body = value;
    next();
};
