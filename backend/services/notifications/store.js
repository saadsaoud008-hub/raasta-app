import { normalizeEmail } from '../../src/shared/email.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const messages = {
  REQUESTED: 'Your ride was requested.',
  ACCEPTED: 'A driver accepted your ride.',
  CANCELLED: 'Your ride was cancelled.',
  COMPLETED: 'Your ride was completed.',
};

export function parseEvent(body) {
  const event = JSON.parse(body);
  if (!event || event.version !== 1 || !Object.hasOwn(messages, event.status) ||
    event.type !== `ride.${event.status.toLowerCase()}` ||
    ![event.eventId, event.rideId, event.riderId].every(id => typeof id === 'string' && uuid.test(id)) ||
    typeof event.occurredAt !== 'string' || !Number.isFinite(Date.parse(event.occurredAt)))
    throw new Error('Invalid ride event.');
  return { ...event, recipientEmail: normalizeEmail(event.recipientEmail) };
}

export async function storeNotification(db, event, emailEnabled = false) {
  // No cross-service joins or foreign keys; a separate database is supported.
  // Concurrent duplicate deliveries converge on the same primary key.
  await db.query(`INSERT INTO notifications.inbox
    (event_id,ride_id,rider_id,event_type,status,occurred_at,message,email_to,email_state,email_error)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(event_id) DO NOTHING`, [
    event.eventId, event.rideId, event.riderId, event.type, event.status,
    event.occurredAt, messages[event.status], event.recipientEmail || null,
    emailEnabled && event.recipientEmail ? 'PENDING' : 'SKIPPED',
    !emailEnabled ? 'email_disabled' : !event.recipientEmail ? 'missing_recipient' : null,
  ]);
}
