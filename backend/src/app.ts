import express from 'express';
import cors from 'cors';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(cors());

// Enable JSON parser for all routes except webhook raw body handling
app.use((req, res, next) => {
  if (req.originalUrl.includes('webhooks')) {
    next();
  } else {
    express.json()(req, res, next);
  }
});

// Root landing endpoint for browser inspection
app.get('/', (_req, res) => {
  res.status(200).json({
    service: 'MeterForge Billing Engine API',
    status: 'online',
    paymentGateway: 'Razorpay Test Mode',
    endpoints: {
      health: '/health or /api/health',
      plans: '/plans or /api/plans',
      usage: '/usage or /api/usage?tenantId=...',
      generate: 'POST /generate or /api/generate',
      createOrder: 'POST /create-order or /api/create-order',
      verifyPayment: 'POST /verify-payment or /api/verify-payment',
    },
  });
});

// Mount routes at both root and /api prefix
app.use('/', routes);
app.use('/api', routes);

app.use(errorHandler);

export default app;
