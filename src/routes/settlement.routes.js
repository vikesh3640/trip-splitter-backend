const express = require('express');
const Trip = require('../models/Trip');
const ownerAuth = require('../middlewares/authAny');
const { computeSettlement } = require('../utils/settlement');

const router = express.Router();

/**
 * GET /api/trips/:tripId/settlement
 * Compute settlements for a trip (owner-only).
 */
router.get('/trips/:tripId/settlement', ownerAuth, async (req, res, next) => {
  try {
    const trip = await Trip.findOne({ _id: req.params.tripId, ownerId: req.ownerId }).lean();
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const result = computeSettlement(trip.members);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
