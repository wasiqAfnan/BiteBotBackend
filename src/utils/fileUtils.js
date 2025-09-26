import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import path from "path";
import constants from "../constants.js";
import { ApiError } from "../utils/ApiError.js";

const deleteLocalFile = async (localFilePath) => {
    try {
        if (fs.existsSync(localFilePath)) {
            await fs.promises.unlink(localFilePath);
        }
    } catch (error) {
        throw new ApiError(500, "Error while deleting local file");
    }
};

const uploadImageToCloud = async (localFilePath) => {
    // Check if localFilePath is empty
    if (!localFilePath) return null;

    try {
        // Upload image
        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "image",
            moderation: constants.CLOUDINARY_IMAGE_MODERATION,
            folder: "uploads/images", // organize in Cloudinary
        });

        // Delete local files
        await deleteLocalFile(localFilePath);

        if (
            response?.moderation?.length > 0 &&
            response?.moderation[0]?.status === "rejected"
        ) {
            throw new ApiError(
                400,
                "This image is not safe to upload, please upload a different image"
            );
        }

        // Return public_id and secure_url
        return {
            public_id: response.public_id,
            secure_url: response.secure_url,
        };
    } catch (error) {
        await deleteLocalFile();
        throw new ApiError(500, error.message);
    }
};
