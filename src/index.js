import app from "./app.js";
import constants from "./constants.js";
import connectDb from "./configs/mongoDB.configs.js";

const port = constants.PORT || 5000;

connectDb().then(
    app.listen(port, () =>
        console.log(`Server is running. URL: http://localhost:${port}`)
    )
);
