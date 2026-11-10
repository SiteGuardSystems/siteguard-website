-- U1 (Remaining build queue Rev01): unsubscribes taken on /u/<token>.
-- One row per prospect: the prospect id and when, never an email address.
-- siteguard-ai's collector (U2) reads rows WHERE collected_at IS NULL, suppresses each in the
-- CRM, then sets collected_at. Rows are never deleted by either side.
CREATE TABLE IF NOT EXISTS unsubscribes (
  id INTEGER PRIMARY KEY,
  prospect_id TEXT NOT NULL,
  at TEXT NOT NULL,
  collected_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS unsubscribes_prospect ON unsubscribes (prospect_id);
CREATE INDEX IF NOT EXISTS unsubscribes_uncollected ON unsubscribes (collected_at);
