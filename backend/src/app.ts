import express from 'express';
import cors from 'cors';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(cors());

// Enable raw body parser specifically for webhooks or default JSON parser for other routes
app.use((req, res, next) => {
  if (req.originalUrl === '/webhooks/razorpay') {
    next();
  } else {
    express.json()(req, res, next);
  }
});

app.use('/', routes);

app.use(errorHandler);

export default app;
