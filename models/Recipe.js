const mongoose = require('mongoose');

const recipeSchema = new mongoose.Schema({
  title: String,
  description: String,
  cook: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  ingredients: [{
    name: String,
    quantity: Number,
    unit: String,
    marketPrice: Number
  }],

  steps: [{
    instruction: String,
    imageUrl: String
  }],

  cuisine: String,
  categoryTags: [String],
  dietaryLabels: [String],
  prepTime: Number,
  cookTime: Number,
  servings: Number,
  scalingInfo: String,
  externalMediaLinks: [String],

  isPremium: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Recipe', recipeSchema);
