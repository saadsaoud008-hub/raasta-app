import { notificationDatabase } from './database.js';
import { createBroker } from '../../src/events/sqs.js';
import { runWorker } from '../../src/workers/runtime.js';
import { consumeBatch } from './consume.js';
import { createEmailSender } from './email.js';

const db = notificationDatabase();
const broker = createBroker();
const emailSender = createEmailSender();
await runWorker('notifications', signal => consumeBatch(db, broker, signal, console, emailSender), async () => {
  emailSender?.close();
  broker.close();
  await db.end();
});
