import express from "express";
import errorMiddleware from "./middlewares/error.middlewares.js";
import { userRoutes, healthCheckRoutes } from "./routes/index.js";
import cookieParser from "cookie-parser";
import recipeRouter from "./routes/recipe.routes.js";
import constants from "./constants.js";
import cors from "cors";

const app = express();


// cors setup
// const corsOptions = {
//   origin: function (origin, callback) {
//     // Allow requests with no origin (like mobile apps or Postman)
//     if (!origin || constants.ALLOWED_ORIGINS.includes(origin)) {
//       callback(null, true);
//     } else {
//       callback(new Error('Not allowed by CORS'), false);
//     }
//   },
//   credentials: true,
// }
const corsOptions = {
  origin: constants.ALLOWED_ORIGINS,
  credentials: true,
}

// middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors(corsOptions));

// routes
app.use("/api/test", healthCheckRoutes);
app.use("/api/user", userRoutes);
app.use("/api", recipeRouter);

// handling all other incorrect routes
app.all(/./, (req, res) => {
    res.status(404).json({ message: "Page does not exist" });
});

// error middleware
app.use(errorMiddleware);
export default app;
