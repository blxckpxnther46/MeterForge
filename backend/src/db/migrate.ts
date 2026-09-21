import fs from 'fs';
import path from 'path';
import { query } from '../config/database';

export async function runMigrations() {
  try {
    console.log('Running database migrations...');
    const sqlPath = path.join(__dirname, 'migrations', '001_initial_schema.sql');
    const rawSql = fs.readFileSync(sqlPath, 'utf8');

    // Split statements by semicolon for clean execution across both PG and SQLite
    const statements = rawSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      await query(stmt);
    }
    console.log('Database migrations applied successfully.');
  } catch (error) {
    console.error('Failed to run migrations:', error);
    throw error;
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
