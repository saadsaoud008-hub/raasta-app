CREATE SCHEMA IF NOT EXISTS notifications;
CREATE TABLE notifications.inbox (
  event_id uuid PRIMARY KEY,
  ride_id uuid NOT NULL,
  rider_id uuid NOT NULL,
  event_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('REQUESTED','ACCEPTED','CANCELLED','COMPLETED')),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  message text NOT NULL
);
CREATE INDEX rider_notification_history ON notifications.inbox(rider_id,occurred_at DESC,event_id);
