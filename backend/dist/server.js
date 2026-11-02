import { createApp } from './app.js';
import { pool } from './db/pool.js';
if (!process.env.DATABASE_URL)
    throw new Error('DATABASE_URL is required. Copy backend/.env.example to backend/.env and configure it.');
const port = Number(process.env.PORT ?? 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be a valid port number.');
const server = createApp(pool).listen(port, process.env.HOST ?? '127.0.0.1', () => console.log(`Ride API listening on port ${port}`));
for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => { server.close(() => { void pool.end().then(() => process.exit(0)); }); setTimeout(() => process.exit(1), 10000).unref(); });
