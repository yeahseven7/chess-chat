/**
 * Embedded SQLite schema for the local driver.
 * Mirrors supabase/migrations/0001_init.sql — keep the two in sync.
 */
export const LOCAL_SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  avatar_color TEXT NOT NULL DEFAULT '#81b64c',
  avatar_url TEXT,
  password_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS friendships (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','blocked')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (requester_id, addressee_id)
);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id, status);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('direct','group')),
  name TEXT,
  avatar_color TEXT NOT NULL DEFAULT '#4a6b8a',
  created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  direct_key TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_read_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON conversation_members(user_id);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  reply_to_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  edited_at TEXT,
  deleted_at TEXT,
  analysis_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (analysis_status IN ('pending','processing','completed','failed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_deleted ON messages(deleted_at);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
  uploader_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('image','file')),
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);

CREATE TABLE IF NOT EXISTS analysis_reactions (
  message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('great','best','excellent','mistake','miss','blunder')),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'en',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reactions_category ON analysis_reactions(category);

CREATE TABLE IF NOT EXISTS emoji_reactions (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS analysis_jobs (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 4,
  run_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Duplicate-job prevention: at most one active job per message.
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_active_message
  ON analysis_jobs(message_id) WHERE status IN ('pending','processing');
CREATE INDEX IF NOT EXISTS idx_jobs_queue ON analysis_jobs(status, run_at);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  settings_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
