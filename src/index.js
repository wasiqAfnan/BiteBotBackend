import app from "./app.js";
import constants from "./constants.js";

const port = constants.PORT || 5000;
app.listen(port, () =>
    console.log(`Server is running. URL: http://localhost:${port}`)
);
