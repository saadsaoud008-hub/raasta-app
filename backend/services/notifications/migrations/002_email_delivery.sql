ALTER TABLE notifications.inbox
  ADD COLUMN email_to text,
  ADD COLUMN email_state text NOT NULL DEFAULT 'SKIPPED'
    CHECK (email_state IN ('PENDING','SENDING','SENT','SKIPPED')),
  ADD COLUMN email_claim uuid,
  ADD COLUMN email_claim_until timestamptz,
  ADD COLUMN email_message_id text,
  ADD COLUMN email_sent_at timestamptz,
  ADD COLUMN email_error text;
