import { ApiResponse, ApiError } from "../utils/index.js";
import User from "../models/user.models.js";

export const handleRegister = async (req, res, next) => {
    try {
        // get name, email and pw from body
        const { email, password, profile_name } = req.body;

        // validate
        if (!(email && password && profile_name)) {
            throw new ApiError("All field must be passed", 400);
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
        };

        // Create new user object
        const newUser = new User({
            email: email.toLowerCase(),
            password: password,
            profile: profileData,
            favourites: [], // Initialize empty favourites array
        });

        // Save user to database
        // const savedUser = await newUser.save();
        // savedUser.password = undefined;

        // token create
        const accessToken = await newUser.generateAccessToken();
        const refreshToken = await newUser.generateRefreshToken();

        // saving refresh token to db
        newUser.refreshToken = refreshToken;
        const savedUser = await newUser.save();
        
        savedUser.password = undefined;
        savedUser.refreshToken = undefined;
        savedUser.password = undefined;

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
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 day
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
        const refreshToken = await user.generateRefreshToken();

        // saving refresh token to db
        user.refreshToken = refreshToken;
        await user.save();

        user.refreshToken = undefined;
        user.password = undefined;

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
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 day
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
        return next(
            new ApiError(500, "Something went wrong during login")
        );
    }
};

export const handleLogout = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id);
        user.refreshToken = undefined;
        await user.save();

        res.clearCookie("accessToken", {
            httpOnly: true,
            secure: true,
        }).clearCookie("refreshToken", {
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
        return next(
            new ApiError(500, "Something went wrong during logout")
        );
    }
    
};
