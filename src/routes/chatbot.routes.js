import express from "express";
import { recipeChat } from "../controllers/chatbot.controller.js";
import { isLoggedIn } from "../middlewares/auth.middlewares.js";

const router = express.Router();

router.get("/chat", isLoggedIn, recipeChat);

export default router;
