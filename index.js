const express = require('express');
const app = express();
const mongoose = require('mongoose');

// Import Models
require('./models/user'); // this line showing error
require('./models/Recipe');
require('./models/NutritionEntry');
require('./models/Subscription');

const MONGO_URL = "mongodb://127.0.0.1:27017/bitebot";

main()
    .then(() => {
        console.log("Connected to Database bitebot");
    })
    .catch((err) => {
        console.log(err);
    });

async function main() {
    await mongoose.connect(MONGO_URL);
}

app.get('/', (req, res) => res.status(200).json({ message: "Welcome to API of BiteBot" }));

app.listen(8080, () => console.log("Server Running"));