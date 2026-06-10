import mongoose from "mongoose";
import User from "../../src/models/user.models.js";
import Payment from "../../src/models/payment.models.js";

const password = "StrongPass1!";

export const createUser = async (overrides = {}) =>
    User.create({
        _id: overrides._id,
        email:
            overrides.email ?? `user-${new mongoose.Types.ObjectId()}@test.com`,
        password: overrides.password ?? password,
        role: overrides.role ?? "USER",
        profile: {
            name: overrides.name ?? "Test User",
            cuisine: overrides.cuisine ?? "indian",
            subscribed: overrides.subscribed ?? [],
            dietaryLabels: overrides.dietaryLabels ?? [],
            allergens: overrides.allergens ?? [],
        },
        chefProfile: overrides.chefProfile ?? {},
        isActive: overrides.isActive ?? true,
    });

export const createChef = async (overrides = {}) =>
    createUser({
        _id: overrides._id,
        email:
            overrides.email ?? `chef-${new mongoose.Types.ObjectId()}@test.com`,
        role: overrides.role ?? "CHEF",
        name: overrides.name ?? "Chef Test",
        chefProfile: {
            subscriptionPrice: overrides.subscriptionPrice,
            razorpayPlanId: overrides.razorpayPlanId,
            subscribers: overrides.subscribers ?? [],
            ...overrides.chefProfile,
        },
        isActive: overrides.isActive ?? true,
    });

export const createPayment = async (overrides = {}) =>
    Payment.create({
        razorpayPaymentId:
            overrides.razorpayPaymentId ??
            `pay_${new mongoose.Types.ObjectId()}`,
        razorpaySubscriptionId:
            overrides.razorpaySubscriptionId ??
            `sub_${new mongoose.Types.ObjectId()}`,
        razorpaySignature: overrides.razorpaySignature ?? "valid-signature",
        purchasedBy: overrides.purchasedBy,
        chef: overrides.chef,
        amount: overrides.amount ?? 499,
        currency: overrides.currency ?? "INR",
        paymentStatus: overrides.paymentStatus ?? overrides.status ?? "captured",
        subscriptionStatus: overrides.subscriptionStatus ?? "active",
        currentStart: overrides.currentStart,
        currentEnd: overrides.currentEnd,
        nextBillingAt: overrides.nextBillingAt,
        cancelledAt: overrides.cancelledAt,
    });

export const mockResponse = () => {
    const res = {
        statusCode: undefined,
        body: undefined,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };

    return res;
};

export const invokeController = async (controller, req = {}) => {
    const res = mockResponse();
    let nextError;

    await controller(req, res, (error) => {
        nextError = error;
    });

    return { res, nextError };
};

export const rawWebhookBody = (payload) => Buffer.from(JSON.stringify(payload));

export const paymentCapturedPayload = ({
    paymentId = "pay_test",
    subscriptionId = "sub_test",
    invoiceId = "inv_test",
    amount = 49900,
    currency = "INR",
    status = "captured",
    userId,
    chefId,
} = {}) => ({
    event: "payment.captured",
    payload: {
        payment: {
            entity: {
                id: paymentId,
                subscription_id: subscriptionId,
                invoice_id: invoiceId,
                amount,
                currency,
                status,
                notes: {
                    userId: userId?.toString(),
                    chefId: chefId?.toString(),
                },
            },
        },
    },
});

export const subscriptionActivatedPayload = ({
    subscriptionId,
    userId,
    chefId,
    currentStart = 1_700_000_000,
    currentEnd = 1_702_592_000,
    chargeAt = 1_702_592_000,
    status = "active",
} = {}) => ({
    event: "subscription.activated",
    payload: {
        subscription: {
            entity: {
                id: subscriptionId,
                current_start: currentStart,
                current_end: currentEnd,
                charge_at: chargeAt,
                status,
                notes: {
                    userId: userId?.toString(),
                    chefId: chefId?.toString(),
                },
            },
        },
    },
});

export const subscriptionCancelledPayload = ({
    subscriptionId,
    endedAt = 1_702_592_000,
} = {}) => ({
    event: "subscription.cancelled",
    payload: {
        subscription: {
            entity: {
                id: subscriptionId,
                ended_at: endedAt,
            },
        },
    },
});

export const paymentFailedPayload = () => ({
    event: "payment.failed",
    payload: {
        payment: {
            entity: {
                id: "pay_failed",
            },
        },
    },
});

export const randomEventPayload = () => ({
    event: "random.event",
    payload: {},
});
