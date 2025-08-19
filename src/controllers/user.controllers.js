import { ApiResponse, ApiError } from "../utils/index.js";
import User from "../models/user.models.js";

export const handleRegister = async (req, res, next) => {
    try {
        // get name, email and pw from body
        const { email, password, profile } = req.body;

        // validate
        if (!(email && password && profile && profile.name)) {
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
            name: profile.name,
        };

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
        // send response
        return res.status(201).json(
            new ApiResponse(201, "User Created Successfully", {
                savedUser
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
export const handleLogin = (req, res) => {
    res.status(200).json();
};
