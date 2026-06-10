import { Router } from "express";
import {
    handleRegister,
    handleLogin,
    handleLogout,
    handleGetProfile,
    handleChangeAvatar,
    handleChangePassword,
    handleResetPassword,
    handleForgetPassword,
    handleGetMySubscriptions,
    handleUpdateProfile,
    handleGetUserById,
    handleGetMySubscribers,
    handleGetChefRecipesById,
    // handleSubscribeToChef,
    // handleUnsubscribeFromChef,
    handleGetFavourites,
    handleContactus,
    handleGuestLogin,
    addChefReview,
    updateChefReview,
    deleteChefReview,
    getAllChefReviews,
    handleGetMyReviewsGiven,
} from "../controllers/user.controllers.js";
import { isLoggedIn } from "../middlewares/auth.middlewares.js";
import upload from "../middlewares/multer.middlewares.js";
import { validateUpdateProfile } from "../middlewares/updateProfile.middleware.js";
import { rateLimiter } from "../middlewares/rateLimiter.middleware.js";

const userRoutes = Router();

// auth routes
userRoutes.route("/register").post(rateLimiter(60, 5), handleRegister);
userRoutes.route("/login").post(rateLimiter(60, 5), handleLogin);
userRoutes.route("/guest-login").post(rateLimiter(60, 5), handleGuestLogin);
userRoutes.route("/logout").get(isLoggedIn, handleLogout);
userRoutes
    .route("/change-avatar")
    .post(isLoggedIn, rateLimiter(60, 5), upload.single("avatar"), handleChangeAvatar);

// password routes
userRoutes.route("/change-password").put(isLoggedIn, rateLimiter(60, 5), handleChangePassword);
userRoutes.route("/reset-password").post(rateLimiter(60, 5), handleResetPassword);
userRoutes.route("/forget-password").post(rateLimiter(60, 5), handleForgetPassword);

// profile routes
userRoutes.route("/me").get(isLoggedIn, rateLimiter(60, 120), handleGetProfile);
userRoutes.route("/reviews-given").get(isLoggedIn, rateLimiter(60, 30), handleGetMyReviewsGiven);
userRoutes.route("/subscriptions").get(isLoggedIn, rateLimiter(60, 120), handleGetMySubscriptions);
userRoutes
    .route("/update")
    .put(isLoggedIn, rateLimiter(60, 30), validateUpdateProfile, handleUpdateProfile);
userRoutes.route("/favourites").get(isLoggedIn, rateLimiter(60, 30), handleGetFavourites);
userRoutes.route("/subscribers").get(isLoggedIn, rateLimiter(60, 30), handleGetMySubscribers);
userRoutes.route("/contact").post(isLoggedIn, rateLimiter(60, 5), handleContactus);
userRoutes.route("/:id").get(rateLimiter(60, 30), handleGetUserById);
userRoutes.route("/:id/recipes").get(rateLimiter(60, 30), handleGetChefRecipesById);

// subscription routes
// userRoutes.route("/subscribe/:chefId").get(isLoggedIn, rateLimiter(60, 15), handleSubscribeToChef);
// userRoutes
//     .route("/unsubscribe/:chefId")
//     .get(isLoggedIn, rateLimiter(60, 15), handleUnsubscribeFromChef);

// chef review routes
userRoutes
    .route("/:chefId/reviews")
    .get(rateLimiter(60, 30), getAllChefReviews)
    .post(isLoggedIn, rateLimiter(60, 10), addChefReview)
    .put(isLoggedIn, rateLimiter(60, 10), updateChefReview)
    .delete(isLoggedIn, rateLimiter(60, 15), deleteChefReview);

export default userRoutes;
