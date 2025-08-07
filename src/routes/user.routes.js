import { Router } from "express";
import { handleRegister, handleLogin } from "../controllers/user.controllers.js";
const userRoutes = Router();

userRoutes.route("/register").post(handleRegister);
userRoutes.route("/login").post(handleLogin);

export default userRoutes;
