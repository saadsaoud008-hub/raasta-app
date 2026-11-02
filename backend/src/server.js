import { readConfig } from './config/env.js';
import { createApp } from './app.js';
import { pool } from './db/pool.js';
import { connectDriverCache } from './cache/driver-cache.js';
import { createBroker } from './events/sqs.js';
import { connectRideUpdates } from './realtime/ride-updates.js';
import { attachRideSockets } from './realtime/ride-sockets.js';
import { RideModel } from './models/ride.model.js';
const config = readConfig();
const redis = connectDriverCache(config.redisUrl);
const broker = process.env.SQS_QUEUE_URL ? createBroker() : undefined;
const updates = connectRideUpdates(config.redisUrl, process.env.REALTIME_CHANNEL || `raasta:${process.env.NODE_ENV || 'development'}:ride-updates`);
const server = createApp(pool, true, { ...config, driverCache: redis.cache, broker, updates }).listen(config.port, config.host, () =>
  console.log(`Ride API listening on port ${config.port}`),
);
const live = attachRideSockets(server, {
  updates,
  loadRide: id => new RideModel(pool).details(id),
  allowedOrigins: config.corsOrigins.length || process.env.NODE_ENV === 'production' ? config.corsOrigins : ['http://127.0.0.1:5173', 'http://localhost:5173'],
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    live.close();
    updates.close();
    redis.close();
    server.close(() => {
      broker?.close();
      void pool.end().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
