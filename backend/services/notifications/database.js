import pg from 'pg';

export function notificationDatabase(env = process.env) {
  if (!env.NOTIFICATIONS_DATABASE_URL)
    throw new Error('NOTIFICATIONS_DATABASE_URL is required for the notification service.');
  return new pg.Pool({
    connectionString: env.NOTIFICATIONS_DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
}
