CREATE TABLE visitors (
  id TEXT PRIMARY KEY,
  first_at INTEGER NOT NULL,
  source TEXT NOT NULL
);
CREATE INDEX visitors_first_at ON visitors(first_at);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL REFERENCES visitors(id),
  started_at INTEGER NOT NULL,
  depth INTEGER NOT NULL,
  depth_at_click INTEGER,
  more_seen INTEGER NOT NULL,
  active_ms INTEGER NOT NULL
);
CREATE INDEX sessions_visitor_time ON sessions(visitor_id, started_at);
CREATE INDEX sessions_started_at ON sessions(started_at);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  occurred_at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  domain TEXT NOT NULL,
  video TEXT NOT NULL
);
CREATE UNIQUE INDEX events_video_once ON events(session_id, video) WHERE kind = 'video_view';
CREATE INDEX events_time ON events(occurred_at);
