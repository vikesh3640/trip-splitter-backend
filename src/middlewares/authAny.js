// src/middlewares/authAny.js
const admin = require("../lib/firebaseAdmin");

module.exports = async function authAny(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const idToken = match[1];
    const decoded = await admin.auth().verifyIdToken(idToken);

    // Attach ownerId for downstream routes
    req.ownerId = decoded.uid;

    return next();
  } catch (err) {
    console.error("authAny verify failed:", err?.message);
    return res.status(401).json({ error: "Invalid token" });
  }
};
