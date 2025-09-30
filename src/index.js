require('dotenv').config();
const http = require('http');
const app = require('./app');
const { connectDB } = require('./config/db');

const PORT = process.env.PORT || 4000;

(async () => {
  await connectDB(); // Start DB connection (server still starts even if DB is down)
  const server = http.createServer(app);

  server.listen(PORT, () => {
    console.log(`[server] Running on http://localhost:${PORT}`);
  });

  // Graceful shutdown
  const shutdown = (signal) => async () => {
    console.log(`[server] Received ${signal}. Shutting down...`);
    server.close(() => {
      console.log('[server] HTTP server closed.');
      process.exit(0);
    });
    // allow in-flight connections to finish for a bit
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGINT', shutdown('SIGINT'));
  process.on('SIGTERM', shutdown('SIGTERM'));
})();
