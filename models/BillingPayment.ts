import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface IBillingPayment extends Document {
  userEmail: string;
  orderId: string;
  paymentId?: string;
  type: 'plan' | 'credits';
  description: string;
  planKey?: string;
  billingCycle?: string;
  credits?: number;
  amountInr: number;
  status: 'pending' | 'paid';
  paidAt?: Date;
  createdAt: Date;
}

const BillingPaymentSchema = new Schema<IBillingPayment>({
  userEmail: { type: String, required: true, lowercase: true, index: true },
  orderId: { type: String, required: true, unique: true },
  paymentId: { type: String },
  type: { type: String, enum: ['plan', 'credits'], required: true },
  description: { type: String, required: true },
  planKey: String,
  billingCycle: String,
  credits: Number,
  amountInr: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'paid'], default: 'pending' },
  paidAt: Date,
}, { timestamps: true });

const BillingPayment: Model<IBillingPayment> = mongoose.models.BillingPayment || mongoose.model<IBillingPayment>('BillingPayment', BillingPaymentSchema);
export default BillingPayment;
