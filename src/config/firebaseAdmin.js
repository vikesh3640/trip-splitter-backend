const admin = require('firebase-admin');

let initialized = false;

function init() {
  if (initialized) return admin;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('[firebase-admin] Missing env. Will fail if auth is required.');
    return admin;
  }
  privateKey = privateKey.replace(/\\n/g, '\n');

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    initialized = true;
    console.log('[firebase-admin] Initialized');
  } catch (e) {
    if (!/already exists/i.test(e.message)) {
      console.error('[firebase-admin] init error:', e);
    }
  }

  return admin;
}

module.exports = init();
