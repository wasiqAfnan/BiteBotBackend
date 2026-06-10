import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import path from "node:path";
import crypto from "node:crypto";

process.env.NODE_ENV = "test";
process.env.ACCESS_TOKEN_SECRET = "test-access-secret";
process.env.ACCESS_TOKEN_EXPIRY = "15m";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret";
process.env.REFRESH_TOKEN_EXPIRY = "7d";
process.env.ALLOWED_ORIGINS = "http://localhost:3000";
process.env.RAZORPAY_KEY_ID = "rzp_test_key";
process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "webhook-secret";
process.env.MONGOMS_DOWNLOAD_DIR = path.resolve(".mongodb-binaries");
process.env.MONGOMS_PREFER_GLOBAL_PATH = "false";

const { default: razorpayInstance } = await import(
    "../src/configs/razorpay.configs.js"
);
const {
    handleCancelSubscription,
    handleCreatePlan,
    handleCreateSubscription,
    handleWebhook,
} = await import("../src/controllers/payment.controllers.js");
const { default: Payment } = await import("../src/models/payment.models.js");
const {
    createChef,
    createPayment,
    createUser,
    invokeController,
    paymentCapturedPayload,
    paymentFailedPayload,
    randomEventPayload,
    rawWebhookBody,
    subscriptionActivatedPayload,
    subscriptionCancelledPayload,
} = await import("./helpers/paymentFactory.js");

let mongoServer;
let expectedSignature = "valid-signature";

const originalCreateHmac = crypto.createHmac;

const mockCreateHmac = () => ({
    update(value) {
        this.value = value;
        return this;
    },
    digest(encoding) {
        assert.equal(encoding, "hex");
        return expectedSignature;
    },
});

Object.defineProperty(crypto, "createHmac", {
    configurable: true,
    value: mockCreateHmac,
});

const resetRazorpayMocks = () => {
    razorpayInstance.plans = {
        create: async () => ({ id: "plan_test", item: { amount: 49900 } }),
    };
    razorpayInstance.subscriptions = {
        create: async () => ({ id: "sub_test", status: "created" }),
        cancel: async (subscriptionId, options) => ({
            id: subscriptionId,
            status: "cancelled",
            ...options,
        }),
    };
    razorpayInstance.invoices = {
        fetch: async () => ({ subscription_id: "sub_test" }),
    };
};

const webhookRequest = (payload, signature = expectedSignature) => ({
    headers: {
        "x-razorpay-signature": signature,
    },
    body: rawWebhookBody(payload),
});

before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
});

after(async () => {
    Object.defineProperty(crypto, "createHmac", {
        configurable: true,
        value: originalCreateHmac,
    });
    await mongoose.disconnect();
    if (mongoServer) {
        await mongoServer.stop();
    }
});

beforeEach(async () => {
    expectedSignature = "valid-signature";
    resetRazorpayMocks();

    for (const collection of Object.values(mongoose.connection.collections)) {
        await collection.deleteMany({});
    }
});

test("handleCreatePlan creates a Razorpay plan, saves it to the chef, and returns 201", async () => {
    const chef = await createChef({ subscriptionPrice: 499 });
    let planInput;

    razorpayInstance.plans.create = async (input) => {
        planInput = input;
        return {
            id: "plan_created",
            period: input.period,
            interval: input.interval,
            item: input.item,
        };
    };

    const { res, nextError } = await invokeController(handleCreatePlan, {
        user: chef,
    });

    assert.equal(nextError, undefined);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.statusCode, 201);
    assert.equal(res.body.message, "Plan created successfully");
    assert.equal(res.body.data.id, "plan_created");
    assert.deepEqual(planInput, {
        period: "monthly",
        interval: 1,
        item: {
            name: "Chef Test Subscription",
            amount: 49900,
            currency: "INR",
            description: "Monthly subscription for Chef Test",
        },
    });

    const updatedChef = await mongoose.model("User").findById(chef._id);
    assert.equal(updatedChef.chefProfile.razorpayPlanId, "plan_created");
});

test("handleCreatePlan returns 400 when subscription price is missing", async () => {
    const chef = await createChef();

    const { nextError } = await invokeController(handleCreatePlan, {
        user: chef,
    });

    assert.equal(nextError.statusCode, 400);
    assert.equal(nextError.message, "Subscription price not set");
});

test("handleCreatePlan returns 400 when a plan already exists", async () => {
    const chef = await createChef({
        subscriptionPrice: 499,
        razorpayPlanId: "plan_existing",
    });

    const { nextError } = await invokeController(handleCreatePlan, {
        user: chef,
    });

    assert.equal(nextError.statusCode, 400);
    assert.equal(nextError.message, "Plan already exists");
});

test("handleCreatePlan returns 500 when Razorpay plan creation fails", async () => {
    const chef = await createChef({ subscriptionPrice: 499 });
    razorpayInstance.plans.create = async () => {
        throw new Error("razorpay down");
    };

    const { nextError } = await invokeController(handleCreatePlan, {
        user: chef,
    });

    assert.equal(nextError.statusCode, 500);
});

test("handleCreateSubscription creates and returns a Razorpay subscription", async () => {
    const user = await createUser();
    const chef = await createChef({
        subscriptionPrice: 499,
        razorpayPlanId: "plan_test",
    });
    let subscriptionInput;

    razorpayInstance.subscriptions.create = async (input) => {
        subscriptionInput = input;
        return { id: "sub_created", status: "created", plan_id: input.plan_id };
    };

    const { res, nextError } = await invokeController(
        handleCreateSubscription,
        {
            user,
            body: { chefId: chef._id },
        }
    );

    assert.equal(nextError, undefined);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.message, "Subscription created successfully");
    assert.equal(res.body.data.id, "sub_created");
    assert.deepEqual(subscriptionInput, {
        plan_id: "plan_test",
        total_count: 12,
        customer_notify: 1,
        notes: {
            userId: user._id.toString(),
            chefId: chef._id.toString(),
        },
    });
});

test("handleCreateSubscription returns 404 when chef is not found", async () => {
    const user = await createUser();

    const { nextError } = await invokeController(handleCreateSubscription, {
        user,
        body: { chefId: new mongoose.Types.ObjectId() },
    });

    assert.equal(nextError.statusCode, 404);
});

test("handleCreateSubscription returns 400 for a non-chef account", async () => {
    const user = await createUser();
    const notChef = await createUser();

    const { nextError } = await invokeController(handleCreateSubscription, {
        user,
        body: { chefId: notChef._id },
    });

    assert.equal(nextError.statusCode, 400);
    assert.equal(nextError.message, "Invalid chef account");
});

test("handleCreateSubscription returns 400 when subscription price is missing", async () => {
    const user = await createUser();
    const chef = await createChef({ razorpayPlanId: "plan_test" });

    const { nextError } = await invokeController(handleCreateSubscription, {
        user,
        body: { chefId: chef._id },
    });

    assert.equal(nextError.statusCode, 400);
    assert.equal(nextError.message, "Subscription price not set");
});

test("handleCreateSubscription returns 400 when razorpayPlanId is missing", async () => {
    const user = await createUser();
    const chef = await createChef({ subscriptionPrice: 499 });

    const { nextError } = await invokeController(handleCreateSubscription, {
        user,
        body: { chefId: chef._id },
    });

    assert.equal(nextError.statusCode, 400);
    assert.equal(nextError.message, "Chef subscription plan not found");
});

test("handleCreateSubscription returns 500 when Razorpay subscription creation fails", async () => {
    const user = await createUser();
    const chef = await createChef({
        subscriptionPrice: 499,
        razorpayPlanId: "plan_test",
    });
    razorpayInstance.subscriptions.create = async () => {
        throw new Error("razorpay down");
    };

    const { nextError } = await invokeController(handleCreateSubscription, {
        user,
        body: { chefId: chef._id },
    });

    assert.equal(nextError.statusCode, 500);
});

test("handleWebhook accepts a valid signature", async () => {
    const { res, nextError } = await invokeController(
        handleWebhook,
        webhookRequest(randomEventPayload())
    );

    assert.equal(nextError, undefined);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.message, "Webhook handled successfully");
});

test("handleWebhook rejects an invalid signature", async () => {
    const { nextError } = await invokeController(
        handleWebhook,
        webhookRequest(randomEventPayload(), "bad-signature")
    );

    assert.equal(nextError.statusCode, 400);
    assert.equal(nextError.message, "Invalid webhook signature");
});

test("handleWebhook payment.captured updates the pending payment from invoice data", async () => {
    const user = await createUser();
    const chef = await createChef({ subscriptionPrice: 499 });
    await createPayment({
        razorpayPaymentId: "pending_sub_captured",
        razorpaySubscriptionId: "sub_captured",
        purchasedBy: user._id,
        chef: chef._id,
        paymentStatus: "created",
        subscriptionStatus: "pending",
    });

    let fetchedInvoiceId;
    razorpayInstance.invoices.fetch = async (invoiceId) => {
        fetchedInvoiceId = invoiceId;
        return { subscription_id: "sub_captured" };
    };

    const { res, nextError } = await invokeController(
        handleWebhook,
        webhookRequest(
            paymentCapturedPayload({
                paymentId: "pay_captured",
                subscriptionId: "sub_captured",
                invoiceId: "inv_captured",
                amount: 49900,
                status: "captured",
                userId: user._id,
                chefId: chef._id,
            })
        )
    );

    assert.equal(nextError, undefined);
    assert.equal(res.statusCode, 200);
    assert.equal(fetchedInvoiceId, "inv_captured");

    const payment = await Payment.findOne({
        razorpayPaymentId: "pay_captured",
    });
    assert.ok(payment);
    assert.equal(payment.razorpaySubscriptionId, "sub_captured");
    assert.equal(payment.amount, 499);
    assert.equal(payment.paymentStatus, "captured");
    assert.equal(payment.subscriptionStatus, "pending");
});

test("handleWebhook payment.captured does not create duplicate payments", async () => {
    const user = await createUser();
    const chef = await createChef({ subscriptionPrice: 499 });

    await createPayment({
        razorpayPaymentId: "pay_duplicate",
        razorpaySubscriptionId: "sub_duplicate",
        purchasedBy: user._id,
        chef: chef._id,
    });

    const { res, nextError } = await invokeController(
        handleWebhook,
        webhookRequest(
            paymentCapturedPayload({
                paymentId: "pay_duplicate",
                subscriptionId: "sub_duplicate",
                userId: user._id,
                chefId: chef._id,
            })
        )
    );

    assert.equal(nextError, undefined);
    assert.equal(res.statusCode, 200);
    assert.equal(
        await Payment.countDocuments({ razorpayPaymentId: "pay_duplicate" }),
        1
    );
});

test("handleWebhook payment.failed returns 200 without database updates", async () => {
    const { res, nextError } = await invokeController(
        handleWebhook,
        webhookRequest(paymentFailedPayload())
    );

    assert.equal(nextError, undefined);
    assert.equal(res.statusCode, 200);
    assert.equal(await Payment.countDocuments(), 0);
});

test("handleWebhook subscription.activated updates subscription dates", async () => {
    const user = await createUser();
    const chef = await createChef({ subscriptionPrice: 499 });
    await createPayment({
        razorpayPaymentId: "pay_active",
        razorpaySubscriptionId: "sub_active",
        purchasedBy: user._id,
        chef: chef._id,
        subscriptionStatus: "pending",
    });

    const { res, nextError } = await invokeController(
        handleWebhook,
        webhookRequest(
            subscriptionActivatedPayload({
                subscriptionId: "sub_active",
                currentStart: 1_700_000_000,
                currentEnd: 1_702_592_000,
                chargeAt: 1_702_592_000,
                status: "active",
                userId: user._id,
                chefId: chef._id,
            })
        )
    );

    assert.equal(nextError, undefined);
    assert.equal(res.statusCode, 200);

    const payment = await Payment.findOne({
        razorpaySubscriptionId: "sub_active",
    });
    assert.equal(payment.subscriptionStatus, "active");
    assert.equal(payment.currentStart.getTime(), 1_700_000_000 * 1000);
    assert.equal(payment.currentEnd.getTime(), 1_702_592_000 * 1000);
    assert.equal(payment.nextBillingAt.getTime(), 1_702_592_000 * 1000);

    const updatedUser = await mongoose.model("User").findById(user._id);
    const updatedChef = await mongoose.model("User").findById(chef._id);
    assert.ok(updatedUser.profile.subscribed.some((id) => id.equals(chef._id)));
    assert.ok(
        updatedChef.chefProfile.subscribers.some((id) => id.equals(user._id))
    );
});

test("handleWebhook subscription.cancelled marks payment cancelled and removes references", async () => {
    const chefId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const user = await createUser({
        _id: userId,
        subscribed: [chefId],
    });
    const chef = await createChef({
        _id: chefId,
        subscriptionPrice: 499,
        subscribers: [userId],
    });
    await createPayment({
        razorpayPaymentId: "pay_cancelled",
        razorpaySubscriptionId: "sub_cancelled",
        purchasedBy: user._id,
        chef: chef._id,
        subscriptionStatus: "active",
    });

    const { res, nextError } = await invokeController(
        handleWebhook,
        webhookRequest(
            subscriptionCancelledPayload({
                subscriptionId: "sub_cancelled",
                endedAt: 1_702_592_000,
            })
        )
    );

    assert.equal(nextError, undefined);
    assert.equal(res.statusCode, 200);

    const payment = await Payment.findOne({
        razorpaySubscriptionId: "sub_cancelled",
    });
    assert.equal(payment.subscriptionStatus, "cancelled");
    assert.equal(payment.cancelledAt.getTime(), 1_702_592_000 * 1000);

    const updatedUser = await mongoose.model("User").findById(user._id);
    const updatedChef = await mongoose.model("User").findById(chef._id);
    assert.equal(updatedUser.profile.subscribed.length, 0);
    assert.equal(updatedChef.chefProfile.subscribers.length, 0);
});

test("handleWebhook random events return 200 without database changes", async () => {
    const { res, nextError } = await invokeController(
        handleWebhook,
        webhookRequest(randomEventPayload())
    );

    assert.equal(nextError, undefined);
    assert.equal(res.statusCode, 200);
    assert.equal(await Payment.countDocuments(), 0);
});

test("handleWebhook payment.captured without userId returns 200 without creating a payment", async () => {
    const chef = await createChef({ subscriptionPrice: 499 });

    const { res, nextError } = await invokeController(
        handleWebhook,
        webhookRequest(
            paymentCapturedPayload({
                paymentId: "pay_without_user",
                chefId: chef._id,
            })
        )
    );

    assert.equal(nextError, undefined);
    assert.equal(res.statusCode, 200);
    assert.equal(await Payment.countDocuments(), 0);
});

test("handleCancelSubscription cancels an active Razorpay subscription", async () => {
    const user = await createUser();
    const chef = await createChef({ subscriptionPrice: 499 });
    await createPayment({
        razorpayPaymentId: "pay_cancel_request",
        razorpaySubscriptionId: "sub_cancel_request",
        purchasedBy: user._id,
        chef: chef._id,
        subscriptionStatus: "active",
    });

    let cancelArgs;
    razorpayInstance.subscriptions.cancel = async (...args) => {
        cancelArgs = args;
        return { id: args[0], status: "cancelled" };
    };

    const { res, nextError } = await invokeController(
        handleCancelSubscription,
        {
            user,
            body: { chefId: chef._id },
        }
    );

    assert.equal(nextError, undefined);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.message, "Subscription cancelled successfully");
    assert.deepEqual(cancelArgs, [
        "sub_cancel_request",
        { cancel_at_cycle_end: true },
    ]);
});

test("handleCancelSubscription returns 404 when no active subscription exists", async () => {
    const user = await createUser();
    const chef = await createChef({ subscriptionPrice: 499 });

    const { nextError } = await invokeController(handleCancelSubscription, {
        user,
        body: { chefId: chef._id },
    });

    assert.equal(nextError.statusCode, 404);
    assert.equal(nextError.message, "Active subscription not found");
});

test("handleCancelSubscription returns 500 when Razorpay cancellation fails", async () => {
    const user = await createUser();
    const chef = await createChef({ subscriptionPrice: 499 });
    await createPayment({
        razorpayPaymentId: "pay_cancel_error",
        razorpaySubscriptionId: "sub_cancel_error",
        purchasedBy: user._id,
        chef: chef._id,
        subscriptionStatus: "active",
    });
    razorpayInstance.subscriptions.cancel = async () => {
        throw new Error("razorpay down");
    };

    const { nextError } = await invokeController(handleCancelSubscription, {
        user,
        body: { chefId: chef._id },
    });

    assert.equal(nextError.statusCode, 500);
});
