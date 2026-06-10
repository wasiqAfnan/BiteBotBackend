import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";
import path from "node:path";
import crypto from "node:crypto";

process.env.NODE_ENV = "test";
process.env.ACCESS_TOKEN_SECRET = "test-access-secret";
process.env.ACCESS_TOKEN_EXPIRY = "15m";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret";
process.env.REFRESH_TOKEN_EXPIRY = "7d";
process.env.ALLOWED_ORIGINS = "http://localhost:3000";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.AUTHORIZE_MAIL = "admin@bitezzy.test";

const guestId = new mongoose.Types.ObjectId().toString();
process.env.GUEST_ID = guestId;

process.env.MONGOMS_DOWNLOAD_DIR = path.resolve(".mongodb-binaries");
process.env.MONGOMS_PREFER_GLOBAL_PATH = "false";

const { default: userRoutes } = await import("../src/routes/user.routes.js");
const { default: errorMiddleware } = await import(
    "../src/middlewares/error.middlewares.js"
);
const { isLoggedIn } = await import("../src/middlewares/auth.middlewares.js");
const { default: User } = await import("../src/models/user.models.js");
const { default: Recipe } = await import("../src/models/recipe.models.js");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.get("/api/test-auth/me", isLoggedIn, (req, res) =>
    res.status(200).json({
        success: true,
        statusCode: 200,
        message: "Authenticated user fetched successfully",
        data: req.user,
    })
);
app.use("/api/user", userRoutes);
app.use(errorMiddleware);

let mongoServer;

const validPassword = "StrongPass1!";
const validRegisterPayload = (overrides = {}) => ({
    email: "USER@Example.COM",
    password: validPassword,
    profile_name: "Test User",
    profile_cuisine: "indian",
    ...overrides,
});

const getCookie = (response, name) =>
    response.headers["set-cookie"]?.find((cookie) =>
        cookie.startsWith(`${name}=`)
    );

const cookieHeader = (response) =>
    response.headers["set-cookie"]
        ?.map((cookie) => cookie.split(";")[0])
        .join("; ");

const wait = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});

const createUser = async (overrides = {}) =>
    User.create({
        email: overrides.email ?? "user@example.com",
        password: overrides.password ?? validPassword,
        role: overrides.role ?? "USER",
        profile: {
            name: overrides.name ?? "Test User",
            cuisine: overrides.cuisine ?? "indian",
            avatar: overrides.avatar,
            subscribed: overrides.subscribed,
            dietaryLabels: overrides.dietaryLabels,
            allergens: overrides.allergens,
        },
        chefProfile: overrides.chefProfile,
        favourites: overrides.favourites,
        isActive: overrides.isActive ?? true,
        refreshToken: overrides.refreshToken,
        forgotPasswordToken: overrides.forgotPasswordToken,
        forgotPasswordExpiry: overrides.forgotPasswordExpiry,
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

const expiredAccessTokenFor = (user) =>
    jwt.sign({ _id: user._id }, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "-1s",
    });

const createRecipe = async (overrides = {}) =>
    Recipe.create({
        uuid: overrides.uuid ?? new mongoose.Types.ObjectId().toString(),
        title: overrides.title ?? "Paneer Bowl",
        description: overrides.description ?? "A reliable test recipe",
        cuisine: overrides.cuisine ?? "indian",
        chefId: overrides.chefId,
        totalCookingTime: overrides.totalCookingTime ?? 30,
        servings: overrides.servings ?? 2,
        ingredients: overrides.ingredients ?? [
            {
                name: "paneer",
                quantity: 200,
                unit: "g",
                marketPrice: 120,
            },
        ],
        steps: overrides.steps ?? [
            {
                stepNo: 1,
                instruction: "Cook until done",
            },
        ],
        isActive: overrides.isActive ?? true,
    });

const createPasswordResetToken = async (user, overrides = {}) => {
    const resetToken = overrides.resetToken ?? "valid-reset-token";
    user.forgotPasswordToken = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");
    user.forgotPasswordExpiry =
        overrides.forgotPasswordExpiry ?? Date.now() + 15 * 60 * 1000;
    await user.save();

    return resetToken;
};

before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
});

after(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
        await mongoServer.stop();
    }
});

beforeEach(async () => {
    for (const collection of Object.values(mongoose.connection.collections)) {
        await collection.deleteMany({});
    }
});

test("POST /api/user/register creates a user, hashes password, lowercases email, and returns auth cookies", async () => {
    const response = await request(app)
        .post("/api/user/register")
        .send(validRegisterPayload())
        .expect(201);

    assert.equal(response.body.statusCode, 201);
    assert.deepEqual(
        {
            success: response.body.success,
            message: response.body.message,
        },
        {
            success: true,
            message: "User Created Successfully",
        }
    );
    assert.ok(getCookie(response, "accessToken"));
    assert.ok(getCookie(response, "refreshToken"));

    const user = await User.findOne({ email: "user@example.com" }).select(
        "+password"
    );

    assert.ok(user);
    assert.equal(user.email, "user@example.com");
    assert.notEqual(user.password, validPassword);
    assert.ok(await user.isPasswordCorrect(validPassword));
    assert.ok(user.refreshToken);
});

test("POST /api/user/register fails when email is missing", async () => {
    const response = await request(app)
        .post("/api/user/register")
        .send(validRegisterPayload({ email: undefined }))
        .expect(400);

    assert.match(response.body.message, /All field must be passed/);
});

test("POST /api/user/register fails when password is missing", async () => {
    const response = await request(app)
        .post("/api/user/register")
        .send(validRegisterPayload({ password: undefined }))
        .expect(400);

    assert.match(response.body.message, /All field must be passed/);
});

test("POST /api/user/register fails when profile_name is missing", async () => {
    const response = await request(app)
        .post("/api/user/register")
        .send(validRegisterPayload({ profile_name: undefined }))
        .expect(400);

    assert.match(response.body.message, /All field must be passed/);
});

test("POST /api/user/register fails when profile_cuisine is missing", async () => {
    const response = await request(app)
        .post("/api/user/register")
        .send(validRegisterPayload({ profile_cuisine: undefined }))
        .expect(400);

    assert.match(response.body.message, /All field must be passed/);
});

test("POST /api/user/register fails for invalid email", async () => {
    const response = await request(app)
        .post("/api/user/register")
        .send(validRegisterPayload({ email: "not-an-email" }))
        .expect(400);

    assert.match(response.body.message, /Email Not Valid/);
});

test("POST /api/user/register fails for duplicate email", async () => {
    await createUser({ email: "user@example.com" });

    const response = await request(app)
        .post("/api/user/register")
        .send(validRegisterPayload({ email: "user@example.com" }))
        .expect(400);

    assert.match(response.body.message, /User already exists/);
});

test("POST /api/user/register fails for weak password", async () => {
    const response = await request(app)
        .post("/api/user/register")
        .send(validRegisterPayload({ password: "weakpass" }))
        .expect(400);

    assert.match(response.body.message, /Password Not Valid/);
});

test("POST /api/user/login succeeds, returns cookies, and omits password", async () => {
    await createUser({ email: "login@example.com" });

    const response = await request(app)
        .post("/api/user/login")
        .send({ email: "LOGIN@example.com", password: validPassword })
        .expect(200);

    assert.equal(response.body.statusCode, 200);
    assert.match(response.body.message, /Login Successful/);
    assert.ok(getCookie(response, "accessToken"));
    assert.ok(getCookie(response, "refreshToken"));
    assert.equal(response.body.data.email, "login@example.com");
    assert.equal(response.body.data.password, undefined);
});

test("POST /api/user/login fails for invalid email", async () => {
    const response = await request(app)
        .post("/api/user/login")
        .send({ email: "missing@example.com", password: validPassword })
        .expect(401);

    assert.match(response.body.message, /User does not exists/);
});

test("POST /api/user/login fails for invalid password", async () => {
    await createUser({ email: "login@example.com" });

    const response = await request(app)
        .post("/api/user/login")
        .send({ email: "login@example.com", password: "WrongPass1!" })
        .expect(401);

    assert.match(response.body.message, /Password is invalid/);
});

test("POST /api/user/login fails for inactive account", async () => {
    await createUser({ email: "inactive@example.com", isActive: false });

    const response = await request(app)
        .post("/api/user/login")
        .send({ email: "inactive@example.com", password: validPassword })
        .expect(401);

    assert.match(response.body.message, /User does not exists/);
});

test("POST /api/user/login fails when credentials are missing", async () => {
    const response = await request(app)
        .post("/api/user/login")
        .send({})
        .expect(400);

    assert.match(response.body.message, /All field must be passed/);
});

test("POST /api/user/guest-login works and sets a defined access token cookie", async () => {
    await User.create({
        _id: guestId,
        email: "guest@bitezzy.test",
        password: validPassword,
        profile: {
            name: "Guest User",
            cuisine: "indian",
        },
    });

    const response = await request(app)
        .post("/api/user/guest-login")
        .send()
        .expect(200);

    const accessTokenCookie = getCookie(response, "accessToken");

    assert.ok(accessTokenCookie);
    assert.ok(!accessTokenCookie.startsWith("accessToken=undefined"));
    assert.match(accessTokenCookie, /^accessToken=.+;/);
});

test("GET /api/user/logout removes refresh token and clears cookies", async () => {
    const { user, cookie } = await createAuthenticatedUser({
        email: "logout@example.com",
    });

    const response = await request(app)
        .get("/api/user/logout")
        .set("Cookie", cookie)
        .expect(200);

    const updatedUser = await User.findById(user._id);

    assert.equal(updatedUser.refreshToken, undefined);
    assert.match(getCookie(response, "accessToken"), /^accessToken=;/);
    assert.match(getCookie(response, "refreshToken"), /^refreshToken=;/);
});

test("GET /api/user/logout fails for unauthenticated request", async () => {
    const response = await request(app).get("/api/user/logout").expect(455);

    assert.match(response.body.message, /Not logged in/);
});

test("auth middleware succeeds with a valid access token", async () => {
    const { cookie } = await createAuthenticatedUser({
        email: "profile@example.com",
    });

    const response = await request(app)
        .get("/api/test-auth/me")
        .set("Cookie", cookie)
        .expect(200);

    assert.equal(response.body.statusCode, 200);
    assert.equal(response.body.data.email, "profile@example.com");
});

test("auth middleware returns 455 when access token is missing", async () => {
    const response = await request(app).get("/api/test-auth/me").expect(455);

    assert.match(response.body.message, /Not logged in/);
});

test("auth middleware refreshes expired access token when refresh token is valid", async () => {
    const { user, refreshToken } = await createAuthenticatedUser({
        email: "refresh@example.com",
    });
    const expiredAccessToken = expiredAccessTokenFor(user);

    await wait(1100);

    const response = await request(app)
        .get("/api/test-auth/me")
        .set(
            "Cookie",
            `accessToken=${expiredAccessToken}; refreshToken=${refreshToken}`
        )
        .expect(200);

    assert.equal(response.body.statusCode, 200);
    assert.ok(getCookie(response, "accessToken"));
    assert.ok(getCookie(response, "refreshToken"));
    assert.notEqual(
        getCookie(response, "refreshToken").split(";")[0],
        `refreshToken=${refreshToken}`
    );
});

test("auth middleware returns 455 for expired access token and invalid refresh token", async () => {
    const { user } = await createAuthenticatedUser({
        email: "invalid-refresh@example.com",
    });
    const expiredAccessToken = expiredAccessTokenFor(user);
    const invalidRefreshToken = jwt.sign(
        { _id: user._id },
        "wrong-refresh-secret",
        { expiresIn: "7d" }
    );

    const response = await request(app)
        .get("/api/test-auth/me")
        .set(
            "Cookie",
            `accessToken=${expiredAccessToken}; refreshToken=${invalidRefreshToken}`
        )
        .expect(455);

    assert.match(response.body.message, /Refresh Token is invalid or expired/);
});

test("auth middleware returns 455 for malformed JWT", async () => {
    const response = await request(app)
        .get("/api/test-auth/me")
        .set("Cookie", "accessToken=malformed.jwt.value")
        .expect(455);

    assert.match(response.body.message, /No Session Found|Not logged in/);
});

test("auth middleware returns 455 for inactive user", async () => {
    const { accessToken, refreshToken, user } = await createAuthenticatedUser({
        email: "inactive-me@example.com",
    });

    user.isActive = false;
    await user.save();

    const response = await request(app)
        .get("/api/test-auth/me")
        .set("Cookie", `accessToken=${accessToken}; refreshToken=${refreshToken}`)
        .expect(455);

    assert.match(response.body.message, /Refresh Token is invalid|User not found/);
});

test("POST /api/user/change-avatar currently returns 500 when avatar file is missing", async () => {
    const { cookie } = await createAuthenticatedUser({
        email: "avatar-missing@example.com",
    });

    const response = await request(app)
        .post("/api/user/change-avatar")
        .set("Cookie", cookie)
        .expect(500);

    assert.match(response.body.message, /avatarLocalPath is not defined/);
});

test("POST /api/user/change-avatar fails for unsupported file type", async () => {
    const { cookie } = await createAuthenticatedUser({
        email: "avatar-invalid@example.com",
    });

    const response = await request(app)
        .post("/api/user/change-avatar")
        .set("Cookie", cookie)
        .attach("avatar", Buffer.from("not an image"), "avatar.txt")
        .expect(400);

    assert.match(response.body.message, /Invalid file type: \.txt/);
});

test("POST /api/user/change-avatar updates the authenticated user's avatar", async () => {
    const { user, cookie } = await createAuthenticatedUser({
        email: "avatar-success@example.com",
        avatar: {
            public_id: "old-avatar",
            secure_url: "https://cdn.bitezzy.test/old-avatar.png",
        },
    });

    const response = await request(app)
        .post("/api/user/change-avatar")
        .set("Cookie", cookie)
        .attach("avatar", Buffer.from("fake png bytes"), "avatar.png")
        .expect(200);

    const updatedUser = await User.findById(user._id);

    assert.equal(response.body.statusCode, 200);
    assert.match(response.body.message, /Avatar Uploaded Successfully/);
    assert.equal(
        updatedUser.profile.avatar.secure_url,
        "https://cdn.bitezzy.test/uploaded-image.png"
    );
});

test("PUT /api/user/change-password succeeds and stores a new password hash", async () => {
    const { user, cookie } = await createAuthenticatedUser({
        email: "change-password@example.com",
    });

    const response = await request(app)
        .put("/api/user/change-password")
        .set("Cookie", cookie)
        .send({
            oldPassword: validPassword,
            newPassword: "NewStrongPass1!",
        })
        .expect(200);

    const updatedUser = await User.findById(user._id).select("+password");

    assert.match(response.body.message, /Password changed successfully/);
    assert.equal(await updatedUser.isPasswordCorrect(validPassword), false);
    assert.equal(await updatedUser.isPasswordCorrect("NewStrongPass1!"), true);
});

test("PUT /api/user/change-password fails when fields are missing", async () => {
    const { cookie } = await createAuthenticatedUser({
        email: "change-password-missing@example.com",
    });

    const response = await request(app)
        .put("/api/user/change-password")
        .set("Cookie", cookie)
        .send({})
        .expect(400);

    assert.match(response.body.message, /All fields are required/);
});

test("PUT /api/user/change-password fails for weak new password", async () => {
    const { cookie } = await createAuthenticatedUser({
        email: "change-password-weak@example.com",
    });

    const response = await request(app)
        .put("/api/user/change-password")
        .set("Cookie", cookie)
        .send({
            oldPassword: validPassword,
            newPassword: "weakpass",
        })
        .expect(400);

    assert.match(response.body.message, /security requirements/);
});

test("PUT /api/user/change-password fails for wrong old password", async () => {
    const { cookie } = await createAuthenticatedUser({
        email: "change-password-wrong@example.com",
    });

    const response = await request(app)
        .put("/api/user/change-password")
        .set("Cookie", cookie)
        .send({
            oldPassword: "WrongPass1!",
            newPassword: "NewStrongPass1!",
        })
        .expect(401);

    assert.match(response.body.message, /Incorrect credentials/);
});

test("POST /api/user/forget-password stores reset token details for an active user", async () => {
    const user = await createUser({
        email: "forgot@example.com",
        name: "Forgot User",
    });

    const response = await request(app)
        .post("/api/user/forget-password")
        .send({ email: "forgot@example.com" })
        .expect(200);

    const updatedUser = await User.findById(user._id);

    assert.match(response.body.message, /Mail sent successfully on forgot@example.com/);
    assert.ok(updatedUser.forgotPasswordToken);
    assert.ok(updatedUser.forgotPasswordExpiry);
});

test("POST /api/user/forget-password fails when email is missing", async () => {
    const response = await request(app)
        .post("/api/user/forget-password")
        .send({})
        .expect(400);

    assert.match(response.body.message, /Email is required/);
});

test("POST /api/user/forget-password fails for unknown email", async () => {
    const response = await request(app)
        .post("/api/user/forget-password")
        .send({ email: "unknown@example.com" })
        .expect(400);

    assert.match(response.body.message, /User not found with this mail/);
});

test("POST /api/user/reset-password succeeds for a valid reset token", async () => {
    const user = await createUser({
        email: "reset-success@example.com",
    });
    const resetToken = await createPasswordResetToken(user);

    const response = await request(app)
        .post("/api/user/reset-password")
        .send({
            resetToken,
            password: "ResetStrongPass1!",
        })
        .expect(200);

    const updatedUser = await User.findById(user._id).select("+password");

    assert.match(response.body.message, /Password reset successfully/);
    assert.equal(updatedUser.forgotPasswordToken, undefined);
    assert.equal(updatedUser.forgotPasswordExpiry, undefined);
    assert.equal(await updatedUser.isPasswordCorrect("ResetStrongPass1!"), true);
});

test("POST /api/user/reset-password fails when payload is empty", async () => {
    const response = await request(app)
        .post("/api/user/reset-password")
        .send({})
        .expect(400);

    assert.match(response.body.message, /All fields are required/);
});

test("POST /api/user/reset-password fails for weak password", async () => {
    const response = await request(app)
        .post("/api/user/reset-password")
        .send({
            resetToken: "anything",
            password: "weakpass",
        })
        .expect(400);

    assert.match(response.body.message, /security requirements/);
});

test("POST /api/user/reset-password fails for invalid reset token", async () => {
    await createUser({
        email: "reset-invalid@example.com",
    });

    const response = await request(app)
        .post("/api/user/reset-password")
        .send({
            resetToken: "invalid-token",
            password: "ResetStrongPass1!",
        })
        .expect(400);

    assert.match(response.body.message, /Token is invalid or expired/);
});

test("POST /api/user/reset-password fails for expired reset token", async () => {
    const user = await createUser({
        email: "reset-expired@example.com",
    });
    const resetToken = await createPasswordResetToken(user, {
        forgotPasswordExpiry: Date.now() - 1000,
    });

    const response = await request(app)
        .post("/api/user/reset-password")
        .send({
            resetToken,
            password: "ResetStrongPass1!",
        })
        .expect(400);

    assert.match(response.body.message, /Token is invalid or expired/);
});

test("GET /api/user/subscriptions returns an empty subscription list", async () => {
    const { cookie } = await createAuthenticatedUser({
        email: "subscriptions-empty@example.com",
    });

    const response = await request(app)
        .get("/api/user/subscriptions")
        .set("Cookie", cookie)
        .expect(200);

    assert.equal(response.body.statusCode, 200);
    assert.deepEqual(response.body.data, []);
});

test("GET /api/user/subscriptions returns populated subscriptions", async () => {
    const chef = await createUser({
        email: "chef-subscription@example.com",
        name: "Subscription Chef",
        role: "CHEF",
    });
    const { cookie } = await createAuthenticatedUser({
        email: "subscriptions-populated@example.com",
        subscribed: [chef._id],
    });

    const response = await request(app)
        .get("/api/user/subscriptions")
        .set("Cookie", cookie)
        .expect(200);

    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.data[0].profile.name, "Subscription Chef");
});

test("GET /api/user/:id/recipes returns an empty recipe list", async () => {
    const { user } = await createAuthenticatedUser({
        email: "my-recipes-empty@example.com",
    });

    const response = await request(app)
        .get(`/api/user/${user._id}/recipes`)
        .expect(200);

    assert.deepEqual(response.body.data, []);
});

test("GET /api/user/:id/recipes returns populated chef recipes", async () => {
    const chef = await createUser({
        email: "my-recipes-chef@example.com",
        role: "CHEF",
    });
    const recipe = await createRecipe({
        title: "Chef Recipe",
        chefId: chef._id,
    });
    chef.chefProfile.recipes = [recipe._id];
    await chef.save();

    const accessToken = await chef.generateAccessToken();
    const refreshToken = await chef.generateRefreshToken();
    chef.refreshToken = refreshToken;
    await chef.save();

    const response = await request(app)
        .get(`/api/user/${chef._id}/recipes`)
        .expect(200);

    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.data[0].title, "Chef Recipe");
});

test("PUT /api/user/update applies allowed partial profile updates", async () => {
    const { user, cookie } = await createAuthenticatedUser({
        email: "update-profile@example.com",
    });

    const response = await request(app)
        .put("/api/user/update")
        .set("Cookie", cookie)
        .send({
            name: "Updated User",
            bio: "Updated bio",
            cuisine: "italian",
        })
        .expect(200);

    const updatedUser = await User.findById(user._id);

    assert.match(response.body.message, /User updated successfully/);
    assert.equal(updatedUser.profile.name, "Updated User");
    assert.equal(updatedUser.profile.bio, "Updated bio");
    assert.equal(updatedUser.profile.cuisine, "italian");
});

test("PUT /api/user/update rejects empty payloads", async () => {
    const { cookie } = await createAuthenticatedUser({
        email: "update-empty@example.com",
    });

    const response = await request(app)
        .put("/api/user/update")
        .set("Cookie", cookie)
        .send({})
        .expect(400);

    assert.match(response.body.message, /must have at least 1 key/);
});

test("PUT /api/user/update rejects invalid dietary labels", async () => {
    const { cookie } = await createAuthenticatedUser({
        email: "update-invalid-label@example.com",
    });

    const response = await request(app)
        .put("/api/user/update")
        .set("Cookie", cookie)
        .send({
            dietaryLabels: ["not-a-real-label"],
        })
        .expect(400);

    assert.match(response.body.message, /must be one of/);
});

test("PUT /api/user/update strips malicious unknown update operators", async () => {
    const { user, cookie } = await createAuthenticatedUser({
        email: "update-malicious@example.com",
    });

    const response = await request(app)
        .put("/api/user/update")
        .set("Cookie", cookie)
        .send({
            $set: {
                role: "ADMIN",
                isActive: false,
            },
            name: "Still A User",
        })
        .expect(200);

    const updatedUser = await User.findById(user._id);

    assert.match(response.body.message, /User updated successfully/);
    assert.equal(updatedUser.role, "USER");
    assert.equal(updatedUser.isActive, true);
    assert.equal(updatedUser.profile.name, "Still A User");
});

test("PUT /api/user/update currently stores XSS-like text unchanged", async () => {
    const { user, cookie } = await createAuthenticatedUser({
        email: "update-xss@example.com",
    });
    const xssPayload = "<script>alert('xss')</script>";

    await request(app)
        .put("/api/user/update")
        .set("Cookie", cookie)
        .send({
            name: xssPayload,
        })
        .expect(200);

    const updatedUser = await User.findById(user._id);

    assert.equal(updatedUser.profile.name, xssPayload);
});

test("GET /api/user/:id returns an active user profile", async () => {
    const user = await createUser({
        email: "public-profile@example.com",
        name: "Public User",
    });

    const response = await request(app)
        .get(`/api/user/${user._id}`)
        .expect(200);

    assert.equal(response.body.data.profile.name, "Public User");
    assert.equal(response.body.data.email, "public-profile@example.com");
    assert.equal(response.body.data.password, undefined);
});

test("GET /api/user/:id returns 404 for a non-existing user", async () => {
    const response = await request(app)
        .get(`/api/user/${new mongoose.Types.ObjectId()}`)
        .expect(404);

    assert.match(response.body.message, /User not found/);
});

test("GET /api/user/:id returns 500 for malformed object ids", async () => {
    const response = await request(app)
        .get("/api/user/not-a-valid-id")
        .expect(500);

    assert.match(response.body.message, /Something went wrong during fetching user/);
});

test("GET /api/user/:id/subscriptions is not registered", async () => {
    const chef = await createUser({
        email: "public-sub-chef@example.com",
        name: "Public Sub Chef",
        role: "CHEF",
    });
    const user = await createUser({
        email: "public-sub-user@example.com",
        subscribed: [chef._id],
    });

    const response = await request(app)
        .get(`/api/user/${user._id}/subscriptions`)
        .expect(404);

    assert.match(response.text, /Cannot GET/);
});

test("GET /api/user/:id/subscriptions returns 404 because the route is absent", async () => {
    const response = await request(app)
        .get(`/api/user/${new mongoose.Types.ObjectId()}/subscriptions`)
        .expect(404);

    assert.match(response.text, /Cannot GET/);
});

test("GET /api/user/:id/subscriptions does not route malformed object ids", async () => {
    const response = await request(app)
        .get("/api/user/not-a-valid-id/subscriptions")
        .expect(404);

    assert.match(response.text, /Cannot GET/);
});

test("GET /api/user/:id/recipes returns populated public recipes", async () => {
    const chef = await createUser({
        email: "public-recipes-chef@example.com",
        role: "CHEF",
    });
    const recipe = await createRecipe({
        title: "Public Chef Recipe",
        chefId: chef._id,
    });
    chef.chefProfile.recipes = [recipe._id];
    await chef.save();

    const response = await request(app)
        .get(`/api/user/${chef._id}/recipes`)
        .expect(200);

    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.data[0].title, "Public Chef Recipe");
});

test("GET /api/user/:id/recipes returns 404 for a non-existing user", async () => {
    const response = await request(app)
        .get(`/api/user/${new mongoose.Types.ObjectId()}/recipes`)
        .expect(404);

    assert.match(response.body.message, /User not found/);
});

test("GET /api/user/:id/recipes returns 500 for malformed object ids", async () => {
    const response = await request(app)
        .get("/api/user/not-a-valid-id/recipes")
        .expect(500);

    assert.match(response.body.message, /Something went wrong during fetching chef recipes/);
});

test("GET /api/user/favourites returns an empty favourites list", async () => {
    const { cookie } = await createAuthenticatedUser({
        email: "favourites-empty@example.com",
    });

    const response = await request(app)
        .get("/api/user/favourites")
        .set("Cookie", cookie)
        .expect(200);

    assert.deepEqual(response.body.data, []);
});

test("GET /api/user/favourites returns populated favourites", async () => {
    const recipe = await createRecipe({
        title: "Favourite Recipe",
    });
    const { cookie } = await createAuthenticatedUser({
        email: "favourites-populated@example.com",
        favourites: [recipe._id],
    });

    const response = await request(app)
        .get("/api/user/favourites")
        .set("Cookie", cookie)
        .expect(200);

    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.data[0].title, "Favourite Recipe");
});

test("POST /api/user/contact sends a valid authenticated contact request", async () => {
    const { cookie } = await createAuthenticatedUser({
        email: "contact@example.com",
        name: "Contact User",
    });

    const response = await request(app)
        .post("/api/user/contact")
        .set("Cookie", cookie)
        .send({
            subject: "Need help",
            message: "Please help with my account.",
        })
        .expect(200);

    assert.match(response.body.message, /Message sent successfully/);
});

test("POST /api/user/contact fails when subject or message is missing", async () => {
    const { cookie } = await createAuthenticatedUser({
        email: "contact-missing@example.com",
    });

    const response = await request(app)
        .post("/api/user/contact")
        .set("Cookie", cookie)
        .send({
            subject: "Need help",
        })
        .expect(400);

    assert.match(response.body.message, /All fields are required/);
});

test("POST /api/user/contact rejects unauthenticated requests", async () => {
    const response = await request(app)
        .post("/api/user/contact")
        .send({
            subject: "Need help",
            message: "Please help with my account.",
        })
        .expect(455);

    assert.match(response.body.message, /Not logged in/);
});

test("POST /api/user/guest-login is repeatable for the configured guest account", async () => {
    await User.create({
        _id: guestId,
        email: "guest-repeat@bitezzy.test",
        password: validPassword,
        profile: {
            name: "Guest User",
            cuisine: "indian",
        },
    });

    const firstResponse = await request(app)
        .post("/api/user/guest-login")
        .send()
        .expect(200);
    const secondResponse = await request(app)
        .post("/api/user/guest-login")
        .send()
        .expect(200);

    assert.ok(getCookie(firstResponse, "accessToken"));
    assert.ok(getCookie(secondResponse, "accessToken"));
    assert.equal(firstResponse.body.data.email, "guest-repeat@bitezzy.test");
    assert.equal(secondResponse.body.data.email, "guest-repeat@bitezzy.test");
});

test("User model isPasswordCorrect returns true for the right password and false otherwise", async () => {
    const user = await createUser();
    const userWithPassword = await User.findById(user._id).select("+password");

    assert.equal(await userWithPassword.isPasswordCorrect(validPassword), true);
    assert.equal(await userWithPassword.isPasswordCorrect("WrongPass1!"), false);
});

test("User model generateAccessToken returns a signed token for the user id", async () => {
    const user = await createUser();
    const accessToken = await user.generateAccessToken();
    const decoded = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);

    assert.equal(decoded._id, user._id.toString());
});

test("User model generateRefreshToken returns a signed token for the user id", async () => {
    const user = await createUser();
    const refreshToken = await user.generateRefreshToken();
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

    assert.equal(decoded._id, user._id.toString());
});

test("User model password hashing middleware hashes passwords before save", async () => {
    const user = await createUser({ password: "AnotherPass1!" });
    const userWithPassword = await User.findById(user._id).select("+password");

    assert.notEqual(userWithPassword.password, "AnotherPass1!");
    assert.ok(await userWithPassword.isPasswordCorrect("AnotherPass1!"));
});

test("User model password hashing middleware does not rehash unchanged passwords", async () => {
    const user = await createUser({ password: "StablePass1!" });
    const userWithPassword = await User.findById(user._id).select("+password");
    const originalHash = userWithPassword.password;

    userWithPassword.profile.name = "Updated Name";
    await userWithPassword.save();

    const updatedUser = await User.findById(user._id).select("+password");

    assert.equal(updatedUser.password, originalHash);
    assert.ok(await updatedUser.isPasswordCorrect("StablePass1!"));
});
