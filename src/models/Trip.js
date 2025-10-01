const mongoose = require('mongoose');

const MemberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    balance: { type: Number, required: true, default: 0 } // running balance
  },
  { _id: false }
);

const TripSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true }, // Clerk user id (string)
    name: { type: String, required: true, trim: true },
    members: { type: [MemberSchema], default: [] },
    publicSlug: { type: String, unique: true, index: true },

    isClosed: { type: Boolean, default: false, index: true },
    endedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// Generate a short
TripSchema.pre('save', function (next) {
  if (!this.publicSlug) {
    const rand = Math.random().toString(36).slice(2, 8);
    const ts = Date.now().toString(36).slice(-4);
    this.publicSlug = `${rand}${ts}`;
  }
  next();
});

module.exports = mongoose.model('Trip', TripSchema);
