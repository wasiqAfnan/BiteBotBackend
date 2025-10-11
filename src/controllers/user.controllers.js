import User from "../models/user.models.js";
import {
    ApiResponse,
    ApiError,
    uploadImageToCloud,
    deleteLocalFile,
    deleteCloudFile,
    isBlankValue,
    convertToMongoKey
} from "../utils/index.js";

export const handleRegister = async (req, res, next) => {
    try {
        // get name, email and pw from body
        const { email, password, profile_name, profile_cuisine, profile_dietaryLabels } = req.body;

        // validate
        if (!(email && password && profile_name && profile_cuisine)) {
            throw new ApiError( 400, "All field must be passed");
        }

        // Email format validation using regex
        const emailRegex =
            /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

        if (!emailRegex.test(email)) {
            throw new ApiError(400, "Email Not Valid");
        }

        // Password validation in controller
        const passwordRegex =
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
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

        if(profile_dietaryLabels) dietaryLabels = profile_dietaryLabels;

        // Create new user object
        const newUser = new User({
            email: email.toLowerCase(),
            password: password,
            profile: profileData,
            favourites: [], // Initialize empty favourites array
        });

        // Save user to database
        const savedUser = await newUser.save();
        savedUser.password = undefined;

        // token create
        const accessToken = await newUser.generateAccessToken();

        // send cookie
        res.cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: "None",
            maxAge: 24 * 60 * 60 * 1000, // 1 day
        });

        // send response
        return res.status(201).json(
            new ApiResponse(201, "User Created Successfully", {
                savedUser,
            })
        );
    } catch (error) {
        console.log("Some Error Occured: ", error);
        // If the error is already an instance of ApiError, pass it to the error handler
        if (error instanceof ApiError) {
            return next(error);
        }

        // For all other errors, send a generic error message
        return next(
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
        let user = await User.findOne({ email }).select("+password");

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
        user.password = undefined;

        // send cookie
        res.cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: "None",
            maxAge: 24 * 60 * 60 * 1000, // 1 day
        });

        // send response
        return res
            .status(200)
            .json(new ApiResponse(200, "Login Successful", user));
    } catch (error) {
        console.log("Some Error Occured: ", error);
        // If the error is already an instance of ApiError, pass it to the error handler
        if (error instanceof ApiError) {
            return next(error);
        }

        // For all other errors, send a generic error message
        return next(new ApiError(500, "Something went wrong during login"));
    }
};

export const handleLogout = async (req, res, next) => {
    try {
        res.clearCookie("accessToken", {
            httpOnly: true,
            secure: true,
        });

        return res
            .status(200)
            .json(new ApiResponse(200, "Logged out successfully"));
    } catch (error) {
        console.log("Some Error Occured: ", error);
        // If the error is already an instance of ApiError, pass it to the error handler
        if (error instanceof ApiError) {
            return next(error);
        }

        // For all other errors, send a generic error message
        return next(new ApiError(500, "Something went wrong during logout"));
    }
};

export const handleChangeAvatar = async (req, res, next) => {
    const avatarLocalPath = req.file ? req.file.path : "";
    try {
        // Get avatar file from request

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
        await deleteLocalFile(avatarLocalPath);
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

export const handleResetPassword = async (req, res, next) => {};

export const handleForgetPassword = async (req, res, next) => {};

export const handleGetProfile = async (req, res, next) => {
    try {
        const user = req.user;
        return res
            .status(200)
            .json(new ApiResponse(200, "Profile Data Fetched Successfully", user));
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
        const body = req.body;
        const updates = {};

        // SECURITY: Whitelist allowed fields only
        const allowedFields = [
            "profile_name",
            "profile_bio",
            "profile_dietaryLabels",
            "profile_allergens",
            "profile_cuisine",
            "chefProfile_education",
            "chefProfile_experience",
            "chefProfile_externalLinks",
            "chefProfile_subscriptionPrice",
            "chefProfile_recipes",
            "favourites",
        ];

        for (const key in body) {
            if (body.hasOwnProperty(key)) {
                // SECURITY: Only process whitelisted fields
                if (!allowedFields.includes(key)) {
                    continue; // Skip unauthorized fields
                }

                // check for blank fields
                if (isBlankValue(body[key])) {
                    continue;
                }

                // Convert to dot notation and add to updates
                updates[convertToMongoKey(key)] = body[key];
            }
        }

        console.log(updates);

        if (Object.keys(updates).length === 0) {
            return new ApiError(403, "No fields to update");
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: updates }, // update only required fields
            { new: true, runValidators: true }
        );

        if (!updatedUser) {
            return new ApiError(403, "No user found");
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
        return next(
            new ApiError(500, "Something went wrong during update")
        );
    }
};
