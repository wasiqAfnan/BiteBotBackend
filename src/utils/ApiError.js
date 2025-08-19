class ApiError extends Error {
    constructor(statusCode = 500, message = "Operation Failed") {
        super(message);
        this.success = false;
        this.statusCode = Number(statusCode);
        this.data = null;
        Error.captureStackTrace(this, this.constructor);
    }
}

export default ApiError;
