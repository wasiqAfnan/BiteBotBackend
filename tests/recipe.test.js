import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";
import path from "node:path";
import fs from "node:fs/promises";

process.env.NODE_ENV = "test";
process.env.ACCESS_TOKEN_SECRET = "test-access-secret";
process.env.ACCESS_TOKEN_EXPIRY = "15m";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret";
process.env.REFRESH_TOKEN_EXPIRY = "7d";
process.env.ALLOWED_ORIGINS = "http://localhost:3000";
process.env.MONGOMS_DOWNLOAD_DIR = path.resolve(".mongodb-binaries");
process.env.MONGOMS_PREFER_GLOBAL_PATH = "false";

const { default: recipeRoutes } = await import("../src/routes/recipe.routes.js");
const { default: errorMiddleware } = await import("../src/middlewares/error.middlewares.js");
const { default: User } = await import("../src/models/user.models.js");
const { default: Recipe } = await import("../src/models/recipe.models.js");
const { recipeQueue } = await import("../src/configs/queue.config.js");

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use("/api/recipes", recipeRoutes);
app.use(errorMiddleware);

let mongoServer;

const validPassword = "StrongPass1!";
const tempDir = path.resolve("public/temp");

const getCookie = (response, name) =>
    response.headers["set-cookie"]?.find((cookie) => cookie.startsWith(`${name}=`));

const createUser = async (overrides = {}) =>
    User.create({
        email: overrides.email ?? `user-${new mongoose.Types.ObjectId()}@example.com`,
        password: overrides.password ?? validPassword,
        role: overrides.role ?? "USER",
        profile: {
            name: overrides.name ?? "Recipe User",
            cuisine: overrides.cuisine ?? "indian",
            subscribed: overrides.subscribed ?? [],
            dietaryLabels: overrides.dietaryLabels ?? [],
        },
        cuisineSuggested: overrides.cuisineSuggested ?? [],
        dietaryLabelsSuggested: overrides.dietaryLabelsSuggested ?? [],
        isActive: overrides.isActive ?? true,
        favourites: overrides.favourites ?? [],
    });

const createAuthenticatedUser = async (overrides = {}) => {
    const user = await createUser(overrides);
    const accessToken = await user.generateAccessToken();
    const refreshToken = await user.generateRefreshToken();
    user.refreshToken = refreshToken;
    await user.save();

    return {
        user,
        accessToken,
        refreshToken,
        cookie: `accessToken=${accessToken}; refreshToken=${refreshToken}`,
    };
};

const expiredCookieFor = async (user) => {
    const refreshToken = await user.generateRefreshToken();
    user.refreshToken = refreshToken;
    await user.save();

    const accessToken = jwt.sign(
        { _id: user._id },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "-1s" }
    );

    return `accessToken=${accessToken}; refreshToken=${refreshToken}`;
};

const recipePayload = (overrides = {}) => ({
    title: "Masala Paneer Bowl",
    description: "A balanced paneer bowl with vegetables and spices.",
    ingredients: [
        {
            name: "paneer",
            quantity: 200,
            unit: "g",
            marketPrice: 140,
        },
        {
            name: "rice",
            quantity: 1,
            unit: "cup",
            marketPrice: 40,
        },
    ],
    steps: [
        {
            stepNo: 1,
            instruction: "Cook rice and saute paneer.",
        },
    ],
    cuisine: "indian",
    dietaryLabels: ["vegetarian", "high-protein"],
    totalCookingTime: 25,
    servings: 2,
    isPremium: false,
    ...overrides,
});

const createRecipe = async (overrides = {}) =>
    Recipe.create({
        uuid: overrides.uuid ?? new mongoose.Types.ObjectId().toString(),
        title: overrides.title ?? "Masala Paneer Bowl",
        description: overrides.description ?? "A balanced paneer bowl for test coverage.",
        thumbnail: overrides.thumbnail ?? {
            public_id: "thumb-public-id",
            secure_url: "https://cdn.bitezzy.test/thumb.png",
        },
        cuisine: overrides.cuisine ?? "indian",
        chefId: overrides.chefId,
        totalCookingTime: overrides.totalCookingTime ?? 25,
        servings: overrides.servings ?? 2,
        isPremium: overrides.isPremium ?? false,
        ingredients: overrides.ingredients ?? [
            {
                name: "paneer",
                quantity: 200,
                unit: "g",
                marketPrice: 140,
            },
        ],
        steps: overrides.steps ?? [
            {
                stepNo: 1,
                instruction: "Cook rice and saute paneer.",
            },
        ],
        dietaryLabels: overrides.dietaryLabels ?? ["vegetarian"],
        reviews: (overrides.reviews ?? []).map((review) => ({
            userId: review.userId ?? new mongoose.Types.ObjectId(),
            rating: review.rating,
            message: review.message,
        })),
        likes: overrides.likes ?? overrides.likeCount ?? [],
        isActive: overrides.isActive ?? true,
        createdAt: overrides.createdAt,
        updatedAt: overrides.updatedAt,
    });

const postRecipeForm = (cookie, payload = recipePayload()) => {
    const form = request(app)
        .post("/api/recipes")
        .set("Cookie", cookie)
        .field("title", payload.title)
        .field("description", payload.description)
        .field("ingredients", JSON.stringify(payload.ingredients))
        .field("steps", JSON.stringify(payload.steps))
        .field("cuisine", payload.cuisine)
        .field("dietaryLabels", JSON.stringify(payload.dietaryLabels ?? []))
        .field("totalCookingTime", String(payload.totalCookingTime))
        .field("servings", String(payload.servings))
        .field("isPremium", String(payload.isPremium));

    if (payload.externalMediaLinks) {
        form.field("externalMediaLinks", JSON.stringify(payload.externalMediaLinks));
    }

    return form;
};

const attachValidRecipeImages = (form) =>
    form
        .attach("thumbnailFile", Buffer.from("fake thumbnail"), "thumbnail.png")
        .attach("stepImages", Buffer.from("fake step"), "step-1.png");

const cleanupTempUploads = async () => {
    try {
        const files = await fs.readdir(tempDir);
        await Promise.all(
            files
                .filter((file) => file !== ".gitkeep")
                .map((file) => fs.unlink(path.join(tempDir, file)).catch(() => undefined))
        );
    } catch {
        // public/temp is created by the project; ignore when absent.
    }
};

before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
});

after(async () => {
    await cleanupTempUploads();
    await mongoose.disconnect();
    if (mongoServer) {
        await mongoServer.stop();
    }
});

beforeEach(async () => {
    process.env.TEST_SIMILARITY_IDS = "";
    recipeQueue.jobs.length = 0;

    for (const collection of Object.values(mongoose.connection.collections)) {
        await collection.deleteMany({});
    }

    await cleanupTempUploads();
});

test("POST /api/recipes queues a valid recipe creation for a chef", async () => {
    const { cookie, user: chef } = await createAuthenticatedUser({
        email: "chef-add@example.com",
        role: "CHEF",
    });

    const response = await attachValidRecipeImages(postRecipeForm(cookie)).expect(202);

    assert.equal(response.body.statusCode, 202);
    assert.match(response.body.message, /Recipe is being processed/);
    assert.equal(await Recipe.countDocuments(), 0);
    assert.equal(recipeQueue.jobs.length, 1);
    assert.equal(recipeQueue.jobs[0].data.type, "ADD");
    assert.equal(recipeQueue.jobs[0].data.userId, chef._id.toString());
    assert.equal(recipeQueue.jobs[0].data.data.title, "Masala Paneer Bowl");
});

test("POST /api/recipes queues premium recipe creation", async () => {
    const { cookie } = await createAuthenticatedUser({
        email: "chef-premium-add@example.com",
        role: "CHEF",
    });

    await attachValidRecipeImages(
        postRecipeForm(cookie, recipePayload({ isPremium: true }))
    ).expect(202);

    assert.equal(recipeQueue.jobs[0].data.data.isPremium, true);
});

test("POST /api/recipes rejects missing authentication", async () => {
    const response = await attachValidRecipeImages(postRecipeForm(""))
        .unset("Cookie")
        .expect(455);

    assert.match(response.body.message, /Not logged in/);
});

test("POST /api/recipes rejects non-chef users", async () => {
    const { cookie } = await createAuthenticatedUser({
        email: "user-add-denied@example.com",
        role: "USER",
    });

    const response = await attachValidRecipeImages(postRecipeForm(cookie)).expect(403);

    assert.match(response.body.message, /not authorized/);
});

test("POST /api/recipes rejects invalid file upload type", async () => {
    const { cookie } = await createAuthenticatedUser({
        email: "chef-bad-file@example.com",
        role: "CHEF",
    });

    const response = await postRecipeForm(cookie)
        .attach("thumbnailFile", Buffer.from("bad"), "thumbnail.txt")
        .attach("stepImages", Buffer.from("fake step"), "step-1.png")
        .expect(400);

    assert.match(response.body.message, /Invalid file type: \.txt/);
});

test("POST /api/recipes rejects missing thumbnail file", async () => {
    const { cookie } = await createAuthenticatedUser({
        email: "chef-missing-thumb@example.com",
        role: "CHEF",
    });

    const response = await postRecipeForm(cookie)
        .attach("stepImages", Buffer.from("fake step"), "step-1.png")
        .expect(400);

    assert.match(response.body.message, /Thumbnail image is required/);
});

test("POST /api/recipes rejects invalid ingredients JSON", async () => {
    const { cookie } = await createAuthenticatedUser({
        email: "chef-invalid-json@example.com",
        role: "CHEF",
    });

    const response = await request(app)
        .post("/api/recipes")
        .set("Cookie", cookie)
        .field("title", "Masala Paneer Bowl")
        .field("description", "A balanced paneer bowl with vegetables and spices.")
        .field("ingredients", "not-json")
        .field("steps", JSON.stringify(recipePayload().steps))
        .field("cuisine", "indian")
        .field("totalCookingTime", "25")
        .field("servings", "2")
        .attach("thumbnailFile", Buffer.from("fake thumbnail"), "thumbnail.png")
        .attach("stepImages", Buffer.from("fake step"), "step-1.png")
        .expect(400);

    assert.match(response.body.message, /Invalid JSON format in field: ingredients/);
});

test("POST /api/recipes rejects missing required fields and invalid cooking time", async () => {
    const { cookie } = await createAuthenticatedUser({
        email: "chef-invalid-payload@example.com",
        role: "CHEF",
    });

    const response = await attachValidRecipeImages(
        postRecipeForm(
            cookie,
            recipePayload({
                title: "",
                totalCookingTime: -1,
            })
        )
    ).expect(400);

    assert.match(response.body.message, /Validation failed/);
});

test("POST /api/recipes rejects invalid dietary category", async () => {
    const { cookie } = await createAuthenticatedUser({
        email: "chef-invalid-category@example.com",
        role: "CHEF",
    });

    const response = await attachValidRecipeImages(
        postRecipeForm(cookie, recipePayload({ dietaryLabels: ["not-a-real-label"] }))
    ).expect(400);

    assert.match(response.body.message, /Validation failed/);
});

test("POST /api/recipes accepts XSS-like title and description after validation", async () => {
    const { cookie } = await createAuthenticatedUser({
        email: "chef-xss-add@example.com",
        role: "CHEF",
    });
    const xssPayload = "<script>alert('xss')</script>";

    await attachValidRecipeImages(
        postRecipeForm(
            cookie,
            recipePayload({
                title: xssPayload,
                description: `${xssPayload} with enough text for validation.`,
            })
        )
    ).expect(202);

    assert.equal(recipeQueue.jobs[0].data.data.title, xssPayload);
    assert.match(recipeQueue.jobs[0].data.data.description, /<script>/);
});

test("GET /api/recipes returns an empty collection response", async () => {
    const response = await request(app).get("/api/recipes").expect(200);

    assert.equal(response.body.statusCode, 200);
    assert.deepEqual(response.body.data, {
        count: 0,
        recipes: [],
    });
});

test("GET /api/recipes fetches recipes with pagination", async () => {
    const chef = await createUser({ role: "CHEF" });
    await createRecipe({ title: "First Recipe", chefId: chef._id });
    await createRecipe({ title: "Second Recipe", chefId: chef._id });

    const response = await request(app)
        .get("/api/recipes?startIndex=1&limit=1")
        .expect(200);

    assert.equal(response.body.data.count, 1);
    assert.equal(response.body.data.recipes.length, 1);
});

test("GET /api/recipes filters by cuisine, dietary preference, price and rating", async () => {
    const chef = await createUser({ role: "CHEF" });
    await createRecipe({
        title: "Matching Recipe",
        chefId: chef._id,
        cuisine: "italian",
        dietaryLabels: ["vegetarian"],
        ingredients: [{ name: "pasta", quantity: 1, unit: "pack", marketPrice: 80 }],
        reviews: [{ name: "A", rating: 5, message: "Great" }],
    });
    await createRecipe({
        title: "Other Recipe",
        chefId: chef._id,
        cuisine: "indian",
        dietaryLabels: ["vegan"],
        ingredients: [{ name: "rice", quantity: 1, unit: "pack", marketPrice: 300 }],
        reviews: [{ name: "B", rating: 2, message: "Ok" }],
    });

    const response = await request(app)
        .get(
            "/api/recipes?cuisine=italian&dietaryPreference=vegetarian&minPrice=50&maxPrice=100&rating=4"
        )
        .expect(200);

    assert.equal(response.body.data.count, 1);
    assert.equal(response.body.data.recipes[0].title, "Matching Recipe");
});

test("GET /api/recipes rejects invalid pagination values", async () => {
    const response = await request(app)
        .get("/api/recipes?startIndex=-1&limit=0")
        .expect(400);

    assert.match(response.body.message, /Invalid pagination parameters/);
});

test("GET /api/recipes/trending returns active recipes sorted by likes", async () => {
    const chef = await createUser({ role: "CHEF" });
    const userA = await createUser();
    const userB = await createUser();
    await createRecipe({ title: "Low Likes", chefId: chef._id, likeCount: [userA._id] });
    await createRecipe({
        title: "High Likes",
        chefId: chef._id,
        likeCount: [userA._id, userB._id],
    });

    const response = await request(app).get("/api/recipes/trending").expect(200);

    assert.equal(response.body.data[0].title, "High Likes");
    assert.equal(response.body.data[1].title, "Low Likes");
});

test("GET /api/recipes/fresh returns newest active recipes first", async () => {
    const chef = await createUser({ role: "CHEF" });
    await createRecipe({
        title: "Older Fresh Recipe",
        chefId: chef._id,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    await createRecipe({
        title: "Newer Fresh Recipe",
        chefId: chef._id,
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
    });

    const response = await request(app).get("/api/recipes/fresh").expect(200);

    assert.equal(response.body.data[0].title, "Newer Fresh Recipe");
});

test("GET /api/recipes/quick filters by maxTime boundary and sorts ascending", async () => {
    const chef = await createUser({ role: "CHEF" });
    await createRecipe({ title: "Thirty Minutes", chefId: chef._id, totalCookingTime: 30 });
    await createRecipe({ title: "Ten Minutes", chefId: chef._id, totalCookingTime: 10 });
    await createRecipe({ title: "Too Slow", chefId: chef._id, totalCookingTime: 31 });

    const response = await request(app)
        .get("/api/recipes/quick?maxTime=30")
        .expect(200);

    assert.deepEqual(
        response.body.data.map((recipe) => recipe.title),
        ["Ten Minutes", "Thirty Minutes"]
    );
});

test("GET /api/recipes/premium returns only premium active recipes without auth gating", async () => {
    const chef = await createUser({ role: "CHEF" });
    await createRecipe({ title: "Free Recipe", chefId: chef._id, isPremium: false });
    await createRecipe({ title: "Premium Recipe", chefId: chef._id, isPremium: true });

    const response = await request(app).get("/api/recipes/premium").expect(200);

    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.data[0].title, "Premium Recipe");
});

test("GET /api/recipes/recommended returns recipes from vector similarity ids", async () => {
    const chef = await createUser({ role: "CHEF" });
    const recommendation = await createRecipe({
        uuid: "recommendation-uuid",
        title: "Recommended Recipe",
        chefId: chef._id,
    });
    const { cookie } = await createAuthenticatedUser({
        email: "recommendation-user@example.com",
        cuisine: "indian",
        dietaryLabels: ["vegetarian"],
    });
    process.env.TEST_SIMILARITY_IDS = recommendation.uuid;

    const response = await request(app)
        .get("/api/recipes/recommended?limit=5")
        .set("Cookie", cookie)
        .expect(200);

    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.data[0].title, "Recommended Recipe");
});

test("GET /api/recipes/recommended rejects unauthenticated users", async () => {
    const response = await request(app).get("/api/recipes/recommended").expect(455);

    assert.match(response.body.message, /Not logged in/);
});

test("GET /api/recipes/search searches title case-insensitively and returns pagination metadata", async () => {
    const chef = await createUser({ role: "CHEF" });
    await createRecipe({ title: "Paneer Tikka", chefId: chef._id });
    await createRecipe({
        title: "Apple Pie",
        description: "A sweet baked dessert with cinnamon.",
        steps: [{ stepNo: 1, instruction: "Bake apples with pastry." }],
        chefId: chef._id,
    });

    const response = await request(app)
        .get("/api/recipes/search?query=pAnEeR&page=1&limit=10")
        .expect(200);

    assert.equal(response.body.data.recipes.length, 1);
    assert.equal(response.body.data.recipes[0].title, "Paneer Tikka");
    assert.deepEqual(response.body.data.meta, {
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
    });
});

test("GET /api/recipes/search filters by cuisine, diet, premium and sorts by popularity", async () => {
    const chef = await createUser({ role: "CHEF" });
    const userA = await createUser();
    const userB = await createUser();
    await createRecipe({
        title: "Popular Premium",
        chefId: chef._id,
        cuisine: "indian",
        dietaryLabels: ["vegetarian"],
        isPremium: true,
        likeCount: [userA._id, userB._id],
    });
    await createRecipe({
        title: "Less Popular Premium",
        chefId: chef._id,
        cuisine: "indian",
        dietaryLabels: ["vegetarian"],
        isPremium: true,
        likeCount: [userA._id],
    });

    const response = await request(app)
        .get("/api/recipes/search?cuisine=indian&diet=vegetarian&premium=true&sort=popularity")
        .expect(200);

    assert.deepEqual(
        response.body.data.recipes.map((recipe) => recipe.title),
        ["Popular Premium", "Less Popular Premium"]
    );
});

test("GET /api/recipes/search tolerates empty, XSS and NoSQL-like query strings", async () => {
    const chef = await createUser({ role: "CHEF" });
    await createRecipe({ title: "Safe Recipe", chefId: chef._id });

    const emptyResponse = await request(app).get("/api/recipes/search?query=").expect(200);
    const xssResponse = await request(app)
        .get("/api/recipes/search?query=%3Cscript%3Ealert(1)%3C%2Fscript%3E")
        .expect(200);
    const injectionResponse = await request(app)
        .get('/api/recipes/search?query={"$ne":null}')
        .expect(200);

    assert.equal(emptyResponse.body.data.meta.total, 1);
    assert.equal(xssResponse.body.data.meta.total, 0);
    assert.equal(injectionResponse.body.data.meta.total, 0);
});

test("GET /api/recipes/:id returns a free recipe and updates user recommendation history", async () => {
    const chef = await createUser({ role: "CHEF" });
    const recipe = await createRecipe({
        chefId: chef._id,
        cuisine: "indian",
        dietaryLabels: ["vegetarian", "high-protein"],
    });
    const { user, cookie } = await createAuthenticatedUser({
        email: "viewer@example.com",
    });

    const response = await request(app)
        .get(`/api/recipes/${recipe._id}`)
        .set("Cookie", cookie)
        .expect(200);

    const updatedUser = await User.findById(user._id);

    assert.equal(response.body.data.title, recipe.title);
    assert.deepEqual(updatedUser.cuisineSuggested, ["indian"]);
    assert.deepEqual(updatedUser.dietaryLabelsSuggested[0], [
        "high-protein",
        "vegetarian",
    ]);
});

test("GET /api/recipes/:id denies premium recipe access for unsubscribed users", async () => {
    const chef = await createUser({ role: "CHEF" });
    const recipe = await createRecipe({ chefId: chef._id, isPremium: true });
    const { cookie } = await createAuthenticatedUser({
        email: "premium-denied@example.com",
    });

    const response = await request(app)
        .get(`/api/recipes/${recipe._id}`)
        .set("Cookie", cookie)
        .expect(403);

    assert.match(response.body.message, /Premium Subscription Required/);
});

test("GET /api/recipes/:id allows premium access to subscribed users", async () => {
    const chef = await createUser({ role: "CHEF" });
    const recipe = await createRecipe({ chefId: chef._id, isPremium: true });
    const { cookie } = await createAuthenticatedUser({
        email: "premium-allowed@example.com",
        subscribed: [chef._id],
    });

    const response = await request(app)
        .get(`/api/recipes/${recipe._id}`)
        .set("Cookie", cookie)
        .expect(200);

    assert.equal(response.body.data.title, recipe.title);
});

test("GET /api/recipes/:id returns 404 for inactive or missing recipes", async () => {
    const chef = await createUser({ role: "CHEF" });
    const recipe = await createRecipe({ chefId: chef._id, isActive: false });
    const { cookie } = await createAuthenticatedUser();

    const response = await request(app)
        .get(`/api/recipes/${recipe._id}`)
        .set("Cookie", cookie)
        .expect(404);

    assert.match(response.body.message, /Recipe not found/);
});

test("GET /api/recipes/:id returns 500 for malformed object ids", async () => {
    const { cookie } = await createAuthenticatedUser();

    const response = await request(app)
        .get("/api/recipes/not-a-valid-id")
        .set("Cookie", cookie)
        .expect(500);

    assert.match(response.body.message, /fetching recipe/);
});

test("PUT /api/recipes/:id lets a chef update a full valid recipe payload", async () => {
    const { user: chef, cookie } = await createAuthenticatedUser({
        email: "chef-update@example.com",
        role: "CHEF",
    });
    const recipe = await createRecipe({ chefId: chef._id });

    const response = await request(app)
        .put(`/api/recipes/${recipe._id}`)
        .set("Cookie", cookie)
        .send(recipePayload({ title: "Updated Recipe Title" }))
        .expect(200);

    const updatedRecipe = await Recipe.findById(recipe._id);

    assert.equal(response.body.data.title, "Updated Recipe Title");
    assert.equal(updatedRecipe.title, "Updated Recipe Title");
    assert.equal(recipeQueue.jobs[0].data.type, "UPDATE");
});

test("PUT /api/recipes/:id rejects non-chef users", async () => {
    const chef = await createUser({ role: "CHEF" });
    const recipe = await createRecipe({ chefId: chef._id });
    const { cookie } = await createAuthenticatedUser({
        email: "user-update-denied@example.com",
        role: "USER",
    });

    const response = await request(app)
        .put(`/api/recipes/${recipe._id}`)
        .set("Cookie", cookie)
        .send(recipePayload({ title: "Should Not Update" }))
        .expect(403);

    assert.match(response.body.message, /not authorized/);
});

test("PUT /api/recipes/:id currently allows a non-owner chef to update recipes", async () => {
    const owner = await createUser({ role: "CHEF" });
    const recipe = await createRecipe({ chefId: owner._id });
    const { cookie } = await createAuthenticatedUser({
        email: "other-chef-update@example.com",
        role: "CHEF",
    });

    const response = await request(app)
        .put(`/api/recipes/${recipe._id}`)
        .set("Cookie", cookie)
        .send(recipePayload({ title: "Non Owner Updated" }))
        .expect(200);

    assert.equal(response.body.data.title, "Non Owner Updated");
});

test("PUT /api/recipes/:id rejects invalid update payload and malformed ids", async () => {
    const { user: chef, cookie } = await createAuthenticatedUser({
        role: "CHEF",
    });
    const recipe = await createRecipe({ chefId: chef._id });

    const invalidPayloadResponse = await request(app)
        .put(`/api/recipes/${recipe._id}`)
        .set("Cookie", cookie)
        .send({ title: "Only title is not enough" })
        .expect(400);
    const malformedIdResponse = await request(app)
        .put("/api/recipes/not-a-valid-id")
        .set("Cookie", cookie)
        .send(recipePayload({ title: "Valid Payload" }))
        .expect(500);

    assert.match(invalidPayloadResponse.body.message, /Validation failed/);
    assert.match(malformedIdResponse.body.message, /recipe update/);
});

test("DELETE /api/recipes/:id soft deletes a recipe for a chef", async () => {
    const { user: chef, cookie } = await createAuthenticatedUser({
        email: "chef-delete@example.com",
        role: "CHEF",
    });
    const recipe = await createRecipe({ chefId: chef._id });

    const response = await request(app)
        .delete(`/api/recipes/${recipe._id}`)
        .set("Cookie", cookie)
        .expect(200);

    const deletedRecipe = await Recipe.findById(recipe._id);

    assert.match(response.body.message, /Recipe deleted successfully/);
    assert.equal(deletedRecipe.isActive, false);
    assert.equal(recipeQueue.jobs[0].data.type, "DELETE");
});

test("DELETE /api/recipes/:id rejects non-chef users", async () => {
    const chef = await createUser({ role: "CHEF" });
    const recipe = await createRecipe({ chefId: chef._id });
    const { cookie } = await createAuthenticatedUser({
        role: "USER",
    });

    const response = await request(app)
        .delete(`/api/recipes/${recipe._id}`)
        .set("Cookie", cookie)
        .expect(403);

    assert.match(response.body.message, /not authorized/);
});

test("DELETE /api/recipes/:id currently allows a non-owner chef to delete recipes", async () => {
    const owner = await createUser({ role: "CHEF" });
    const recipe = await createRecipe({ chefId: owner._id });
    const { cookie } = await createAuthenticatedUser({
        email: "other-chef-delete@example.com",
        role: "CHEF",
    });

    await request(app)
        .delete(`/api/recipes/${recipe._id}`)
        .set("Cookie", cookie)
        .expect(200);

    const deletedRecipe = await Recipe.findById(recipe._id);

    assert.equal(deletedRecipe.isActive, false);
});

test("DELETE /api/recipes/:id returns 404 for missing recipes and 500 for malformed ids", async () => {
    const { cookie } = await createAuthenticatedUser({
        role: "CHEF",
    });

    const missingResponse = await request(app)
        .delete(`/api/recipes/${new mongoose.Types.ObjectId()}`)
        .set("Cookie", cookie)
        .expect(404);
    const malformedResponse = await request(app)
        .delete("/api/recipes/not-a-valid-id")
        .set("Cookie", cookie)
        .expect(500);

    assert.match(missingResponse.body.message, /Recipe not found/);
    assert.match(malformedResponse.body.message, /recipe deletion/);
});

test("GET /api/recipes/like/:id likes once and prevents duplicate likes", async () => {
    const chef = await createUser({ role: "CHEF" });
    const recipe = await createRecipe({ chefId: chef._id });
    const { user, cookie } = await createAuthenticatedUser();

    const firstResponse = await request(app)
        .get(`/api/recipes/like/${recipe._id}`)
        .set("Cookie", cookie)
        .expect(200);
    const secondResponse = await request(app)
        .get(`/api/recipes/like/${recipe._id}`)
        .set("Cookie", cookie)
        .expect(200);

    const likedRecipe = await Recipe.findById(recipe._id);
    const updatedUser = await User.findById(user._id);

    assert.equal(firstResponse.body.data.totalLikes, 1);
    assert.equal(secondResponse.body.data.totalLikes, 1);
    assert.equal(likedRecipe.likeCount.length, 1);
    assert.equal(updatedUser.favourites.length, 1);
});

test("GET /api/recipes/like/:id rejects unauthenticated, missing and malformed recipes", async () => {
    const { cookie } = await createAuthenticatedUser();

    const unauthenticatedResponse = await request(app)
        .get(`/api/recipes/like/${new mongoose.Types.ObjectId()}`)
        .expect(455);
    const missingResponse = await request(app)
        .get(`/api/recipes/like/${new mongoose.Types.ObjectId()}`)
        .set("Cookie", cookie)
        .expect(404);
    const malformedResponse = await request(app)
        .get("/api/recipes/like/not-a-valid-id")
        .set("Cookie", cookie)
        .expect(500);

    assert.match(unauthenticatedResponse.body.message, /Not logged in/);
    assert.match(missingResponse.body.message, /Recipe not found/);
    assert.match(malformedResponse.body.message, /adding recipe to favourites/);
});

test("GET /api/recipes/unlike/:id unlikes and is idempotent when not liked", async () => {
    const chef = await createUser({ role: "CHEF" });
    const { user, cookie } = await createAuthenticatedUser();
    const recipe = await createRecipe({
        chefId: chef._id,
        likeCount: [user._id],
    });
    user.favourites.push(recipe._id);
    await user.save();

    const firstResponse = await request(app)
        .get(`/api/recipes/unlike/${recipe._id}`)
        .set("Cookie", cookie)
        .expect(200);
    const secondResponse = await request(app)
        .get(`/api/recipes/unlike/${recipe._id}`)
        .set("Cookie", cookie)
        .expect(200);

    const unlikedRecipe = await Recipe.findById(recipe._id);
    const updatedUser = await User.findById(user._id);

    assert.equal(firstResponse.body.data.totalLikes, 0);
    assert.equal(secondResponse.body.data.totalLikes, 0);
    assert.equal(unlikedRecipe.likeCount.length, 0);
    assert.equal(updatedUser.favourites.length, 0);
});

test("GET /api/recipes/unlike/:id rejects unauthenticated, missing and malformed recipes", async () => {
    const { cookie } = await createAuthenticatedUser();

    const unauthenticatedResponse = await request(app)
        .get(`/api/recipes/unlike/${new mongoose.Types.ObjectId()}`)
        .expect(455);
    const missingResponse = await request(app)
        .get(`/api/recipes/unlike/${new mongoose.Types.ObjectId()}`)
        .set("Cookie", cookie)
        .expect(404);
    const malformedResponse = await request(app)
        .get("/api/recipes/unlike/not-a-valid-id")
        .set("Cookie", cookie)
        .expect(500);

    assert.match(unauthenticatedResponse.body.message, /Not logged in/);
    assert.match(missingResponse.body.message, /Recipe not found/);
    assert.match(malformedResponse.body.message, /removing from favourites/);
});

test("concurrent likes from multiple users preserve all likes", async () => {
    const chef = await createUser({ role: "CHEF" });
    const recipe = await createRecipe({ chefId: chef._id });
    const users = await Promise.all([
        createAuthenticatedUser({ email: "like-a@example.com" }),
        createAuthenticatedUser({ email: "like-b@example.com" }),
        createAuthenticatedUser({ email: "like-c@example.com" }),
    ]);

    await Promise.all(
        users.map(({ cookie }) =>
            request(app).get(`/api/recipes/like/${recipe._id}`).set("Cookie", cookie).expect(200)
        )
    );

    const likedRecipe = await Recipe.findById(recipe._id);

    assert.equal(likedRecipe.likeCount.length, 3);
});

test("GET /api/recipes/similar/:id returns vector-backed similar recipes", async () => {
    const chef = await createUser({ role: "CHEF" });
    const source = await createRecipe({
        uuid: "source-recipe",
        chefId: chef._id,
        ingredients: [{ name: "paneer", quantity: 1, unit: "cup", marketPrice: 100 }],
    });
    await createRecipe({
        uuid: "similar-recipe",
        title: "Similar Recipe",
        chefId: chef._id,
    });
    const { cookie } = await createAuthenticatedUser();
    process.env.TEST_SIMILARITY_IDS = "source-recipe,similar-recipe";

    const response = await request(app)
        .get(`/api/recipes/similar/${source._id}`)
        .set("Cookie", cookie)
        .expect(200);

    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.data[0].title, "Similar Recipe");
});

test("GET /api/recipes/similar/:id handles no similar recipes and missing ids", async () => {
    const chef = await createUser({ role: "CHEF" });
    const source = await createRecipe({
        uuid: "source-only",
        chefId: chef._id,
    });
    const { cookie } = await createAuthenticatedUser();
    process.env.TEST_SIMILARITY_IDS = "source-only";

    const emptyResponse = await request(app)
        .get(`/api/recipes/similar/${source._id}`)
        .set("Cookie", cookie)
        .expect(200);
    const missingResponse = await request(app)
        .get(`/api/recipes/similar/${new mongoose.Types.ObjectId()}`)
        .set("Cookie", cookie)
        .expect(404);

    assert.deepEqual(emptyResponse.body.data, []);
    assert.match(missingResponse.body.message, /Recipe not found/);
});

test("recipe auth rejects expired access token without valid refresh token", async () => {
    const user = await createUser();
    const expiredAccessToken = jwt.sign(
        { _id: user._id },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "-1s" }
    );

    const response = await request(app)
        .get(`/api/recipes/like/${new mongoose.Types.ObjectId()}`)
        .set("Cookie", `accessToken=${expiredAccessToken}`)
        .expect(455);

    assert.match(response.body.message, /No Session Found/);
});

test("recipe auth refreshes expired access token with valid refresh token", async () => {
    const chef = await createUser({ role: "CHEF" });
    const recipe = await createRecipe({ chefId: chef._id });
    const user = await createUser();
    const cookie = await expiredCookieFor(user);

    const response = await request(app)
        .get(`/api/recipes/like/${recipe._id}`)
        .set("Cookie", cookie)
        .expect(200);

    assert.ok(getCookie(response, "accessToken"));
    assert.ok(getCookie(response, "refreshToken"));
});
