import { pool } from './pool.js';
import { migrate } from './migration-runner.js';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
try {
  await migrate(pool);
  console.log('Migrations applied.');
} finally {
  await pool.end();
}
