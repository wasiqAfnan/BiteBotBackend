import { ApiError, ApiResponse } from "../utils/index.js";
export const handleHealthCheck = (req, res) => {
    return res
        .status(200)
        .json(new ApiResponse(200, "Server is up and running"));
};
