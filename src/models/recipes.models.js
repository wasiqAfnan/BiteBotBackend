import mongoose from 'mongoose';

const recipeSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, "Title is required"],
    minLength: [3, "Title must be at least 3 characters long"],
    maxLength: [50, "Title cannot exceed 50 characters"],
  },
  description: {
    type: String,
    required: [true, "Description is required"],
    minLength: [10, "Description must be at least 10 characters long"],
  },
  chefId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, "Chef ID is required"],
  },

  ingredients: [{
    name: String,
    quantity: Number,
    unit: String,
    marketPrice: Number
  }],

  steps: [{
    stepNo: Number,
    instruction: {
      type: String,
      required: [true, "Instruction is required"]
    },
    imageUrl: String
  }],

  cuisine: String,
  categoryTags: [String],
  dietaryLabels: [String],
  prepTime: Number,
  cookTime: Number,
  servings: Number,
  externalMediaLinks: [String], //for youtube video ref or some other site external site reference
  isPremium: { type: Boolean, default: false }
}, { timestamps: true });

export const Recipe = mongoose.model('Recipe', recipeSchema);
