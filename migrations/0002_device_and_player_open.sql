ALTER TABLE visitors ADD COLUMN device TEXT NOT NULL DEFAULT 'unknown'
  CHECK (device IN ('mobile', 'desktop', 'unknown'));
ALTER TABLE sessions ADD COLUMN device TEXT NOT NULL DEFAULT 'unknown'
  CHECK (device IN ('mobile', 'desktop', 'unknown'));

CREATE UNIQUE INDEX events_player_open_once ON events(session_id, video)
  WHERE kind = 'player_open_3s';
