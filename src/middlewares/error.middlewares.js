import constants from "../constants.js";

const errorMiddleware = (err, req, res, next) => {
    // Get error details
    let { statusCode, message, stack } = err;

    if (constants.NODE_ENV === "development") {
        // Send error response
        return res.status(statusCode || 500).json({
            statusCode,
            message: message || "Something went wrong",
            stack: stack || "",
        });
    }

    // Capture the error message part only
    const errorPattern = / Error: (.*)/;
    const match = message.match(errorPattern);
    if (match && match[1]) {
        message = match[1].trim();
    } else {
        let parts = message.split("::");
        console.log(parts);
        message = parts[parts.length - 1].trim();
    }

    // Send error response
    return res.status(statusCode || 500).json({
        statusCode,
        message: message || "Something went wrong",
    });
};

export default errorMiddleware;
