export function readConfig(env = process.env) {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error(
      'DATABASE_URL is required. Copy backend/.env.example to backend/.env and configure it.',
    );
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('DATABASE_URL must use PostgreSQL.');
  const port = Number(env.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be a valid port number.');
  const corsOrigins = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  for (const origin of corsOrigins) {
    let parsed;
    try { parsed = new URL(origin); } catch {
      throw new Error('CORS_ORIGINS must contain comma-separated HTTP(S) origins.');
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin)
      throw new Error('CORS_ORIGINS must contain HTTP(S) origins without paths or trailing slashes.');
  }
  const redisUrl = env.REDIS_URL || undefined;
  if (redisUrl) {
    let redis;
    try { redis = new URL(redisUrl); } catch {
      throw new Error('REDIS_URL must be a valid redis:// or rediss:// URL.');
    }
    if (!['redis:', 'rediss:'].includes(redis.protocol) || !redis.hostname)
      throw new Error('REDIS_URL must be a valid redis:// or rediss:// URL.');
  }
  return { databaseUrl, port, host: env.HOST ?? '127.0.0.1', corsOrigins, redisUrl };
}
