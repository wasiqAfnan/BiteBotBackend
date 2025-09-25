import jwt from "jsonwebtoken";
import User from "../models/user.models.js";
import { ApiError, ApiResponse } from "../utils/index.js";
import constants from "../constants.js";

export const isLoggedIn = async (req, res, next) => {
    try {
        // get the token from cookie
        const accessToken = req.cookies.accessToken;

        // validate
        if (!accessToken) {
            throw new ApiError(401, "Not logged in");
        }

        // decode token
        const payload = jwt.verify(accessToken, constants.ACCESS_TOKEN_SECRET);

        // finding user on db based on decoded token data
        const user = await User.findOne({ _id: payload._id });

        // validate user
        if (!user) {
            throw new ApiError(401, "Not logged in");
        }

        // if user exist then setting up req.user obj to pass to handler
        req.user = user;

        return next();
    } catch (error) {
        console.log("Some Error Occured: ", error);
        // If the error is already an instance of ApiError, pass it to the error handler
        if (error instanceof ApiError) {
            return next(error);
        }

        // For all other errors, send a generic error message
        return next(new ApiError(500, "Something went wrong!"));
    }
};
