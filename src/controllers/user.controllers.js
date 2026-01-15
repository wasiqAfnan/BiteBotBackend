import User from "../models/user.models.js";
import {
    ApiResponse,
    ApiError,
    uploadImageToCloud,
    deleteLocalFiles,
    deleteCloudFile,
    // isBlankValue,
    // convertToMongoKey,
} from "../utils/index.js";
import constants from "../constants.js";
import sendMail from "../utils/sendMail.js";
import welcomeTemplate from "../emailTemplates/welcome.template.js";
import forgotPasswordTemplate from "../emailTemplates/forgotPassword.template.js";
import crypto from "crypto";

export const handleRegister = async (req, res, next) => {
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

        // send welcome email
        await sendMail(
            newUser.email,
            "Welcome to BiteBot",
            welcomeTemplate({ name: newUser.profile.name })
        );

        // send response
        return res.status(201).json(
            new ApiResponse(201, "User Created Successfully", {
                newUser,
            })
        );
    } catch (error) {
        console.log("Some Error Occured: ", error);
        // If the error is already an instance of ApiError, pass it to the error handler
        error instanceof ApiError
            ? next(error)
            : next(
                  new ApiError(500, "Something went wrong during registration")
              );
    }
};

export const handleLogin = async (req, res, next) => {
    try {
        // get email and pw from body
        const { email, password } = req.body;

        // validate
        if (!(email && password)) {
            throw new ApiError(400, "All field must be passed");
        }

        // validate if user exists
        let user = await User.findOne({ email })
            .select("+password")
            .populate("profile.subscribed")
            .populate("chefProfile.recipes");

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

        // send response
        return res
            .status(200)
            .json(new ApiResponse(200, "Login Successful", user));
    } catch (error) {
        console.log("Some Error Occured: ", error);

        // If the error is already an instance of ApiError, pass it to the error handler
        error instanceof ApiError
            ? next(error)
            : next(new ApiError(500, "Something went wrong during login"));
    }
};

export const handleLogout = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id);
        user.refreshToken = undefined; // Remove refresh token from db
        await user.save();

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
        console.log("Some Error Occured: ", error);
        // If the error is already an instance of ApiError, pass it to the error handler
        error instanceof ApiError
            ? next(error)
            : next(new ApiError(500, "Something went wrong during logout"));
    }
};

export const handleChangeAvatar = async (req, res, next) => {
    try {
        // Get avatar file from request
        const avatarLocalPath = req.file ? req.file.path : "";

        // Check if avatar file is empty
        if (!avatarLocalPath) {
            throw new ApiError(400, "No avatar file provided");
        }

        // Find current user
        const user = await User.findById(req.user._id).select("profile.avatar");
        if (!user) {
            throw new ApiError(403, "User Not Found, please login again");
        }

        // Upload avatar to Cloudinary
        const newAvatar = await uploadImageToCloud(avatarLocalPath);
        if (!newAvatar.public_id || !newAvatar.secure_url) {
            throw new ApiError(400, "Error uploading avatar");
        }

        // Delete old avatar
        // console.log(user?.profile?.avatar?.public_id);
        const result = await deleteCloudFile(user?.profile?.avatar?.public_id);
        if (!result) {
            await deleteCloudFile(newAvatar.public_id);
            throw new ApiError(400, "Error deleting old avatar");
        }

        // Update DB user with new avatar
        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            { "profile.avatar": newAvatar },
            { new: true }
        ).select("profile.avatar");

        res.status(200).json(
            new ApiResponse(200, "Avatar Uploaded Successfully", updatedUser)
        );
    } catch (error) {
        await deleteLocalFiles(avatarLocalPath);
        console.log("Some Error Occured: ", error);
        // If the error is already an instance of ApiError, pass it to the error handler
        if (error instanceof ApiError) {
            return next(error);
        }

        // For all other errors, send a generic error message
        return next(
            new ApiError(500, "Something went wrong during file upload")
        );
    }
};

export const handleChangePassword = async (req, res, next) => {
    try {
        const { oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword) {
            throw new ApiError("All fields are required", 400);
        }

        const user = await User.findById(req.user._id).select("+password");
        if (!(await user.isPasswordCorrect(oldPassword))) {
            throw new ApiError(401, "Incorrect credentials");
        }

        user.password = newPassword;
        await user.save();

        return res
            .status(200)
            .json(new ApiResponse(200, "Password changed successfully"));
    } catch (error) {
        // If the error is already an instance of ApiError, pass it to the error handler
        if (error instanceof ApiError) {
            return next(error);
        }

        // For all other errors, send a generic error message
        return next(
            new ApiError(500, "Something went wrong during file upload")
        );
    }
};

export const handleForgetPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email) {
            throw new ApiError(400, "Email is required");
        }

        const user = await User.findOne({ email });
        if (!user) {
            throw new ApiError(400, "User not found with this mail");
        }

        // generate reset token
        const resetToken = crypto.randomBytes(20).toString("hex");

        console.log("Reset Token: ", resetToken);
        
        // generate hash of reset token to store in db
        const forgotPasswordToken = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");

        console.log("forgotPasswordToken: ", forgotPasswordToken);

        // generate expiry date
        const forgotPasswordExpiry = Date.now() + 15 * 60 * 1000;

        // generate reset password url
        const resetPasswordUrl = `${constants.FRONTEND_URL}/resetpassword/${resetToken}`;

        console.log("resetPasswordUrl: ", resetPasswordUrl);

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

        return res.status(200).json({
            success: true,
            message: `Reset password link has been sent to ${email} successfully`,
        });
    } catch (error) {
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

export const handleResetPassword = async (req, res, next) => {
    try {
        const { resetToken, password } = req.body;
        if (!resetToken || !password) {
            throw new ApiError(400, "All fields are required");
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

        return res
            .status(200)
            .json(new ApiResponse("Password reset successfully"));
    } catch (error) {
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

export const handleGetProfile = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id)
            .populate("profile.subscribed")
            .populate("chefProfile.recipes");

        return res
            .status(200)
            .json(
                new ApiResponse(200, "Profile Data Fetched Successfully", user)
            );
    } catch (error) {
        // If the error is already an instance of ApiError, pass it to the error handler
        if (error instanceof ApiError) {
            return next(error);
        }

        // For all other errors, send a generic error message
        return next(
            new ApiError(500, "Something went wrong during file upload")
        );
    }
};

export const handleUpdateProfile = async (req, res, next) => {
    try {
        const userId = req.user.id; // from auth middleware

        // Map request body keys to user profile fields
        const fieldMap = {
            name: "profile.name",
            bio: "profile.bio",
            dietaryLabels: "profile.dietaryLabels",
            allergens: "profile.allergens",
            cuisine: "profile.cuisine",
            dietaryDraft: "profile.dietaryDraft",
            allergenDraft: "profile.allergenDraft",
        };

        const updates = {};
        for (const key in req.body) {
            updates[fieldMap[key]] = req.body[key];
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.user.id,
            { $set: updates }, // already validated
            { new: true, runValidators: true }
        );

        if (!updatedUser) {
            throw new ApiError(403, "No user found");
        }

        return res
            .status(200)
            .json(
                new ApiResponse(200, "User updated successfully", updatedUser)
            );
    } catch (error) {
        // If the error is already an instance of ApiError, pass it to the error handler
        if (error instanceof ApiError) {
            return next(error);
        }

        // For all other errors, send a generic error message
        return next(new ApiError(500, "Something went wrong during update"));
    }
};

export const handleGetUserById = async (req, res, next) => {
    try {
        const userId = req.params.id;

        // populate function: Instead of just giving the ObjectId, replace it with the actual document from the referenced collection.
        // This is useful when you want to retrieve a document from a referenced collection and include its fields.
        const user = await User.findById(userId)
            .populate("profile.subscribed")
            .populate("chefProfile.recipes");

        if (!user) {
            throw new ApiError(404, "User not found");
        }
        return res
            .status(200)
            .json(new ApiResponse(200, "User fetched successfully", user));
    } catch (error) {
        console.log("Some error occured: ", error);

        // If the error is already an instance of ApiError, pass it to the error handler
        error instanceof ApiError
            ? next(error)
            : next(
                  new ApiError(500, "Something went wrong during fetching user")
              );
    }
};

export const handleGetFavourites = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id).populate("favourites");

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    "Favourites fetched successfully",
                    user.favourites
                )
            );
    } catch (error) {
        console.log("Some error occured: ", error);

        // If the error is already an instance of ApiError, pass it to the error handler
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

export const handleSubscribeToChef = async (req, res, next) => {
    try {
        const { chefId } = req.params;
        const userId = req.user._id;

        if (userId.toString() === chefId.toString()) {
            throw new ApiError(400, "You cannot subscribe to yourself");
        }

        const user = await User.findById(userId);
        const chef = await User.findById(chefId);

        if (!chef || chef.role !== "CHEF") {
            throw new ApiError(404, "Chef not found");
        }

        // check if already subscribed
        if (user.profile.subscribed.includes(chefId)) {
            throw new ApiError(400, "Already subscribed to this chef");
        }

        // push subscription
        user.profile.subscribed.push(chefId);
        chef.chefProfile.subscribers.push(userId);

        await user.save({ validateBeforeSave: false });
        await chef.save({ validateBeforeSave: false });

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

export const handleUnsubscribeFromChef = async (req, res, next) => {
    try {
        const { chefId } = req.params;
        const userId = req.user._id;

        const user = await User.findById(userId);
        const chef = await User.findById(chefId);

        if (!chef || chef.role !== "CHEF") {
            throw new ApiError(404, "Chef not found");
        }

        // Remove subscription
        user.profile.subscribed = user.profile.subscribed.filter(
            (id) => id.toString() !== chefId.toString()
        );
        chef.chefProfile.subscribers = chef.chefProfile.subscribers.filter(
            (id) => id.toString() !== userId.toString()
        );

        await user.save({ validateBeforeSave: false });
        await chef.save({ validateBeforeSave: false });

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
