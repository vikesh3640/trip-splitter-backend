const express = require('express');
const os = require('os');
const { dbState } = require('../config/db');

const router = express.Router();

router.get('/', (req, res) => {
  const uptime = process.uptime();
  const env = process.env.NODE_ENV || 'development';

  res.json({
    status: 'ok',
    env,
    uptimeSeconds: Math.round(uptime),
    db: dbState(),
    host: os.hostname(),
    time: new Date().toISOString()
  });
});

module.exports = router;
