const express = require('express');
const mongoose = require('mongoose');
const Trip = require('../models/Trip');
const Transaction = require('../models/Transaction');
const ownerAuth = require('../middlewares/authAny');
const { recomputeTripBalances } = require('../utils/balance');

const router = express.Router();

/* Settlement helpers (local)*/

function computeSettlementFromBalances(members) {
  const creditors = [];
  const debtors = [];
  for (const m of members) {
    const b = Math.round(Number(m.balance || 0));
    if (b > 0) creditors.push({ name: m.name, amt: b });
    else if (b < 0) debtors.push({ name: m.name, amt: -b });
  }

  if (!creditors.length && !debtors.length) {
    return { settlements: [], algorithm: 'optimal' };
  }

  if (members.length > 15) {
    // Greedy: match largest with largest
    creditors.sort((a, b) => b.amt - a.amt || a.name.localeCompare(b.name));
    debtors.sort((a, b) => b.amt - a.amt || a.name.localeCompare(b.name));
    const cs = [...creditors];
    const ds = [...debtors];
    const out = [];

    while (cs.length && ds.length) {
      const c = cs[0], d = ds[0];
      const pay = Math.min(c.amt, d.amt);
      out.push({ from: d.name, to: c.name, amount: pay });

      c.amt -= pay;
      d.amt -= pay;
      if (c.amt === 0) cs.shift(); else cs.sort((a, b) => b.amt - a.amt || a.name.localeCompare(b.name));
      if (d.amt === 0) ds.shift(); else ds.sort((a, b) => b.amt - a.amt || a.name.localeCompare(b.name));
    }
    return { settlements: out, algorithm: 'greedy' };
  }

  // Optimal: backtracking (min #transactions)
  const debtAmt = debtors.map(d => d.amt);
  const debtName = debtors.map(d => d.name);
  const credAmt = creditors.map(c => c.amt);
  const credName = creditors.map(c => c.name);

  let best = null;
  const curr = [];

  function dfs(i) {
    while (i < debtAmt.length && debtAmt[i] === 0) i++;
    if (i === debtAmt.length) {
      if (best === null || curr.length < best.length) best = curr.slice();
      return;
    }
    if (best !== null && curr.length >= best.length) return;

    for (let j = 0; j < credAmt.length; j++) {
      if (credAmt[j] === 0) continue;
      const pay = Math.min(debtAmt[i], credAmt[j]);
      debtAmt[i] -= pay;
      credAmt[j] -= pay;
      curr.push({ from: debtName[i], to: credName[j], amount: pay });
      dfs(i + (debtAmt[i] === 0 ? 1 : 0));
      curr.pop();
      debtAmt[i] += pay;
      credAmt[j] += pay;
    }
  }

  // Sort desc to prune search better
  const zippedD = debtors.map(d => ({ ...d }));
  const zippedC = creditors.map(c => ({ ...c }));
  zippedD.sort((a, b) => b.amt - a.amt);
  zippedC.sort((a, b) => b.amt - a.amt);
  for (let k = 0; k < zippedD.length; k++) { debtAmt[k] = zippedD[k].amt; debtName[k] = zippedD[k].name; }
  for (let k = 0; k < zippedC.length; k++) { credAmt[k] = zippedC[k].amt; credName[k] = zippedC[k].name; }

  dfs(0);
  return { settlements: best || [], algorithm: 'optimal' };
}

/*CRUD endpoints */

/**
 * GET /api/trips/:tripId/transactions
 * List transactions (owner-only).
 */
router.get('/trips/:tripId/transactions', ownerAuth, async (req, res, next) => {
  try {
    const { tripId } = req.params;

    const trip = await Trip.findOne({ _id: tripId, ownerId: req.ownerId }).lean();
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const txns = await Transaction.find({ tripId }).sort({ createdAt: -1 }).lean();
    res.json(txns);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/trips/:tripId/transactions
 * Create a transaction (owner-only).
 */
router.post('/trips/:tripId/transactions', ownerAuth, async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const { title, payers = [], participants = [], splitType, customAmounts = [] } = req.body || {};

    const trip = await Trip.findOne({ _id: tripId, ownerId: req.ownerId });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (trip.isClosed) return res.status(409).json({ error: 'Trip is closed' });

    // Basic validation
    if (!title || typeof title !== 'string') return res.status(400).json({ error: 'title is required' });
    if (!Array.isArray(payers) || payers.length === 0) return res.status(400).json({ error: 'payers required' });
    if (!Array.isArray(participants) || participants.length === 0) return res.status(400).json({ error: 'participants required' });
    if (!['equal', 'custom'].includes(splitType)) return res.status(400).json({ error: 'splitType must be equal|custom' });
    if (splitType === 'custom' && (!Array.isArray(customAmounts) || customAmounts.length !== participants.length)) {
      return res.status(400).json({ error: 'customAmounts must align with participants' });
    }

    // Normalizing and computing totals
    const normPayers = payers
      .filter(p => p && typeof p.name === 'string' && p.name.trim() && Number(p.amount) >= 0)
      .map(p => ({ name: p.name.trim(), amount: Number(p.amount) }));

    if (normPayers.length === 0) return res.status(400).json({ error: 'valid payers required' });

    const normParticipants = participants
      .filter(n => typeof n === 'string' && n.trim())
      .map(n => n.trim());

    const totalAmount = normPayers.reduce((s, p) => s + p.amount, 0);

    const txn = await Transaction.create({
      tripId: new mongoose.Types.ObjectId(tripId),
      title: title.trim(),
      payers: normPayers,
      participants: normParticipants,
      splitType,
      customAmounts: splitType === 'custom' ? customAmounts.map(Number) : [],
      totalAmount
    });

    // Update balances 
    await recomputeTripBalances(tripId);

    res.status(201).json(txn);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/transactions/:id
 * Update a transaction (owner-only).
 */
router.put('/transactions/:id', ownerAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const txn = await Transaction.findById(id);
    if (!txn) return res.status(404).json({ error: 'Transaction not found' });

    // Verify ownership via trip
    const trip = await Trip.findOne({ _id: txn.tripId, ownerId: req.ownerId });
    if (!trip) return res.status(403).json({ error: 'Not allowed' });
    if (trip.isClosed) return res.status(409).json({ error: 'Trip is closed' });

    const { title, payers, participants, splitType, customAmounts } = req.body || {};

    if (title !== undefined) {
      if (!title || typeof title !== 'string') return res.status(400).json({ error: 'invalid title' });
      txn.title = title.trim();
    }
    if (payers !== undefined) {
      if (!Array.isArray(payers) || payers.length === 0) return res.status(400).json({ error: 'invalid payers' });
      const norm = payers
        .filter(p => p && typeof p.name === 'string' && p.name.trim() && Number(p.amount) >= 0)
        .map(p => ({ name: p.name.trim(), amount: Number(p.amount) }));
      if (norm.length === 0) return res.status(400).json({ error: 'invalid payers' });
      txn.payers = norm;
    }
    if (participants !== undefined) {
      if (!Array.isArray(participants) || participants.length === 0) return res.status(400).json({ error: 'invalid participants' });
      txn.participants = participants.map(s => String(s).trim()).filter(Boolean);
    }
    if (splitType !== undefined) {
      if (!['equal', 'custom'].includes(splitType)) return res.status(400).json({ error: 'invalid splitType' });
      txn.splitType = splitType;
    }
    if (txn.splitType === 'custom') {
      const arr = customAmounts !== undefined ? customAmounts : txn.customAmounts;
      if (!Array.isArray(arr) || arr.length !== txn.participants.length) {
        return res.status(400).json({ error: 'customAmounts must align with participants' });
      }
      txn.customAmounts = arr.map(Number);
    } else {
      txn.customAmounts = [];
    }

    // recompute total
    txn.totalAmount = (txn.payers || []).reduce((s, p) => s + Number(p.amount || 0), 0);

    await txn.save();

    await recomputeTripBalances(String(txn.tripId));

    res.json(txn.toObject());
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/transactions/:id
 * Delete a transaction (owner-only).
 */
router.delete('/transactions/:id', ownerAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const txn = await Transaction.findById(id);
    if (!txn) return res.status(404).json({ error: 'Transaction not found' });

    // Verify ownership
    const trip = await Trip.findOne({ _id: txn.tripId, ownerId: req.ownerId });
    if (!trip) return res.status(403).json({ error: 'Not allowed' });
    if (trip.isClosed) return res.status(409).json({ error: 'Trip is closed' });

    await Transaction.deleteOne({ _id: id });

    await recomputeTripBalances(String(txn.tripId));

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/trips/:tripId/settlement
 * ONLY available if trip.isClosed === true
 */
router.get('/trips/:tripId/settlement', ownerAuth, async (req, res, next) => {
  try {
    const trip = await Trip.findOne({ _id: req.params.tripId, ownerId: req.ownerId }).lean();
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    if (!trip.isClosed) {
      return res.status(403).json({
        error: 'Trip not closed. Settlement is only available after the trip is ended.',
        isClosed: false
      });
    }

    // compute from current balances
    const result = computeSettlementFromBalances(trip.members || []);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/*  PUBLIC READ-ONLY ENDPOINTS (by slug)  */

/**
 * GET /api/public/trips/:slug/transactions
 * Public, read-only: list transactions by trip slug.
 */
router.get('/public/trips/:slug/transactions', async (req, res, next) => {
  try {
    const trip = await Trip.findOne({ publicSlug: req.params.slug }).lean();
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const txns = await Transaction.find({ tripId: trip._id }).sort({ createdAt: -1 }).lean();
    res.json(txns);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/public/trips/:slug/settlement
 * Public, read-only: only when trip.isClosed === true
 */
router.get('/public/trips/:slug/settlement', async (req, res, next) => {
  try {
    const trip = await Trip.findOne({ publicSlug: req.params.slug }).lean();
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    if (!trip.isClosed) {
      return res.status(403).json({
        error: 'Trip not closed. Settlement is available after the trip is ended.',
        isClosed: false
      });
    }

    const result = computeSettlementFromBalances(trip.members || []);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
