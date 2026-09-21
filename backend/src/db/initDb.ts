import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function initDb() {
  // Extract base connection string (connect to default postgres DB)
  const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5432/meterforge';
  
  // Try connecting with password from URL or common passwords
  const passwordsToTry = ['postgrespassword', 'postgres', 'root', 'admin', ''];
  let connected = false;
  let client: Client | null = null;
  let matchedPassword = '';

  for (const pass of passwordsToTry) {
    const connStr = dbUrl.replace(/:([^@]+)@/, `:${pass}@`).replace(/\/meterforge$/, '/postgres');
    client = new Client({ connectionString: connStr });
    try {
      await client.connect();
      connected = true;
      matchedPassword = pass;
      console.log(`Connected to PostgreSQL server using password: "${pass || '(none)'}"`);
      break;
    } catch (err: any) {
      // Try next
    }
  }

  if (!connected || !client) {
    console.error('Could not connect to local PostgreSQL server with default passwords.');
    process.exit(1);
  }

  try {
    const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'meterforge'");
    if (res.rows.length === 0) {
      console.log("Database 'meterforge' does not exist. Creating now...");
      await client.query('CREATE DATABASE meterforge;');
      console.log("Database 'meterforge' created successfully.");
    } else {
      console.log("Database 'meterforge' already exists.");
    }

    // Update .env with matched password if different
    if (matchedPassword !== 'postgrespassword') {
      const updatedUrl = dbUrl.replace(/:([^@]+)@/, `:${matchedPassword}@`);
      process.env.DATABASE_URL = updatedUrl;
    }
  } catch (err) {
    console.error('Error creating database:', err);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  initDb();
}

export { initDb };
