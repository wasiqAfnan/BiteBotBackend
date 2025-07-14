import express from "express";
import env from "dotenv";

const app = express();
env.config();

// middlewares
app.use(express.json());

export default app;
