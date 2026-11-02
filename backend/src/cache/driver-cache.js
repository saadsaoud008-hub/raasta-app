import { createClient } from 'redis';

export const DRIVER_CACHE_KEY = 'raasta:drivers:v1';
export const DRIVER_CACHE_TTL_SECONDS = 5;

// Redis is optional. Every cache failure becomes a miss, never a booking failure.
export function createDriverCache(client, key = DRIVER_CACHE_KEY) {
  const command = () => client.withCommandOptions({
    timeout: 100,
  });
  return {
    async get() {
      if (!client.isReady) return null;
      try {
        const value = JSON.parse(await command().get(key));
        return Array.isArray(value) && value.every((driver) =>
          driver && typeof driver.id === 'string' &&
          typeof driver.name === 'string' && typeof driver.available === 'boolean' &&
          ['ECONOMY', 'COMFORT'].includes(driver.category) &&
          typeof driver.vehicle === 'string' && typeof driver.plate === 'string',
        ) ? value : null;
      } catch {
        return null;
      }
    },
    async set(drivers) {
      if (!client.isReady) return;
      try {
        await command().set(key, JSON.stringify(drivers), {
          EX: DRIVER_CACHE_TTL_SECONDS,
        });
      } catch { /* Database results remain usable if caching fails. */ }
    },
    async invalidate() {
      if (!client.isReady) return;
      try { await command().del(key); } catch { /* TTL bounds stale data. */ }
    },
  };
}

export function connectDriverCache(url) {
  if (!url) return { cache: undefined, close() {} };
  const client = createClient({
    url,
    disableOfflineQueue: true,
    socket: { connectTimeout: 1000, reconnectStrategy: () => 1000 },
  });
  let reported = false;
  client.on('error', () => {
    if (!reported) console.warn('Redis unavailable; driver reads use PostgreSQL.');
    reported = true;
  });
  client.on('ready', () => {
    reported = false;
    console.log('Redis driver cache connected.');
  });
  // Startup and API requests do not wait for Redis to connect.
  void client.connect().catch(() => {});
  return {
    cache: createDriverCache(client),
    close() { if (client.isOpen) client.destroy(); },
  };
}
