import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema(
  {
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    localId: {
      type: String,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    openingBalancePaise: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer value for openingBalancePaise',
      },
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to quickly find/upsert records synced from local SQLite
customerSchema.index({ ownerUserId: 1, localId: 1 });
customerSchema.index({ ownerUserId: 1, isArchived: 1 });
customerSchema.index({ ownerUserId: 1, name: 1 });

export const Customer = mongoose.model('Customer', customerSchema);
