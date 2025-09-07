import express from "express";
import mongoose from "mongoose" ;
import { connectDb } from "./src/db/config.js";
import recipeRouter from "./src/routes/recipe.routes.js"

const app = express();

// Middleware to parse JSON request bodies
app.use(express.json());

// Connect Database
connectDb();

// Routes
app.use("/api", recipeRouter);

// Base route
app.get("/", (req, res) => {
  res.status(200).json({ message: "Welcome to BiteBot" });
});

// Error handler (for undefined routes)
app.all(/./, (req, res, next) => {
    res.status(404).json({
        success: false,
        message: "Page not found",
    });
});

// app.listen(8080, () => console.log("Server Running"));

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(3000, () => console.log(`Server running on port ${PORT}`));








