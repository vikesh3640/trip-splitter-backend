const mongoose = require('mongoose');

const PayerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const TransactionSchema = new mongoose.Schema(
  {
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
    title: { type: String, required: true, trim: true },

    payers: { type: [PayerSchema], required: true }, // who paid and how much
    participants: { type: [String], required: true }, // for whom
    splitType: { type: String, enum: ['equal', 'custom'], required: true },
    customAmounts: { type: [Number], default: [] },   // aligns with participants when splitType === 'custom'

    totalAmount: { type: Number, required: true, min: 0 } // sum(payers.amount)
  },
  { timestamps: true }
);

module.exports = mongoose.model('Transaction', TransactionSchema);
