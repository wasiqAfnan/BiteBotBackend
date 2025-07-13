const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'cook', 'admin'], default: 'user' },
  avatar: String,

  // Normal user preferences
  dietaryLabels: [String],
  allergens: [String],
  preferredCuisine: [String],

  // Cook-specific fields
  bio: String,
  education: String,
  experience: String,
  profileImage: String,
  externalLinks: [String],
  subscriptionPrice: Number,

  // Saved recipes
  favourites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Recipe' }]
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
