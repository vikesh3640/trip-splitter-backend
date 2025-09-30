const mongoose = require('mongoose');

let isConnectedOnce = false;

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/trip-splitter';

  try {
    await mongoose.connect(uri, {
      autoIndex: true
      // dbName: undefined // use DB name from URI
    });

    if (!isConnectedOnce) {
      isConnectedOnce = true;
      console.log('[db] Connected to MongoDB');
    }
  } catch (err) {
    console.error('[db] MongoDB connection error:', err.message);
    // Do not throw — let the API run; /health will reflect DB status.
  }

  mongoose.connection.on('disconnected', () => {
    console.warn('[db] MongoDB disconnected');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('[db] MongoDB reconnected');
  });
};

const dbState = () => {
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  const state = mongoose.connection.readyState;
  const map = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  return map[state] || 'unknown';
};

module.exports = { connectDB, dbState };
