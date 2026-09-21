import { Client } from 'pg';

async function debugPg() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgrespassword',
    database: 'postgres',
  });
  try {
    await client.connect();
    console.log('SUCCESS');
  } catch (err: any) {
    console.log('ERROR MESSAGE:', err.message);
    console.log('ERROR CODE:', err.code);
  }
}

debugPg();
