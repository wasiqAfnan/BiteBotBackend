import { Router } from "express";
import { handleRegister, handleLogin, handleLogout } from "../controllers/user.controllers.js";
import { isLoggedIn } from "../middlewares/auth.middlewares.js";
const userRoutes = Router();

userRoutes.route("/register").post(handleRegister);
userRoutes.route("/login").post(handleLogin);
userRoutes.route("/logout").post(isLoggedIn, handleLogout);

export default userRoutes;
