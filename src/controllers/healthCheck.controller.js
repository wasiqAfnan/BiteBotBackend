import { ApiError, ApiResponse } from "../utils/index.js";
import mongoose from "mongoose";
import sendMail from "../utils/sendMail.js";

export const handleHealthCheck = async (req, res) => {
    // send mail
    // try {
    //    const resp = await sendMail({
    //         to: "subhranil.chak.sc@gmail.com",
    //         subject: "Health Check",
    //         html: "<h1>Mail is working. Sent through bitebot server</h1>",
    //     });
    //     console.log("Mail sent successful",resp);
    // } catch (error) {
    //     console.log("Error sending mail:", error);
    // };

    return res
        .status(200)
        .json(new ApiResponse(200, "Server is up and running"));
};

export const handleDbPing = async (req, res) => {
    try {
        const resp = await mongoose.connection.db.admin().ping();
        return res
            .status(200)
            .json(new ApiResponse(200, "DB is up and running", resp));
    } catch (err) {
        res.status(500).json("DB ping failed");
    }
};
