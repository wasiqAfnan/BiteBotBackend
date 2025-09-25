import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema(
  {
    subscriber: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    cook: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    price: Number,
    startDate: Date,
    endDate: Date,
    razorpayOrderId: String,
    paymentStatus: {
      type: String,
      enum: ["pending", "paid"],
      default: "pending",
    },
  },
  { timestamps: true }
);

export const Subscription = mongoose.model("Subscription", subscriptionSchema);
