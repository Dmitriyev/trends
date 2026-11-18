ALTER TABLE visitors ADD COLUMN language TEXT NOT NULL DEFAULT 'unknown'
  CHECK (language IN ('en', 'ru', 'unknown'));
