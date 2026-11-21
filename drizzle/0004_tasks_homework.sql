CREATE TABLE personal_tasks (
 id TEXT NOT NULL, student_id TEXT NOT NULL REFERENCES students(id),
 title TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', due TEXT NOT NULL DEFAULT '',
 lesson_id TEXT NOT NULL DEFAULT '', lesson_date TEXT NOT NULL DEFAULT '',
 done INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, PRIMARY KEY(student_id,id)
);
CREATE TABLE lesson_homework (
 group_name TEXT NOT NULL, lesson_id TEXT NOT NULL, assignment TEXT NOT NULL,
 due TEXT NOT NULL DEFAULT '', author TEXT NOT NULL, source_url TEXT NOT NULL DEFAULT '',
 PRIMARY KEY(group_name,lesson_id)
);
