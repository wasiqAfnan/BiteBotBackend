import express from "express";
import errorMiddleware from "./middlewares/error.middlewares.js";
import { userRoutes, healthCheckRoutes } from "./routes/index.js";

const app = express();

// middlewares
app.use(express.json());

// routes
app.use("/api/test", healthCheckRoutes);
app.use("/api/user", userRoutes);

// handling all other incorrect routes
app.all(/./, (req, res) => {
    res.status(404).json({ message: "Page does not exist" });
});

// error middleware
app.use(errorMiddleware);
export default app;
