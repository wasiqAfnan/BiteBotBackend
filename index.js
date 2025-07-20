const express = require("express");
const app = express();
const mongoose = require("mongoose");


// Import Models
import { User } from "./src/models/user.js";
import { Subscription } from "./src/models/Subscription.js";
import { Nutrition } from "./src/models/NutritionEntry.js";
import { Recipe } from './src/models/NutritionEntry.js';

require("./models/Subscription");

import dotenv from "dotenv";
dotenv.config();

main()
  .then(() => {
    console.log("Connected to Database bitebot");
  })
  .catch((err) => {
    console.log(err);
  });

async function main() {
  await mongoose.connect(process.env.MONGO_URL);
}

app.get("/", (req, res) =>
  res.status(200).json({ message: "Welcome to API of BiteBot" })
);

app.listen(8080, () => console.log("Server Running"));
