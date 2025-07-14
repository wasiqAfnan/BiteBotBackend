import express from "express";

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

export default app;
