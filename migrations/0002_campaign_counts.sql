-- M2 campaign counts (W3; contract: siteguard-ai docs/METRICS_SETUP.md section 4).
-- One row per (Sydney date, utm_source, utm_medium, utm_campaign). Counts only: no IP, cookie,
-- user agent, visitor id, URL or gclid value. gclid_landings is how many of the landings carried
-- a gclid; it is not sent to the Console.
CREATE TABLE IF NOT EXISTS campaign_counts (
  date TEXT NOT NULL,
  utm_source TEXT NOT NULL DEFAULT '',
  utm_medium TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  landings INTEGER NOT NULL DEFAULT 0,
  gclid_landings INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, utm_source, utm_medium, utm_campaign)
);
