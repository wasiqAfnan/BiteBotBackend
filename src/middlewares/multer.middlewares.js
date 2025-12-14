// import path from "path";
// import fs from "fs";
// import multer from "multer";

// // Ensure the upload directory exists
// // const uploadDir = path.join(process.cwd(), "tmp", "uploads");

// const uploadDir = "/tmp/uploads";
// // Ensure the folder exists
// if (!fs.existsSync(uploadDir)) {
//     fs.mkdirSync(uploadDir, { recursive: true });
// }

// // Allowed file types
// const allowedExtensions = [".jpg", ".jpeg", ".webp", ".png"];
// const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];

// // defining storage to use in later multer setup
// const storage = multer.diskStorage({
//     destination: (_req, _file, cb) => {
//         cb(null, uploadDir);
//     },
//     filename: (_req, file, cb) => {
//         // Prevent overwrite: add timestamp + random suffix
//         const name = path.parse(file.originalname).name; // extracting orignal name only without extension
//         const ext = path.extname(file.originalname); // extracting extension only
//         const uniqueName = `${name}-${Date.now()}${ext}`; // adding original name + curr date + extension to achieve uniqueness
//         cb(null, uniqueName);
//     },
// });

// // checking uploaded file has proper extension and mime type or not
// const fileFilter = (_req, file, cb) => {
//     const ext = path.extname(file.originalname).toLowerCase();
//     const mime = file.mimetype;

//     if (!allowedExtensions.includes(ext) || !allowedMimeTypes.includes(mime)) {
//         return cb(new Error(`Unsupported file type! ${ext}`), false);
//     }
//     cb(null, true);
// };

// // creating final upload structure
// const upload = multer({
//     storage,
//     limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
//     fileFilter,
// });

// export default upload;

import path from "path";
import multer from "multer";
import { ApiError } from "../utils/index.js";

const storage = multer.diskStorage({
    destination: "./public/temp",

    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname);

        const uniqueName = `${Date.now()}-${Math.round(
            Math.random() * 1e9
        )}${ext}`;

        cb(null, uniqueName);
    },
});

const fileFilter = (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
        return cb(new ApiError(`Invalid file type: ${ext}`, 400), false);
    }

    cb(null, true);
};

const upload = multer({
    storage, // destinataion and filename settings
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter, // file type checking
});

export default upload;
