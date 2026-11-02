import { randomUUID } from 'node:crypto';

export async function deliverEmail(db, eventId, sender) {
  const claim = randomUUID();
  const result = await db.query(`UPDATE notifications.inbox
    SET email_state='SENDING',email_claim=$2,email_claim_until=now()+interval '120 seconds'
    WHERE event_id=$1 AND email_state IN ('PENDING','SENDING')
      AND (email_claim_until IS NULL OR email_claim_until < now())
    RETURNING event_id,ride_id,status,email_to`, [eventId, claim]);
  if (!result.rows.length) {
    const existing = await db.query('SELECT email_state FROM notifications.inbox WHERE event_id=$1', [eventId]);
    if (['SENT', 'SKIPPED'].includes(existing.rows[0]?.email_state)) return;
    throw new Error('Another worker is sending this email; retry later.');
  }
  try {
    const messageId = await sender.send(result.rows[0]);
    const saved = await db.query(`UPDATE notifications.inbox SET email_state='SENT',email_message_id=$3,
      email_sent_at=now(),email_claim=NULL,email_claim_until=NULL,email_error=NULL
      WHERE event_id=$1 AND email_claim=$2`, [eventId, claim, messageId]);
    if (saved.rowCount !== 1) throw new Error('Email claim expired before saving.');
  } catch {
    await db.query(`UPDATE notifications.inbox SET email_state='PENDING',email_claim=NULL,
      email_claim_until=NULL,email_error='email_send_failed'
      WHERE event_id=$1 AND email_claim=$2`, [eventId, claim]);
    throw new Error('Email delivery failed.');
  }
}
