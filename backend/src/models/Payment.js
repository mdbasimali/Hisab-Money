import mongoose from 'mongoose';

const PAYMENT_METHODS = ['cash', 'upi', 'bank_transfer', 'neft', 'rtgs', 'imps', 'cheque', 'other'];

const paymentSchema = new mongoose.Schema(
  {
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    clientTransactionId: {
      type: String,
      trim: true,
      sparse: true,
    },
    amountPaise: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer paise value for amountPaise',
      },
    },
    paymentMethod: {
      type: String,
      enum: PAYMENT_METHODS,
      required: true,
      default: 'cash',
    },
    paymentDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate payment creation/sync using unique compound index
paymentSchema.index(
  { ownerUserId: 1, clientTransactionId: 1 },
  { unique: true, sparse: true }
);

paymentSchema.index({ customerId: 1, paymentDate: -1 });

export const Payment = mongoose.model('Payment', paymentSchema);
