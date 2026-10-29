import mongoose from 'mongoose';

const dueTransactionSchema = new mongoose.Schema(
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
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    transactionDate: {
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

// Prevent duplicate transaction syncs from the same owner
dueTransactionSchema.index(
  { ownerUserId: 1, clientTransactionId: 1 },
  { unique: true, sparse: true }
);

dueTransactionSchema.index({ customerId: 1, transactionDate: -1 });

export const DueTransaction = mongoose.model('DueTransaction', dueTransactionSchema);
