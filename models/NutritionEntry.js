const mongoose = require('mongoose');

const nutritionEntrySchema = new mongoose.Schema({
  ingredient: { type: String, required: true },
  perUnit: {
    calories: Number,
    fat: Number,
    cholesterol: Number,
    carbohydrates: Number,
    sugars: Number,
    protein: Number,
    vitamin: Number
  }
});

module.exports = mongoose.model('NutritionEntry', nutritionEntrySchema);
