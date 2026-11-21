CREATE TABLE group_profiles (
  group_name TEXT PRIMARY KEY NOT NULL,
  telegram_url TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT ''
);
