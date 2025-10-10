// Helper: Check if value is empty/blank
export const isBlankValue = (value) => {
    // Check for undefined or null
    if (value === undefined || value === null) {
        return true;
    }

    // Check for empty string or whitespace-only string
    if (typeof value === "string" && value.trim() === "") {
        return true;
    }

    return false;
};

// Helper: Convert underscore to dot notation with camelCase
export const convertToMongoKey = (key) => {
    let mongoKey = key.replace(/_/g, ".");
    return mongoKey;
};
