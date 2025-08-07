class ApiError extends Error {
    constructor(message = "Operation Failed", statusCode = 500) {
        super(message);
        this.statusCode = Number(statusCode);
        this.data = null;
        Error.captureStackTrace(this, this.constructor);
    }
}

export default ApiError;
