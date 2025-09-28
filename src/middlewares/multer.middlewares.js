import path from "path";
import fs from "fs";
import multer from "multer";

// Ensure the upload directory exists
const uploadDir = "./public/uploads";
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Allowed file types
const allowedExtensions = [".jpg", ".jpeg", ".webp", ".png"];
const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];

// defining storage to use in later multer setup
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
        // Prevent overwrite: add timestamp + random suffix
        const name = path.parse(file.originalname).name; // extracting orignal name only without extension
        const ext = path.extname(file.originalname); // extracting extension only
        const uniqueName = `${name}-${Date.now()}${ext}`; // adding original name + curr date + extension to achieve uniqueness
        cb(null, uniqueName);
    },
});

// checking uploaded file has proper extension and mime type or not
const fileFilter = (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype;

    if (!allowedExtensions.includes(ext) || !allowedMimeTypes.includes(mime)) {
        return cb(new Error(`Unsupported file type! ${ext}`), false);
    }
    cb(null, true);
};

// creating final upload structure
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter,
});

export default upload;
