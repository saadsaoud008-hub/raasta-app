import { readFile } from 'node:fs/promises';
import { pool } from './pool.js';
if (!process.env.DATABASE_URL)
    throw new Error('DATABASE_URL is required.');
const client = await pool.connect();
try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(481921)');
    await client.query('CREATE TABLE IF NOT EXISTS migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const name = '001_initial';
    const applied = await client.query('SELECT 1 FROM migrations WHERE name=$1', [name]);
    if (!applied.rowCount) {
        await client.query(await readFile(new URL('./migrations/001_initial.sql', import.meta.url), 'utf8'));
        await client.query('INSERT INTO migrations(name) VALUES($1)', [name]);
    }
    await client.query('COMMIT');
    console.log('Migrations applied.');
}
catch (error) {
    await client.query('ROLLBACK');
    throw error;
}
finally {
    client.release();
    await pool.end();
}
