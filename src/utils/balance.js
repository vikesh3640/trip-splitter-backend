const Trip = require('../models/Trip');
const Transaction = require('../models/Transaction');

/**
 * Recompute balances from scratch using all transactions of a trip.
 * Rules:
 * - Each payer's amount increases their balance (they fronted money).
 * - Each participant owes their share (decreases their balance).
 * - For splitType "equal": share = totalPaid / participants.length
 * - For "custom": use customAmounts[i] for participants[i]
 * Also ensures any names from transactions exist in trip.members.
 */
async function recomputeTripBalances(tripId) {
  const trip = await Trip.findById(tripId);
  if (!trip) throw Object.assign(new Error('Trip not found'), { status: 404 });

  // Build a name → balance map (case-insensitive lookups, but preserve original names)
  const nameKey = (s) => s.trim().toLowerCase();

  // start with existing members
  const bal = new Map();
  const displayName = new Map();
  for (const m of trip.members) {
    bal.set(nameKey(m.name), 0);
    displayName.set(nameKey(m.name), m.name);
  }

  // load all transactions
  const txns = await Transaction.find({ tripId }).lean();

  for (const t of txns) {
    // Ensure names are tracked
    for (const p of t.payers) {
      const k = nameKey(p.name);
      if (!bal.has(k)) {
        bal.set(k, 0);
        displayName.set(k, p.name.trim());
      }
    }
    for (const name of t.participants) {
      const k = nameKey(name);
      if (!bal.has(k)) {
        bal.set(k, 0);
        displayName.set(k, name.trim());
      }
    }

    const totalPaid = (t.payers || []).reduce((s, p) => s + Number(p.amount || 0), 0);

    // credit payers
    for (const p of t.payers) {
      const k = nameKey(p.name);
      bal.set(k, bal.get(k) + Number(p.amount || 0));
    }

    // debit participants
    if ((t.participants || []).length === 0) continue;

    if (t.splitType === 'equal') {
      const share = totalPaid / t.participants.length;
      for (const name of t.participants) {
        const k = nameKey(name);
        bal.set(k, bal.get(k) - share);
      }
    } else if (t.splitType === 'custom') {
      if (!Array.isArray(t.customAmounts) || t.customAmounts.length !== t.participants.length) {
        // If mismatch, skip debits to avoid corrupting balances; better to be conservative
        continue;
      }
      for (let i = 0; i < t.participants.length; i++) {
        const k = nameKey(t.participants[i]);
        bal.set(k, bal.get(k) - Number(t.customAmounts[i] || 0));
      }
    }
  }

  // Write back to trip.members (preserve consistent order: existing first, then new alpha)
  const existingKeys = new Set(trip.members.map(m => nameKey(m.name)));

  // update existing
  for (const m of trip.members) {
    m.balance = Number((bal.get(nameKey(m.name)) || 0).toFixed(2));
  }

  // append new members discovered from transactions
  const newMembers = [];
  for (const [k, v] of bal.entries()) {
    if (!existingKeys.has(k)) {
      newMembers.push({ name: displayName.get(k), balance: Number(v.toFixed(2)) });
    }
  }
  newMembers.sort((a, b) => a.name.localeCompare(b.name));
  trip.members.push(...newMembers);

  await trip.save();
  return trip.toObject();
}

module.exports = { recomputeTripBalances };
