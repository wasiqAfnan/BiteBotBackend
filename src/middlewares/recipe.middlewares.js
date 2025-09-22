import Joi from "joi";

export const validateRecipe = (req, res, next) => {
  const schema = Joi.object({
    title: Joi.string().min(3).max(50).required(),
    description: Joi.string().min(10).required(),
    chefId: Joi.string().required(), // should be ObjectId

    ingredients: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        quantity: Joi.number().positive().required(),
        unit: Joi.string().required(),
        marketPrice: Joi.number().positive().required(),
      })
    ).min(1).required(),

    steps: Joi.array().items(
      Joi.object({
        stepNo: Joi.number().positive().required(),
        instruction: Joi.string().required(),
        imageUrl: Joi.string().uri().optional(), //Needs to change use multer npm package
      })
    ).min(1).required(),

    cuisine: Joi.string().optional(),
    categoryTags: Joi.array().items(Joi.string()).optional(),
    dietaryLabels: Joi.array().items(Joi.string()).optional(),
    prepTime: Joi.number().positive().optional(),
    cookTime: Joi.number().positive().optional(),
    servings: Joi.number().positive().optional(),
    externalMediaLinks: Joi.array().items(Joi.string().uri()).optional(),
    isPremium: Joi.boolean().default(false),
  });

  const { error } = schema.validate(req.body, { abortEarly: false });

  if (error) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      details: error.details.map((err) => err.message),
    });
  }

  next();
};
