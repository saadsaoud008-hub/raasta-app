import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';

export function createRideUpdates() {
  const events = new EventEmitter();
  events.setMaxListeners(0);
  return {
    subscribe(id, listener) {
      events.on(id, listener);
      return () => events.off(id, listener);
    },
    onResync(listener) {
      events.on('resync', listener);
      return () => events.off('resync', listener);
    },
    changed(id) { events.emit(id); },
    resync() { events.emit('resync'); },
    async publish(ride) { events.emit(ride.id); },
    close() { events.removeAllListeners(); },
  };
}

// Redis is backend-only. Each API instance uses two shared connections, not one per browser.
export function connectRideUpdates(url, channel = 'raasta:development:ride-updates', logger = console, clientFactory = createClient) {
  const updates = createRideUpdates();
  if (!url) return updates; // Single-instance local development.
  const source = randomUUID();
  const publisher = clientFactory({ url, disableOfflineQueue: true,
    socket: { connectTimeout: 1000, reconnectStrategy: () => 1000 } });
  const subscriber = publisher.duplicate();
  let reported = false;
  const warn = () => {
    if (!reported) logger.warn('Redis live updates unavailable; local updates and manual refresh remain available.');
    reported = true;
  };
  const receive = body => {
    try {
      const event = JSON.parse(body);
      if (event.source !== source && typeof event.rideId === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.rideId)) updates.changed(event.rideId);
    } catch { /* Ignore malformed internal messages. */ }
  };
  publisher.on('error', warn);
  subscriber.on('error', warn);
  subscriber.on('ready', () => {
    void subscriber.subscribe(channel, receive).then(() => {
      reported = false;
      updates.resync(); // Recover current snapshots after Redis reconnects.
    }).catch(warn);
  });
  void publisher.connect().catch(warn);
  void subscriber.connect().catch(warn);
  const localPublish = updates.publish;
  updates.publish = async ride => {
    await localPublish(ride);
    if (!publisher.isReady) return;
    try {
      await publisher.withCommandOptions({ timeout: 200 }).publish(channel, JSON.stringify({ rideId: ride.id, source }));
    } catch { warn(); }
  };
  const clear = updates.close;
  updates.close = () => {
    clear();
    if (publisher.isOpen) publisher.destroy();
    if (subscriber.isOpen) subscriber.destroy();
  };
  return updates;
}
