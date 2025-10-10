import app from "./app.js";
import constants from "./constants.js";
import connectToDb from "./configs/mongoDB.configs.js";
import connectToCloudinary from "./configs/cloudinary.configs.js";

const port = constants.PORT || 5000;

// First trying to connect to db. If error then exit
connectToDb().then(() => {
    // If db connected then try to connect to cloudinary
    // The server will start though clodianry failed to connect
    connectToCloudinary().finally(() => {
        // starting the server
        app.listen(port, () =>
            console.log(`Server is running. URL: http://localhost:${port}`)
        );
    });
});
