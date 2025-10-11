import { Router } from "express";
import {
    handleRegister,
    handleLogin,
    handleLogout,
    handleChangeAvatar,
    handleChangePassword,
    handleResetPassword,
    handleForgetPassword,
    handleGetProfile,
    handleUpdateProfile,
} from "../controllers/user.controllers.js";
import { isLoggedIn } from "../middlewares/auth.middlewares.js";
import upload from "../middlewares/multer.middlewares.js";

const userRoutes = Router();

// auth routes
userRoutes.route("/register").post(handleRegister);
userRoutes.route("/login").post(handleLogin);
userRoutes.route("/logout").get(isLoggedIn, handleLogout);
userRoutes
    .route("/change-avatar")
    .post(isLoggedIn, upload.single("avatar"), handleChangeAvatar);

// password routes
userRoutes.route("/change-password").patch(isLoggedIn, handleChangePassword);
userRoutes.route("/reset-password").post(handleResetPassword); //Not implemented
userRoutes.route("/forget-password").post(handleForgetPassword); //Not implemented

// profile routes
userRoutes.route("/me").get(isLoggedIn, handleGetProfile);
userRoutes.route("/update").patch(isLoggedIn, handleUpdateProfile);

export default userRoutes;
