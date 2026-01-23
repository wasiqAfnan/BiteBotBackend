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
    handleGetUserById,
    handleSubscribeToChef,
    handleUnsubscribeFromChef,
    handleGetFavourites,
    handleContactus,
} from "../controllers/user.controllers.js";
import { isLoggedIn } from "../middlewares/auth.middlewares.js";
import upload from "../middlewares/multer.middlewares.js";
import { validateUpdateProfile } from "../middlewares/updateProfile.middleware.js";

const userRoutes = Router();

// auth routes
userRoutes.route("/register").post(handleRegister);
userRoutes.route("/login").post(handleLogin);
userRoutes.route("/logout").get(isLoggedIn, handleLogout);
userRoutes
    .route("/change-avatar")
    .post(isLoggedIn, upload.single("avatar"), handleChangeAvatar);

// password routes
userRoutes.route("/change-password").put(isLoggedIn, handleChangePassword);
userRoutes.route("/reset-password").post(handleResetPassword);
userRoutes.route("/forget-password").post(handleForgetPassword);

// profile routes
userRoutes.route("/me").get(isLoggedIn, handleGetProfile);
userRoutes
    .route("/update")
    .put(isLoggedIn, validateUpdateProfile, handleUpdateProfile);
userRoutes.route("/favourites").get(isLoggedIn, handleGetFavourites);
userRoutes.route("/:id").get(handleGetUserById);
userRoutes.route("/contact").post(isLoggedIn, handleContactus);

// subscription routes
userRoutes.route("/subscribe/:chefId").get(isLoggedIn, handleSubscribeToChef);
userRoutes
    .route("/unsubscribe/:chefId")
    .get(isLoggedIn, handleUnsubscribeFromChef);

export default userRoutes;
