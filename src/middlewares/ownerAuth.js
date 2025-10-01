const admin = require('../config/firebaseAdmin');

module.exports = async function ownerAuth(req, res, next) {
  try {
    let uid = null;

    //  Authorization: Bearer <FirebaseIdToken>
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (token) {
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        uid = decoded.uid;
      } catch (e) {
        return res.status(401).json({ error: 'Invalid token' });
      }
    }

    // Optional dev fallback
    if (!uid && process.env.DEV_ALLOW_FALLBACK === 'true') {
      const fallback = req.headers['x-owner-id'];
      if (fallback) uid = String(fallback);
    }

    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    req.ownerId = uid;
    next();
  } catch (err) {
    console.error('[ownerAuth]', err);
    return res.status(401).json({ error: 'Unauthorized' });
  }
};
