const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const healthRoutes = require('./routes/health.routes');
const tripRoutes = require('./routes/trip.routes');
const transactionRoutes = require('./routes/transaction.routes');
const settlementRoutes = require('./routes/settlement.routes'); // ⬅️ NEW
const aiRoutes = require("./routes/ai.routes");

const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// Core middlewares
app.use(helmet());
app.use(cors({ origin: '*', credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// Basic root
app.get('/', (req, res) => {
  res.json({
    name: 'Trip-Splitter API',
    status: 'ok',
    docs: null
  });
});

// Routes
app.use('/health', healthRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api', transactionRoutes); // transactions endpoints
app.use('/api', settlementRoutes);  // settlement endpoint
app.use("/api/ai", aiRoutes);

// 404 + error handler
app.use(notFound);
app.use(errorHandler);

module.exports = app;
