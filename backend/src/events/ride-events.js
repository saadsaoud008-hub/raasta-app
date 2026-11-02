import { createHash } from 'node:crypto';
import { normalizeEmail } from '../shared/email.js';

export function rideEvent(ride, recipientEmail = null) {
  // A ride enters each status once; retries share a stable notification ID.
  const bytes = createHash('sha256').update(`raasta:ride:v1:${ride.id}:${ride.status}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80; // UUID v8: application-defined deterministic ID.
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return {
    eventId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
    version: 1,
    type: `ride.${ride.status.toLowerCase()}`,
    rideId: ride.id,
    riderId: ride.rider_id,
    recipientEmail: normalizeEmail(recipientEmail),
    status: ride.status,
    occurredAt: new Date(ride.updated_at).toISOString(),
  };
}

export async function notifyRide(broker, ride, logger = console, loadEmail = async () => null) {
  if (!broker) return;
  try {
    await broker.publish(rideEvent(ride, await loadEmail()));
  } catch {
    // The ride is committed; a notification failure must not fail a booking.
    logger.error(JSON.stringify({ service: 'api', event: 'notification_publish_failed', rideId: ride.id }));
  }
}
