import { notificationDatabase } from './database.js';
import { migrate } from '../../src/db/migration-runner.js';

const db = notificationDatabase();
try {
  await migrate(db, [
    ['001_notifications', new URL('./migrations/001_notifications.sql', import.meta.url)],
    ['002_email_delivery', new URL('./migrations/002_email_delivery.sql', import.meta.url)],
  ], 'notification_migrations', 481922);
  console.log('Notification migrations applied.');
} finally { await db.end(); }
