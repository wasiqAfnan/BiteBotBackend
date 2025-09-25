import express from "express";
import errorMiddleware from "./middlewares/error.middlewares.js";
import { userRoutes, healthCheckRoutes } from "./routes/index.js";
import cookieParser from "cookie-parser";
import recipeRouter from "./routes/recipe.routes.js";

const app = express();

// middlewares
app.use(express.json());
app.use(cookieParser());

// routes
app.use("/api/test", healthCheckRoutes);
app.use("/api/user", userRoutes);
app.use("/api", recipeRouter);

// handling all other incorrect routes
app.all(/./, (req, res) => {
    res.status(404).json({ message: "Page does not exist" });
});

// error middleware
app.use(errorMiddleware);
export default app;
