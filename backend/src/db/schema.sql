PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  join_code_hash TEXT UNIQUE NOT NULL,
  hint CHAR(4) NOT NULL,
  join_code TEXT,
  elo INTEGER NOT NULL DEFAULT 600,
  is_qualified INTEGER NOT NULL DEFAULT 0,
  round2_eligible INTEGER NOT NULL DEFAULT 0,
  clue_credits INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS merchant_clues (
  team_id TEXT NOT NULL REFERENCES teams(id),
  bot_id TEXT NOT NULL,
  tier INTEGER NOT NULL,
  revealed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (team_id, bot_id, tier)
 );

CREATE TABLE IF NOT EXISTS team_members (
  team_id TEXT NOT NULL REFERENCES teams(id),
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  session_nonce TEXT NOT NULL DEFAULT '',
  presence TEXT NOT NULL DEFAULT 'offline',
  last_seen_at TEXT,
  PRIMARY KEY (team_id, display_name)
);

CREATE TABLE IF NOT EXISTS team_inventory (
  team_id TEXT NOT NULL REFERENCES teams(id),
  bot_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  is_real INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'locked',
  obtained_at TEXT,
  verified_at TEXT,
  obtained_by TEXT,
  claimed_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (team_id, bot_id)
);

CREATE TABLE IF NOT EXISTS elo_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT NOT NULL REFERENCES teams(id),
  delta INTEGER NOT NULL,
  before_rating INTEGER NOT NULL,
  after_rating INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS bot_completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  team_id TEXT NOT NULL REFERENCES teams(id),
  completed_by TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  completion_rank INTEGER NOT NULL,
  elapsed_secs INTEGER NOT NULL DEFAULT 0,
  base_delta INTEGER NOT NULL DEFAULT 0,
  speed_bonus INTEGER NOT NULL DEFAULT 0,
  elo_delta INTEGER NOT NULL DEFAULT 0,
  UNIQUE (bot_id, team_id),
  UNIQUE (bot_id, completion_rank)
);

CREATE TABLE IF NOT EXISTS chat_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT NOT NULL REFERENCES teams(id),
  bot_id TEXT NOT NULL,
  role TEXT NOT NULL,
  text_final TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS reasoning_traces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT REFERENCES teams(id),
  bot_id TEXT,
  phase TEXT NOT NULL,
  trace_json TEXT NOT NULL,
  guard_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sound_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT NOT NULL REFERENCES teams(id),
  bot_id TEXT NOT NULL,
  sound_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS fullscreen_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT NOT NULL REFERENCES teams(id),
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS game_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  target_id TEXT,
  reason TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS r2_assignments (
  team_id TEXT PRIMARY KEY REFERENCES teams(id),
  boss TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS r2_scores (
  team_id TEXT NOT NULL REFERENCES teams(id),
  boss TEXT NOT NULL,
  phase TEXT NOT NULL,
  score INTEGER NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (team_id, boss, phase)
);

CREATE TABLE IF NOT EXISTS deterrence_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT REFERENCES teams(id),
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  key_value TEXT NOT NULL UNIQUE,
  label TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  fail_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS cover_profiles (
  team_id TEXT NOT NULL REFERENCES teams(id),
  display_name TEXT NOT NULL,
  bot_id TEXT NOT NULL DEFAULT '*',
  alias TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  affiliation TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (team_id, display_name, bot_id)
);

CREATE TABLE IF NOT EXISTS security_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT NOT NULL REFERENCES teams(id),
  display_name TEXT NOT NULL,
  violation_type TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS r2_memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT NOT NULL REFERENCES teams(id),
  boss TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL CHECK (scope IN ('private', 'team')),
  memory TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_r2_memories_private
  ON r2_memories(team_id, boss, scope, display_name, id DESC);

CREATE INDEX IF NOT EXISTS idx_r2_memories_team
  ON r2_memories(team_id, boss, scope, id DESC);

CREATE TABLE IF NOT EXISTS r2_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT NOT NULL REFERENCES teams(id),
  boss TEXT NOT NULL,
  display_name TEXT NOT NULL,
  turn_no INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  fingerprint TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_r2_assessments_player
  ON r2_assessments(team_id, boss, display_name, id DESC);
