const express = require('express');
const Trip = require('../models/Trip');
const ownerAuth = require('../middlewares/authAny');

const router = express.Router();

/**
 * POST /api/trips
 * Create a new trip (owner-only).
 * Body: { name: string, members?: [{ name }] }
 * Header: x-owner-id: <string>
 */
router.post('/', ownerAuth, async (req, res, next) => {
  try {
    const { name, members = [] } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Trip name is required' });
    }
    // Normalize members
    const normMembers = members
      .filter(m => m && typeof m.name === 'string' && m.name.trim())
      .map(m => ({ name: m.name.trim(), balance: 0 }));

    const trip = await Trip.create({
      ownerId: req.ownerId,
      name: name.trim(),
      members: normMembers
    });

    res.status(201).json(trip);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/trips
 * List trips for the authenticated owner.
 */
router.get('/', ownerAuth, async (req, res, next) => {
  try {
    const trips = await Trip.find({ ownerId: req.ownerId })
      .sort({ createdAt: -1 })
      .lean();
    res.json(trips);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/trips/:id
 * Get a single trip (owner-only).
 */
router.get('/:id', ownerAuth, async (req, res, next) => {
  try {
    const trip = await Trip.findOne({ _id: req.params.id, ownerId: req.ownerId }).lean();
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    res.json(trip);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/trips/public/slug/:slug
 * Public read-only access by slug (no auth).
 */
router.get('/public/slug/:slug', async (req, res, next) => {
  try {
    const trip = await Trip.findOne({ publicSlug: req.params.slug }).lean();
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    // Public view: omit ownerId
    const { ownerId, ...publicTrip } = trip;
    res.json(publicTrip);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/trips/:id/members
 * Add a member to a trip (owner-only).
 */
router.put('/:id/members', ownerAuth, async (req, res, next) => {
  try {
    const { name } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Member name is required' });
    }

    const trip = await Trip.findOne({ _id: req.params.id, ownerId: req.ownerId });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (trip.isClosed) return res.status(409).json({ error: 'Trip is closed' });

    // Prevent duplicate names (case-insensitive)
    const exists = trip.members.some(m => m.name.toLowerCase() === name.trim().toLowerCase());
    if (exists) {
      return res.status(409).json({ error: 'Member with this name already exists' });
    }

    trip.members.push({ name: name.trim(), balance: 0 });
    await trip.save();

    res.json(trip);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/trips/:id
 * Delete a trip (owner-only).
 */
router.delete('/:id', ownerAuth, async (req, res, next) => {
  try {
    const deleted = await Trip.findOneAndDelete({ _id: req.params.id, ownerId: req.ownerId });
    if (!deleted) return res.status(404).json({ error: 'Trip not found' });
    res.json({ ok: true, id: deleted._id });
  } catch (err) {
    next(err);
  }
});

/**
 * NEW: PUT /api/trips/:id/close
 * End a trip -> lock edits and reveal settlement.
 */
router.put('/:id/close', ownerAuth, async (req, res, next) => {
  try {
    const trip = await Trip.findOne({ _id: req.params.id, ownerId: req.ownerId });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (trip.isClosed) return res.json(trip);

    trip.isClosed = true;
    trip.endedAt = new Date();
    await trip.save();
    res.json(trip);
  } catch (err) {
    next(err);
  }
});

/**
 * NEW: PUT /api/trips/:id/reopen
 * Reopen a closed trip -> hide settlement, allow edits again.
 */
router.put('/:id/reopen', ownerAuth, async (req, res, next) => {
  try {
    const trip = await Trip.findOne({ _id: req.params.id, ownerId: req.ownerId });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (!trip.isClosed) return res.json(trip);

    trip.isClosed = false;
    trip.endedAt = null;
    await trip.save();
    res.json(trip);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

