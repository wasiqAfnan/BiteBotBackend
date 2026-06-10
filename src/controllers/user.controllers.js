import crypto from "crypto";
import mongoose from "mongoose";
import User from "../models/user.models.js";
import Recipe from "../models/recipe.models.js";
import {
    ApiResponse,
    ApiError,
    uploadImageToCloud,
    deleteLocalFile,
    deleteCloudFile,
    // isBlankValue,
    // convertToMongoKey,
} from "../utils/index.js";
import constants from "../constants.js";
import sendMail from "../utils/sendMail.js";
import UserCacheService from "../services/cache/user.cache.js";
import {
    contactUsAutoReplyTemplate,
    contactUsTemplate,
    forgotPasswordTemplate,
    welcomeTemplate,
} from "../emailTemplates/index.js";
import razorpayInstance from "../configs/razorpay.configs.js";
import { recalculateChefRatings } from "../utils/recalculateRecipeRatings.js";

const handleRegister = async (req, res, next) => {
    try {
        // get name, email and pw from body
        const {
            email,
            password,
            profile_name,
            profile_cuisine,
            profile_dietaryLabels,
            profile_allergens,
        } = req.body;

        // validate
        if (!(email && password && profile_name && profile_cuisine)) {
            throw new ApiError(400, "All field must be passed");
        }

        // Email format validation using regex
        const emailRegex =
            /^(?=.{1,254}$)(?=.{1,64}@)[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

        if (!emailRegex.test(email)) {
            throw new ApiError(400, "Email Not Valid");
        }

        // Password validation in controller
        const passwordRegex =
            // /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9\s])[\s\S]{8,}$/;

            /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9\s])[^\s]{8,64}$/;
        // check min 8 char, one uppercase, special char and number
        if (!passwordRegex.test(password)) {
            throw new ApiError(400, "Password Not Valid");
        }

        // validate if user exists
        let user = await User.findOne({ email });
        if (user) {
            throw new ApiError(400, "User already exists with this email");
        }

        // Prepare profile data - only include fields that are provided
        const profileData = {
            name: profile_name,
            cuisine: profile_cuisine,
        };

        if (profile_dietaryLabels)
            profileData.dietaryLabels = profile_dietaryLabels;

        if (profile_allergens) profileData.allergens = profile_allergens;

        // Create new user object
        const newUser = await User.create({
            email: email.toLowerCase(),
            password: password,
            profile: profileData,
            favourites: [], // Initialize empty favourites array
        });

        if (!newUser) {
            throw new ApiError(
                500,
                "User registration failed, please try again"
            );
        }

        // token create
        const accessToken = await newUser.generateAccessToken();
        const refreshToken = await newUser.generateRefreshToken();

        // save refresh token
        newUser.refreshToken = refreshToken;
        await newUser.save();
        newUser.password = undefined;

        // send cookie
        res.cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: "None",
            maxAge: 24 * 60 * 60 * 1000, // 1 day
        }).cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: "None",
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        await UserCacheService.updateProfile(newUser._id, newUser);

        // send welcome email
        await sendMail(
            newUser.email,
            "Welcome to Bitezzy",
            welcomeTemplate({ name: newUser.profile.name })
        );

        // send response
        return res.status(201).json(
            new ApiResponse(201, "User Created Successfully", {
                newUser,
            })
        );
    } catch (error) {
        console.error("Error registering user:", error);
        error instanceof ApiError
            ? next(error)
            : next(
                new ApiError(500, "Something went wrong during registration")
            );
    }
};

const handleLogin = async (req, res, next) => {
    try {
        // get email and pw from body
        const { email, password } = req.body;

        // validate
        if (!(email && password)) {
            throw new ApiError(400, "All field must be passed");
        }

        // validate if user exists
        let user = await User.findOne({
            email: email.toLowerCase(),
            isActive: true,
        }).select("+password");

        if (!user) {
            throw new ApiError(
                401,
                "User does not exists with this email or email is invalid"
            );
        }

        // compare pw hashed
        const matchedPw = await user.isPasswordCorrect(password);
        if (!matchedPw) {
            throw new ApiError(401, "Password is invalid");
        }

        // token create
        const accessToken = await user.generateAccessToken();
        const refreshToken = await user.generateRefreshToken();

        // save refresh token
        user.refreshToken = refreshToken;
        await user.save();

        user.password = undefined;
        user.refreshToken = undefined;

        // send cookie
        res.cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: "None",
            maxAge: 24 * 60 * 60 * 1000, // 1 day
        }).cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: "None",
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        await UserCacheService.updateProfile(user._id, user);

        // send response
        return res
            .status(200)
            .json(new ApiResponse(200, "Login Successful", user));
    } catch (error) {
        console.error("Error logging in:", error);
        error instanceof ApiError
            ? next(error)
            : next(new ApiError(500, "Something went wrong during login"));
    }
};

const handleGuestLogin = async (req, res, next) => {
    try {
        const user = await User.findById(constants.GUEST_ID);

        if (!user) {
            throw new ApiError(404, "Guest account not found");
        }

        const accessToken = await user.generateAccessToken();

        await UserCacheService.updateProfile(constants.GUEST_ID, user);

        res.cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: "None",
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: "/",
        });

        return res
            .status(200)
            .json(new ApiResponse(200, "Logged in successfully", user));
    } catch (error) {
        console.error("Error logging in:", error);
        error instanceof ApiError
            ? next(error)
            : next(
                new ApiError(500, "Something went wrong during guest login")
            );
    }
};

const handleLogout = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const isChef = req.user.role === "CHEF";

        const user = await User.findById(userId);
        user.refreshToken = undefined; // Remove refresh token from db
        await user.save();

        await Promise.all([
            UserCacheService.invalidateProfile(userId),
            UserCacheService.invalidateSubscriptions(userId),
            UserCacheService.invalidateFavourites(userId),
            UserCacheService.invalidateReviewsGiven(userId),
            UserCacheService.invalidatePreferences(userId),
            ...(isChef ? [
                UserCacheService.invalidateChefRecipes(userId),
                UserCacheService.invalidateChefSubscribers(userId),
                UserCacheService.invalidateChefReviews(userId),
            ] : []),
        ]);

        res.clearCookie("accessToken", {
            httpOnly: true,
            secure: true,
            sameSite: "None",
            path: "/",
        }).clearCookie("refreshToken", {
            httpOnly: true,
            secure: true,
            sameSite: "None",
            path: "/",
        });

        return res
            .status(200)
            .json(new ApiResponse(200, "Logged out successfully"));
    } catch (error) {
        console.error("Error logging out:", error);
        error instanceof ApiError
            ? next(error)
            : next(new ApiError(500, "Something went wrong during logout"));
    }
};

const handleGetProfile = async (req, res, next) => {
    return res
        .status(200)
        .json(new ApiResponse(200, "Profile Data Fetched Successfully", req.user));
};

const handleChangeAvatar = async (req, res, next) => {
    try {
        // Get avatar file from request
        const avatarLocalPath = req.file ? req.file.path : "";

        // Check if avatar file is empty
        if (!avatarLocalPath) {
            throw new ApiError(400, "No avatar file provided");
        }

        // Upload avatar to Cloudinary
        const newAvatar = await uploadImageToCloud(avatarLocalPath, "USER");
        if (!newAvatar.public_id || !newAvatar.secure_url) {
            throw new ApiError(400, "Error uploading avatar");
        }

        // Delete old avatar if it exists
        const oldAvatarId = req.user?.profile?.avatar?.public_id;
        if (oldAvatarId) {
            const result = await deleteCloudFile(oldAvatarId);
            if (!result) {
                await deleteCloudFile(newAvatar.public_id);
                throw new ApiError(400, "Error deleting old avatar");
            }
        }

        // Update DB user with new avatar
        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            { "profile.avatar": newAvatar },
            { new: true }
        );

        await UserCacheService.updateProfile(req.user._id, updatedUser);

        res.status(200).json(
            new ApiResponse(
                200,
                "Avatar Uploaded Successfully",
                updatedUser?.profile?.avatar
            )
        );
    } catch (error) {
        await deleteLocalFile(avatarLocalPath);
        console.error("Error changing avatar:", error);
        error instanceof ApiError
            ? next(error)
            : next(
                new ApiError(500, "Something went wrong during file upload")
            );
    }
};

const handleChangePassword = async (req, res, next) => {
    try {
        const { oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword) {
            throw new ApiError("All fields are required", 400);
        }

        const passwordRegex =
            /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9\s])[^\s]{8,64}$/;

        if (!passwordRegex.test(newPassword)) {
            throw new ApiError(
                400,
                "New password does not meet security requirements"
            );
        }

        const user = await User.findById(req.user._id).select("+password");
        if (!(await user.isPasswordCorrect(oldPassword))) {
            throw new ApiError(401, "Incorrect credentials");
        }

        user.password = newPassword;
        user.refreshToken = undefined;
        await user.save();

        await UserCacheService.invalidateProfile(req.user._id);

        res.clearCookie("accessToken", {
            httpOnly: true,
            secure: true,
            sameSite: "None",
            path: "/",
        }).clearCookie("refreshToken", {
            httpOnly: true,
            secure: true,
            sameSite: "None",
            path: "/",
        });

        return res
            .status(200)
            .json(new ApiResponse(200, "Password changed successfully. Please login again."));
    } catch (error) {
        console.error("Error changing password:", error);
        error instanceof ApiError
            ? next(error)
            : next(
                new ApiError(500, "Something went wrong during password change")
            );
    }
};

const handleForgetPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email) {
            throw new ApiError(400, "Email is required");
        }

        const user = await User.findOne({ email, isActive: true });
        if (!user) {
            throw new ApiError(400, "User not found with this mail");
        }

        // generate reset token
        const resetToken = crypto.randomBytes(20).toString("hex");

        // console.log("Reset Token: ", resetToken);

        // generate hash of reset token to store in db
        const forgotPasswordToken = crypto
            .createHash("sha256")
            .update(resetToken)
            .digest("hex");

        // console.log("forgotPasswordToken: ", forgotPasswordToken);

        // generate expiry date
        const forgotPasswordExpiry = Date.now() + 15 * 60 * 1000;

        // generate reset password url
        const resetPasswordUrl = `${constants.FRONTEND_URL}/resetpassword/${resetToken}`;

        // console.log("resetPasswordUrl: ", resetPasswordUrl);

        // send mail to user with frontend url + reset token
        await sendMail(
            email,
            "Reset Password",
            forgotPasswordTemplate({
                name: user.profile.name,
                resetLink: resetPasswordUrl,
            })
        );

        // saving token in db
        await User.findByIdAndUpdate(user._id, {
            forgotPasswordToken,
            forgotPasswordExpiry,
        });

        return res
            .status(200)
            .json(new ApiResponse(200, `Mail sent successfully on ${email}`));
    } catch (error) {
        console.error("Error forgetting password:", error);
        error instanceof ApiError
            ? next(error)
            : next(
                new ApiError(
                    500,
                    "Something went wrong during while sending reset password link"
                )
            );
    }
};

const handleResetPassword = async (req, res, next) => {
    try {
        const { resetToken, password } = req.body;
        if (!resetToken || !password) {
            throw new ApiError(400, "All fields are required");
        }

        const passwordRegex =
            /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9\s])[^\s]{8,64}$/;

        if (!passwordRegex.test(password)) {
            throw new ApiError(
                400,
                "New password does not meet security requirements"
            );
        }

        // generate hash of reset token to check in db
        const forgotPasswordToken = crypto
            .createHash("sha256")
            .update(resetToken)
            .digest("hex");

        // find user with reset token and expiry date
        const user = await User.findOne({
            forgotPasswordToken,
            forgotPasswordExpiry: { $gt: Date.now() },
        });
        if (!user) {
            throw new ApiError(400, "Token is invalid or expired");
        }

        user.password = password;
        user.forgotPasswordToken = undefined;
        user.forgotPasswordExpiry = undefined;
        await user.save();

        await UserCacheService.invalidateProfile(user._id);

        return res
            .status(200)
            .json(new ApiResponse(200, "Password reset successfully"));
    } catch (error) {
        console.error("Error resetting password:", error);
        error instanceof ApiError
            ? next(error)
            : next(
                new ApiError(
                    500,
                    "Something went wrong during password reset"
                )
            );
    }
};

const handleGetMySubscriptions = async (req, res, next) => {
    try {
        let subscriptions = await UserCacheService.getSubscriptions(req.user._id);

        if (!subscriptions) {
            const user = await User.findOne({
                _id: req.user._id,
                isActive: true,
            })
                .select("profile.subscribed")
                .populate({
                    path: "profile.subscribed",
                    select: "_id profile.name profile.bio profile.avatar",
                });

            if (!user) {
                throw new ApiError(404, "User not found");
            }

            subscriptions = user.profile?.subscribed || [];
            await UserCacheService.updateSubscriptions(req.user._id, subscriptions);
        }

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    "Subscriptions Fetched Successfully",
                    subscriptions
                )
            );
    } catch (error) {
        console.error("Error fetching subscriptions:", error);
        error instanceof ApiError
            ? next(error)
            : next(
                new ApiError(
                    500,
                    "Something went wrong during fetching subscriptions"
                )
            );
    }
};

const handleUpdateProfile = async (req, res, next) => {
    try {
        const user = req.user; // from auth middleware

        // Common fields (allowed for all users)
        const baseFieldMap = {
            name: "profile.name",
            bio: "profile.bio",
            dietaryLabels: "profile.dietaryLabels",
            allergens: "profile.allergens",
            cuisine: "profile.cuisine",
        };

        // Chef-only fields
        const chefFieldMap = {
            education: "chefProfile.education",
            experience: "chefProfile.experience",
            speciality: "chefProfile.speciality",
            subscriptionPrice: "chefProfile.subscriptionPrice",
            externalLinks: "chefProfile.externalLinks",
        };

        // Decide allowed fields based on role
        let allowedFieldMap = { ...baseFieldMap };

        if (user.role === "CHEF") {
            allowedFieldMap = { ...baseFieldMap, ...chefFieldMap };
        }

        const updates = {};

        let newSubscriptionPrice = null;

        // getting new price if user is chef and updating subscription price
        if (user.role === "CHEF" && req.body.subscriptionPrice !== undefined) {
            newSubscriptionPrice = Number(req.body.subscriptionPrice);
        }

        // Only allow valid fields
        for (const key in req.body) {
            if (allowedFieldMap[key]) {
                updates[allowedFieldMap[key]] = req.body[key];
            }
        }

        // getting old price from the db
        const oldSubscriptionPrice = Number(
            user?.chefProfile?.subscriptionPrice
        );

        // checking if price has changed
        const isSubscriptionPriceChanged =
            user.role === "CHEF" &&
            newSubscriptionPrice !== null &&
            oldSubscriptionPrice !== newSubscriptionPrice;

        // prevent empty updates
        if (Object.keys(updates).length === 0) {
            throw new ApiError(400, "No valid fields provided for update");
        }

        // if price has changed, create new plan
        if (isSubscriptionPriceChanged) {
            const plan = await razorpayInstance.plans.create({
                period: "monthly",
                interval: 1,
                item: {
                    name: `${user.profile.name} Subscription`,
                    amount: newSubscriptionPrice * 100,
                    currency: "INR",
                    description: `Monthly subscription for ${user.profile.name}`,
                },
            });

            // save plan id in db
            updates["chefProfile.razorpayPlanId"] = plan.id;
        }
        // console.log(updates);
        const updatedUser = await User.findOneAndUpdate(
            { _id: user._id, isActive: true },
            { $set: updates },
            { new: true, runValidators: true }
        )

        if (!updatedUser) {
            throw new ApiError(404, "User not found");
        }

        await UserCacheService.updateProfile(user._id, updatedUser);

        return res
            .status(200)
            .json(
                new ApiResponse(200, "User updated successfully", updatedUser)
            );
    } catch (error) {
        console.error("Error updating user:", error);
        error instanceof ApiError
            ? next(error)
            : next(new ApiError(500, "Something went wrong during update"));
    }
};

const handleGetUserById = async (req, res, next) => {
    try {
        const userId = req.params.id;
        let user = await UserCacheService.getProfile(userId);

        if (!user) {
            user = await User.findOne({
                _id: userId,
                isActive: true,
            });

            if (!user) {
                throw new ApiError(404, "User not found");
            }

            await UserCacheService.updateProfile(userId, user);
        }

        return res
            .status(200)
            .json(new ApiResponse(200, "User fetched successfully", user));
    } catch (error) {
        console.error("Error fetching user:", error);
        error instanceof ApiError
            ? next(error)
            : next(
                new ApiError(500, "Something went wrong during fetching user")
            );
    }
};

const handleGetMySubscribers = async (req, res, next) => {
    try {
        const userId = req.user._id;

        let subscribers = await UserCacheService.getChefSubscribers(userId);

        if (!subscribers) {
            const chef = await User.findOne({
                _id: userId,
                isActive: true,
                role: "CHEF",
            })
                .select("chefProfile.subscribers")
                .populate({
                    path: "chefProfile.subscribers",
                    select: "_id profile.name profile.bio profile.avatar",
                });

            if (!chef) {
                return next(new ApiError(404, "Chef not found"));
            }

            subscribers = chef.chefProfile.subscribers;

            await UserCacheService.updateChefSubscribers(
                userId,
                subscribers
            );
        }

        return res.status(200).json(
            new ApiResponse(
                200,
                "Subscribers fetched successfully",
                subscribers
            )
        );
    } catch (error) {
        console.error("Error fetching subscribers:", error);

        return next(
            error instanceof ApiError
                ? error
                : new ApiError(
                    500,
                    "Something went wrong while fetching subscribers"
                )
        );
    }
};

const handleGetChefRecipesById = async (req, res, next) => {
    try {
        const chefId = req.params.id;
        let recipes = await UserCacheService.getChefRecipes(chefId);

        if (!recipes) {
            recipes = await Recipe.find({ chefId, isActive: true })
                .select("-reviews -steps -externalMediaLinks -ingredients")
                .lean();

            await UserCacheService.updateChefRecipes(chefId, recipes);
        }

        return res
            .status(200)
            .json(
                new ApiResponse(200, "Recipes fetched successfully", recipes)
            );
    } catch (error) {
        console.error("Error fetching chef recipes:", error);
        error instanceof ApiError
            ? next(error)
            : next(
                new ApiError(
                    500,
                    "Something went wrong during fetching chef recipes"
                )
            );
    }
};

const handleContactus = async (req, res, next) => {
    try {
        const { email, profile } = req.user;
        const { subject, message } = req.body;

        if (!subject || !message) {
            throw new ApiError(400, "All fields are required");
        }

        // send mail to admin
        await sendMail(
            constants.AUTHORIZE_MAIL,
            subject,
            contactUsTemplate({ name: profile.name, email, message })
        );

        // send confirm mail to user
        await sendMail(
            email,
            "Bitezzy: New Contact Us Submission",
            contactUsAutoReplyTemplate({ name: profile.name })
        );

        return res
            .status(200)
            .json(new ApiResponse(200, "Message sent successfully"));
    } catch (error) {
        console.error("Error sending contact us message:", error);
        error instanceof ApiError
            ? next(error)
            : next(
                new ApiError(
                    500,
                    "Something went wrong during sending conatct us message"
                )
            );
    }
};

const handleGetFavourites = async (req, res, next) => {
    try {
        const userId = req.user._id;
        let favourites = await UserCacheService.getFavourites(userId);

        if (!favourites) {
            const user = await User.findOne({
                _id: req.user._id,
                isActive: true,
            }).populate("favourites");
            if (!user) throw new ApiError(404, "User not found");

            favourites = user.favourites;
            await UserCacheService.updateFavourites(userId, favourites);
        }

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    "Favourites fetched successfully",
                    favourites
                )
            );
    } catch (error) {
        console.error("Error fetching favourites:", error);
        error instanceof ApiError
            ? next(error)
            : next(
                new ApiError(
                    500,
                    "Something went wrong during fetching favourites"
                )
            );
    }
};

/*
const handleSubscribeToChef = async (req, res, next) => {
    try {
        const { chefId } = req.params;
        const userId = req.user._id;

        if (userId.toString() === chefId.toString()) {
            throw new ApiError(400, "You cannot subscribe to yourself");
        }

        const chef = await User.findOne({ _id: chefId, isActive: true });

        if (!chef || chef.role !== "CHEF") {
            throw new ApiError(404, "Chef not found");
        }

        const user = await User.findOneAndUpdate(
            {
                _id: userId,
                isActive: true,
                "profile.subscribed": { $ne: chefId },
            },
            { $addToSet: { "profile.subscribed": chefId } },
            { new: true }
        );

        if (!user) {
            const userExists = await User.findOne({
                _id: userId,
                isActive: true,
            });
            if (!userExists) throw new ApiError(404, "User not found");
            throw new ApiError(400, "Already subscribed to this chef");
        }

        await User.updateOne(
            { _id: chefId },
            { $addToSet: { "chefProfile.subscribers": userId } }
        );

        await deleteCache(`user:${userId}:subscriptions`);
        await deleteCache(`user:${chefId}:subscribers`);

        return res.status(200).json(
            new ApiResponse(200, "Successfully subscribed", {
                userId,
                chefId,
            })
        );
    } catch (error) {
        console.log("Some error occured: ", error);

        // If the error is already an instance of ApiError, pass it to the error handler
        error instanceof ApiError
            ? next(error)
            : next(
                  new ApiError(
                      500,
                      "Something went wrong during subscribing chef"
                  )
              );
    }
};
*/

/*
const handleUnsubscribeFromChef = async (req, res, next) => {
    try {
        const { chefId } = req.params;
        const userId = req.user._id;

        const chef = await User.findOne({ _id: chefId, isActive: true });

        if (!chef || chef.role !== "CHEF") {
            throw new ApiError(404, "Chef not found");
        }

        const user = await User.findOneAndUpdate(
            { _id: userId, isActive: true },
            { $pull: { "profile.subscribed": chefId } },
            { new: true }
        );

        if (!user) {
            throw new ApiError(404, "User not found");
        }

        await User.updateOne(
            { _id: chefId },
            { $pull: { "chefProfile.subscribers": userId } }
        );

        await deleteCache(`user:${userId}:subscriptions`);
        await deleteCache(`user:${chefId}:subscribers`);

        return res.status(200).json(
            new ApiResponse(200, "Unsubscribed successfully", {
                chefId,
                userId,
            })
        );
    } catch (error) {
        console.log("Some error occured: ", error);

        // If the error is already an instance of ApiError, pass it to the error handler
        error instanceof ApiError
            ? next(error)
            : next(
                  new ApiError(
                      500,
                      "Something went wrong during unsubscribing chef"
                  )
              );
    }
};
*/

const addChefReview = async (req, res, next) => {
    try {
        const { chefId } = req.params;
        const { rating, message } = req.body;
        const userId = req.user._id;

        if (!mongoose.Types.ObjectId.isValid(chefId)) {
            throw new ApiError(400, "Invalid chef ID format");
        }
        if (!rating || rating < 1 || rating > 5) {
            throw new ApiError(400, "Rating is required and must be between 1 and 5");
        }
        if (!message?.trim()) {
            throw new ApiError(400, "Review message is required");
        }
        if (message.length > 1000) {
            throw new ApiError(400, "Message cannot exceed 1000 characters");
        }

        if (userId.toString() === chefId.toString()) {
            throw new ApiError(400, "You cannot review yourself");
        }

        const newReview = {
            userId,
            rating,
            message: message.trim(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const updatedChef = await User.findOneAndUpdate(
            {
                _id: chefId,
                role: "CHEF",
                isActive: true,
                "chefProfile.reviews.userId": { $ne: userId },
            },
            {
                $push: {
                    "chefProfile.reviews": newReview,
                },
            },
            {
                new: true,
            }
        );

        if (!updatedChef) {
            const chefExists = await User.exists({
                _id: chefId,
                role: "CHEF",
                isActive: true,
            });

            if (!chefExists) {
                throw new ApiError(
                    404,
                    "Chef not found or is inactive"
                );
            }

            throw new ApiError(
                409,
                "You have already reviewed this chef"
            );
        }

        // Keep User.reviewsGiven synchronized
        const updatedReviewer = await User.findByIdAndUpdate(userId, {
            $push: {
                reviewsGiven: {
                    targetType: "User",
                    targetId: chefId,
                    rating,
                    message: message.trim(),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            },
        }, { new: true }).select("reviewsGiven")
            .populate({
                path: "reviewsGiven.targetId",
                select: "_id profile.name profile.avatar title thumbnail",
            })
            .lean();

        recalculateChefRatings(updatedChef);
        await updatedChef.save();
        const cachedChef = updatedChef.toObject();

        await Promise.all([
            UserCacheService.updateReviewsGiven(userId, updatedReviewer.reviewsGiven),
            UserCacheService.invalidateChefReviews(chefId),
            UserCacheService.updateProfile(chefId, cachedChef),
        ]);

        return res
            .status(201)
            .json(new ApiResponse(201, "Review added successfully"));
    } catch (error) {
        console.error("Error adding chef review:", error);
        error instanceof ApiError
            ? next(error)
            : next(
                new ApiError(500, "Something went wrong while adding chef review")
            );
    }
};

const updateChefReview = async (req, res, next) => {
    try {
        const { chefId } = req.params;
        const userId = req.user._id;

        const rating = Number(req.body.rating);
        const message = req.body.message;

        if (!mongoose.Types.ObjectId.isValid(chefId)) {
            throw new ApiError(400, "Invalid chef ID format");
        }

        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            throw new ApiError(400, "Rating is required and must be between 1 and 5");
        }

        let trimmedMessage;
        if (message !== undefined) {
            trimmedMessage = message.trim();
            if (!trimmedMessage) {
                throw new ApiError(400, "Review message is required");
            }
            if (trimmedMessage.length > 1000) {
                throw new ApiError(400, "Message cannot exceed 1000 characters");
            }
        }

        const now = new Date();

        const updatedChef = await User.findOneAndUpdate(
            {
                _id: chefId,
                role: "CHEF",
                isActive: true,
                "chefProfile.reviews.userId": userId,
            },
            {
                $set: {
                    "chefProfile.reviews.$.rating": rating,
                    "chefProfile.reviews.$.updatedAt": now,
                    ...(message !== undefined
                        ? { "chefProfile.reviews.$.message": trimmedMessage }
                        : {}),
                },
            },
            { new: true }
        );

        if (!updatedChef) {
            const chefExists = await User.exists({
                _id: chefId,
                role: "CHEF",
                isActive: true,
            });

            if (!chefExists) {
                throw new ApiError(404, "Chef not found or is inactive");
            }

            throw new ApiError(404, "Review not found");
        }

        const userUpdateFields = {
            "reviewsGiven.$[elem].rating": rating,
            "reviewsGiven.$[elem].updatedAt": now,
        };

        if (message !== undefined) {
            userUpdateFields["reviewsGiven.$[elem].message"] = trimmedMessage;
        }

        const updatedReviewer = await User.findByIdAndUpdate(
            userId,
            {
                $set: userUpdateFields,
            },
            {
                new: true,
                arrayFilters: [
                    {
                        "elem.targetType": "User",
                        "elem.targetId": new mongoose.Types.ObjectId(chefId),
                    },
                ],
            }
        )
            .select("reviewsGiven")
            .populate({
                path: "reviewsGiven.targetId",
                select: "_id profile.name profile.avatar title thumbnail",
            })
            .lean();

        if (!updatedReviewer) {
            throw new ApiError(500, "Failed to synchronize user's reviewsGiven");
        }

        recalculateChefRatings(updatedChef);
        await updatedChef.save();

        const cachedChef = updatedChef.toObject();

        await Promise.all([
            UserCacheService.updateReviewsGiven(userId, updatedReviewer.reviewsGiven),
            UserCacheService.invalidateChefReviews(chefId),
            UserCacheService.updateProfile(chefId, cachedChef),
        ]);

        return res
            .status(200)
            .json(new ApiResponse(200, "Review updated successfully"));
    } catch (error) {
        console.error("Error updating chef review:", error);
        return error instanceof ApiError
            ? next(error)
            : next(new ApiError(500, "Something went wrong while updating chef review"));
    }
};

const deleteChefReview = async (req, res, next) => {
    try {
        const { chefId } = req.params;
        const userId = req.user._id;

        if (!mongoose.Types.ObjectId.isValid(chefId)) {
            throw new ApiError(400, "Invalid chef ID format");
        }

        // Remove review from chef
        const updatedChef = await User.findOneAndUpdate(
            {
                _id: chefId,
                role: "CHEF",
                isActive: true,
                "chefProfile.reviews.userId": userId,
            },
            {
                $pull: {
                    "chefProfile.reviews": {
                        userId,
                    },
                },
            },
            {
                new: true,
            }
        );

        if (!updatedChef) {
            const chefExists = await User.exists({
                _id: chefId,
                role: "CHEF",
                isActive: true,
            });

            if (!chefExists) {
                throw new ApiError(404, "Chef not found or is inactive");
            }

            throw new ApiError(404, "Review not found or could not be deleted");
        }

        // Remove review from reviewsGiven
        const updatedReviewer = await User.findByIdAndUpdate(
            userId,
            {
                $pull: {
                    reviewsGiven: {
                        targetType: "User",
                        targetId: new mongoose.Types.ObjectId(chefId),
                    },
                },
            },
            {
                new: true,
            }
        )
            .select("reviewsGiven")
            .populate({
                path: "reviewsGiven.targetId",
                select: "_id profile.name profile.avatar title thumbnail",
            })
            .lean();

        if (!updatedReviewer) {
            throw new ApiError(
                500,
                "Failed to synchronize user's reviewsGiven"
            );
        }

        // Recalculate chef rating after deletion
        recalculateChefRatings(updatedChef);
        await updatedChef.save();

        const cachedChef = updatedChef.toObject();

        // Update caches
        await Promise.all([
            UserCacheService.updateReviewsGiven(userId, updatedReviewer.reviewsGiven),
            UserCacheService.invalidateChefReviews(chefId),
            UserCacheService.updateProfile(chefId, cachedChef),
        ]);

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    "Review deleted successfully"
                )
            );
    } catch (error) {
        console.error("Error deleting chef review:", error);
        return next(
            error instanceof ApiError
                ? error
                : new ApiError(
                    500,
                    "Something went wrong while deleting chef review"
                )
        );
    }
};

const getAllChefReviews = async (req, res, next) => {
    try {
        const { chefId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        if (!mongoose.Types.ObjectId.isValid(chefId)) {
            throw new ApiError(400, "Invalid chef ID format");
        }

        let summaryData = await UserCacheService.getChefReviews(chefId);

        if (!summaryData) {
            const chef = await User.findOne({
                _id: chefId,
                role: "CHEF",
                isActive: true
            }).select("chefProfile.averageRating chefProfile.reviews.rating").lean();

            if (!chef) {
                throw new ApiError(404, "Chef not found or is inactive");
            }

            const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
            const reviewsList = chef.chefProfile?.reviews || [];
            reviewsList.forEach((r) => {
                if (r.rating >= 1 && r.rating <= 5) {
                    breakdown[r.rating]++;
                }
            });

            summaryData = {
                averageRating: chef.chefProfile?.averageRating || 0,
                totalReviews: reviewsList.length,
                breakdown,
            };

            await UserCacheService.updateChefReviews(chefId, summaryData);
        }

        // Always fetch paginated reviews from DB (not from cache)
        const chef = await User.findOne({ _id: chefId, role: "CHEF", isActive: true })
            .select("chefProfile.reviews")
            .populate({ path: "chefProfile.reviews.userId", select: "profile.name profile.avatar" })
            .lean();

        const sortedReviews = (chef?.chefProfile?.reviews || []).sort(
            (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        );
        const paginatedReviews = sortedReviews.slice(skip, skip + limit);

        return res.status(200).json(
            new ApiResponse(200, "Review summary fetched successfully", {
                reviews: paginatedReviews,
                meta: {
                    page,
                    limit,
                    totalPages: Math.ceil(summaryData.totalReviews / limit),
                    averageRating: summaryData.averageRating,
                    totalReviews: summaryData.totalReviews,
                    breakdown: summaryData.breakdown,
                }
            })
        );
    } catch (error) {
        console.error("Error fetching chef review summary:", error);
        error instanceof ApiError
            ? next(error)
            : next(
                new ApiError(500, "Something went wrong while fetching chef review summary")
            );
    }
};

const handleGetMyReviewsGiven = async (req, res, next) => {
    try {
        const userId = req.user._id;

        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.max(parseInt(req.query.limit, 10) || 4, 1);
        const skip = (page - 1) * limit;

        let reviewsGiven = await UserCacheService.getReviewsGiven(userId);

        if (!reviewsGiven) {
            const user = await User.findOne({
                _id: userId,
                isActive: true,
            })
                .select("reviewsGiven")
                .populate({
                    path: "reviewsGiven.targetId",
                    select: "_id profile.name profile.avatar title thumbnail",
                })
                .lean();

            if (!user) {
                throw new ApiError(404, "User not found");
            }

            reviewsGiven = user.reviewsGiven || [];

            await UserCacheService.updateReviewsGiven(userId, reviewsGiven);
        }

        const sortedReviewsGiven = [...reviewsGiven].sort(
            (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        );

        const totalReviews = sortedReviewsGiven.length;
        const totalPages = Math.ceil(totalReviews / limit);
        const paginatedReviews = sortedReviewsGiven.slice(skip, skip + limit);

        return res.status(200).json(
            new ApiResponse(200, "Reviews given fetched successfully", {
                reviewsGiven: paginatedReviews,
                meta: {
                    page,
                    limit,
                    totalReviews,
                    totalPages,
                },
            })
        );
    } catch (error) {
        console.error("Error fetching reviews given:", error);

        return next(
            error instanceof ApiError
                ? error
                : new ApiError(
                    500,
                    "Something went wrong while fetching reviews given"
                )
        );
    }
};

export {
    handleRegister,
    handleLogin,
    handleGuestLogin,
    handleLogout,
    handleGetProfile,
    handleChangeAvatar,
    handleChangePassword,
    handleForgetPassword,
    handleResetPassword,
    handleGetMySubscriptions,
    handleUpdateProfile,
    handleGetUserById,
    handleGetMySubscribers,
    handleGetChefRecipesById,
    handleContactus,
    handleGetFavourites,
    // handleSubscribeToChef,
    // handleUnsubscribeFromChef,
    addChefReview,
    updateChefReview,
    deleteChefReview,
    getAllChefReviews,
    handleGetMyReviewsGiven,
};
