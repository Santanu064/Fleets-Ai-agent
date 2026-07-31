-- ============================================================================
-- Production Migration v2: Deduplication & Performance Indexes
-- ============================================================================
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- This is SAFE to run multiple times (all statements use IF NOT EXISTS).
-- ============================================================================

-- 1. Webhook Event Deduplication Table
-- Stores WhatsApp message IDs (wamid) to prevent duplicate processing.
-- Used by src/lib/dedup.ts as the durable deduplication layer.
CREATE TABLE IF NOT EXISTS webhook_events (
  wamid TEXT PRIMARY KEY,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for cleanup queries (prune events older than 48 hours)
CREATE INDEX IF NOT EXISTS idx_webhook_events_received
  ON webhook_events(received_at);

-- 2. Additional Performance Indexes
-- These speed up common dashboard and webhook queries.

-- Fast driver lookup by phone (used on every incoming message)
CREATE INDEX IF NOT EXISTS idx_drivers_phone
  ON drivers(phone);

-- Fast conversation lookup by phone (used on every incoming message)
CREATE INDEX IF NOT EXISTS idx_conversations_phone
  ON conversations(phone);

-- Fast issue lookup by conversation (used in dashboard)
CREATE INDEX IF NOT EXISTS idx_issues_conversation
  ON issues(conversation_id);

-- Fast issue lookup by driver (used in technician portal)
CREATE INDEX IF NOT EXISTS idx_issues_driver
  ON issues(driver_id);

-- 3. Auto-Cleanup Function for Old Webhook Events
-- Removes webhook_events older than 48 hours. Call this from a Supabase
-- scheduled function (cron) or run manually when needed.
CREATE OR REPLACE FUNCTION cleanup_old_webhook_events()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM webhook_events
  WHERE received_at < NOW() - INTERVAL '48 hours';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- 4. Enable Realtime on webhook_events (optional, for monitoring)
-- Uncomment the line below if you want to monitor dedup events in real-time:
-- ALTER PUBLICATION supabase_realtime ADD TABLE webhook_events;

-- ============================================================================
-- DONE. You can verify by running:
--   SELECT COUNT(*) FROM webhook_events;
-- It should return 0 (empty table, ready for use).
-- ============================================================================
