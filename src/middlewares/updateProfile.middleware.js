import Joi from "joi";
import ApiError from "../utils/ApiError.js";

export const validateUpdateProfile = (req, res, next) => {
    const schema = Joi.object({
        name: Joi.string().trim().min(2).max(50).optional(),

        bio: Joi.string().trim().allow("").max(300).optional(),

        dietaryLabels: Joi.array()
            .items(Joi.string().valid("vegetarian", "vegan", "halal", "kosher"))
            .optional(),

        allergens: Joi.array().items(Joi.string()).optional(),

        cuisine: Joi.string().trim().optional(),
    })
        .min(1) // At least one field required
        .unknown(false); // Reject extra fields

    const { error, value } = schema.validate(req.body, {
        abortEarly: false,
        stripUnknown: false, // important: THROW error, don't silently strip
    });

    if (error) {
        console.log(error);
        throw new ApiError(400, error.details.map((d) => d.message).join(", "));
    }

    // Replace body with validated & safe data
    req.body = value;
    next();
};
