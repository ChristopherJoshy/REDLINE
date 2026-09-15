import Database from 'better-sqlite3';
const db = new Database('backend/data/redline.db');
db.prepare("INSERT OR IGNORE INTO teams (id, name, join_code_hash, hint, elo, created_at) VALUES ('TEAM_TEST', 'Test', 'hash', 'hint', 1000, 0)").run();
db.prepare("INSERT OR IGNORE INTO team_members (team_id, display_name, joined_at) VALUES ('TEAM_TEST', 'Test User', 0)").run();
console.log('done');
