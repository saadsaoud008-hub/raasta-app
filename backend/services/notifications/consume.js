import { parseEvent, storeNotification } from './store.js';
import { deliverEmail } from './deliver-email.js';

export async function consumeBatch(db, broker, signal, logger = console, emailSender) {
  const messages = await broker.receive(signal);
  // Match the five-connection notification pool rather than flooding its wait queue.
  for (let offset = 0; offset < messages.length; offset += 5) {
    await Promise.all(messages.slice(offset, offset + 5).map(async (message) => {
      try {
        if (!message.ReceiptHandle) throw new Error('Missing receipt.');
        const event = parseEvent(message.Body);
        await storeNotification(db, event, Boolean(emailSender));
        if (emailSender) await deliverEmail(db, event.eventId, emailSender);
        // Delete only after durable storage. A crash before deletion causes a safe retry.
        await broker.acknowledge(message.ReceiptHandle);
        logger.log(JSON.stringify({ service: 'notifications', event: 'stored', eventId: event.eventId }));
      } catch {
        // Visibility expiry retries the message; repeated failures move to the SQS DLQ.
        logger.error(JSON.stringify({ service: 'notifications', event: 'message_failed', messageId: message.MessageId }));
      }
    }));
  }
  return messages.length > 0;
}
