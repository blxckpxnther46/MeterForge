import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5432/meterforge',
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder_key_id',
    keySecret: process.env.RAZORPAY_KEY_SECRET || 'rzp_test_placeholder_key_secret',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || 'whsec_razorpay_test_secret_placeholder',
  },
};
