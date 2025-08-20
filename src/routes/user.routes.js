import { Router } from "express";
import { handleRegister, handleLogin, handleLogout } from "../controllers/user.controllers.js";
const userRoutes = Router();

userRoutes.route("/register").post(handleRegister);
userRoutes.route("/login").post(handleLogin);
userRoutes.route("/logout").post(handleLogout);

export default userRoutes;
