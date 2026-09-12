CREATE TABLE IF NOT EXISTS Events (
  id TEXT PRIMARY KEY,
  rockId TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  txHash TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS DailyYield (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rockId TEXT NOT NULL,
  date DATE NOT NULL,
  apy REAL NOT NULL,
  volume REAL NOT NULL,
  UNIQUE(rockId, date)
);

CREATE INDEX IF NOT EXISTS idx_events_rock_id ON Events(rockId);
CREATE INDEX IF NOT EXISTS idx_yield_rock_id ON DailyYield(rockId);
