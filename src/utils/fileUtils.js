import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import path from "path";
import constants from "../constants.js";
import { ApiError } from "./index.js";

export const deleteLocalFile = async (localFilePath) => {
    try {
        if (!localFilePath) return;

        const absolutePath = path.resolve(localFilePath);

        if (!(fs.existsSync(absolutePath))) {
            console.log("Error while deleting local file");
        }
        await fs.promises.unlink(absolutePath);
        console.log("Deleted local file:", absolutePath);
    } catch (error) {
        console.log("File delete error:", error);
        throw new ApiError(500, "Error while deleting local file");
    }
};

export const uploadImageToCloud = async (localFilePath) => {
    // Check if localFilePath is empty
    if (!localFilePath) return null;

    try {
        // Upload image
        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "image",
            // moderation: constants.CLOUDINARY_IMAGE_MODERATION,
            folder: "uploads/images", // organize in Cloudinary
        });

        // Delete local files
        await deleteLocalFile(localFilePath);

        // paid feature
        // if (
        //     response?.moderation?.length > 0 &&
        //     response?.moderation[0]?.status === "rejected"
        // ) {
        //     throw new ApiError(
        //         400,
        //         "This image is not safe to upload, please upload a different image"
        //     );
        // }

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

export const deleteCloudFile = async (public_id) => {
    try {
        if (!public_id) return true;

        const resource_type = public_id.split("_")[1].split("/")[0];

        console.log(public_id);
        console.log(resource_type);

        await cloudinary.uploader.destroy(public_id, {
            resource_type: resource_type,
        });

        return true;
    } catch (error) {
        throw new ApiError(500, error.message);
    }
};
