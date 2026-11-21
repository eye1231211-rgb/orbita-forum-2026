import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';

export const students = sqliteTable('students', {
  id: text('id').primaryKey(), login: text('login').notNull().unique(),
  firstName: text('first_name').notNull(), lastName: text('last_name').notNull(), middleName: text('middle_name').notNull(),
  institute: text('institute').notNull(), program: text('program').notNull(),
  course: integer('course').notNull(), group: text('group_name').notNull(), semester: integer('semester').notNull()
});
export const credentials = sqliteTable('credentials', {
  studentId: text('student_id').primaryKey().references(()=>students.id), passwordHash:text('password_hash').notNull()
});
export const sessions = sqliteTable('sessions', {
  tokenHash:text('token_hash').primaryKey(), studentId:text('student_id').notNull().references(()=>students.id), expiresAt:text('expires_at').notNull()
},t=>[index('session_owner').on(t.studentId),index('session_expiry').on(t.expiresAt)]);
export const disciplines = sqliteTable('disciplines', {
  id:text('id').primaryKey(),studentId:text('student_id').notNull().references(()=>students.id),name:text('name').notNull(),credits:integer('credits').notNull()
},t=>[index('discipline_owner').on(t.studentId)]);
export const lessons = sqliteTable('lessons', {
  id:text('id').primaryKey(),studentId:text('student_id').notNull().references(()=>students.id),disciplineId:text('discipline_id').notNull().references(()=>disciplines.id),
  date:text('date').notNull(),start:text('start').notNull(),end:text('end').notNull(),room:text('room').notNull(),teacher:text('teacher').notNull(),kind:text('kind').notNull(),status:text('status').notNull(),note:text('note').notNull(),oldRoom:text('old_room')
},t=>[index('lesson_owner_date').on(t.studentId,t.date,t.start)]);
export const results = sqliteTable('results', {
  id:text('id').primaryKey(),studentId:text('student_id').notNull().references(()=>students.id),disciplineId:text('discipline_id').notNull().references(()=>disciplines.id),result:text('result'),status:text('status').notNull(),updatedAt:text('updated_at'),nextDate:text('next_date'),nextKind:text('next_kind')
},t=>[index('result_owner').on(t.studentId)]);
export const requests = sqliteTable('requests', {
  id:text('id').primaryKey(),studentId:text('student_id').notNull().references(()=>students.id),type:text('type').notNull(),message:text('message').notNull(),status:text('status').notNull(),createdAt:text('created_at').notNull(),idempotencyKey:text('idempotency_key').notNull()
},t=>[uniqueIndex('request_idempotency').on(t.studentId,t.idempotencyKey),index('request_owner_created').on(t.studentId,t.createdAt)]);
export const requestHistory = sqliteTable('request_history', {
  id:text('id').primaryKey(),requestId:text('request_id').notNull().references(()=>requests.id),studentId:text('student_id').notNull().references(()=>students.id),status:text('status').notNull(),at:text('at').notNull(),note:text('note').notNull()
},t=>[index('history_request_owner').on(t.studentId,t.requestId)]);
export const notifications = sqliteTable('notifications', {
  id:text('id').primaryKey(),studentId:text('student_id').notNull().references(()=>students.id),title:text('title').notNull(),text:text('text').notNull(),category:text('category').notNull(),date:text('date').notNull(),href:text('href')
},t=>[index('notification_owner').on(t.studentId,t.date)]);
export const notificationReads = sqliteTable('notification_reads', {
  studentId:text('student_id').notNull().references(()=>students.id),notificationId:text('notification_id').notNull().references(()=>notifications.id),readAt:text('read_at').notNull()
},t=>[primaryKey({columns:[t.studentId,t.notificationId]})]);
export const events = sqliteTable('events', {
  id:text('id').primaryKey(),studentId:text('student_id').notNull().references(()=>students.id),disciplineId:text('discipline_id').references(()=>disciplines.id),title:text('title').notNull(),date:text('date').notNull(),time:text('time').notNull(),note:text('note').notNull()
},t=>[index('event_owner_date').on(t.studentId,t.date)]);
export const loginLimits = sqliteTable('login_limits', {key:text('key').primaryKey(),count:integer('count').notNull(),expiresAt:text('expires_at').notNull()});
export const planMarks = sqliteTable('plan_marks', {
  studentId:text('student_id').notNull().references(()=>students.id),
  key:text('key').notNull(),done:integer('done',{mode:'boolean'}).notNull().default(false),updatedAt:text('updated_at').notNull()
},t=>[primaryKey({columns:[t.studentId,t.key]})]);

export const personalTasks = sqliteTable('personal_tasks', {
  id:text('id').notNull(),studentId:text('student_id').notNull().references(()=>students.id),
  title:text('title').notNull(),details:text('details').notNull().default(''),due:text('due').notNull().default(''),
  lessonId:text('lesson_id').notNull().default(''),lessonDate:text('lesson_date').notNull().default(''),
  done:integer('done').notNull().default(0), revision:integer('revision').notNull().default(1),createdAt:text('created_at').notNull()
},t=>[primaryKey({columns:[t.studentId,t.id]})]);
export const lessonHomework = sqliteTable('lesson_homework', {
  group:text('group_name').notNull(),lessonId:text('lesson_id').notNull(),assignment:text('assignment').notNull(),
  due:text('due').notNull().default(''),author:text('author').notNull(),sourceUrl:text('source_url').notNull().default('')
},t=>[primaryKey({columns:[t.group,t.lessonId]})]);
export const groupProfiles = sqliteTable('group_profiles', {
  group: text('group_name').primaryKey().notNull(),
  telegramUrl: text('telegram_url').notNull().default(''),
  note: text('note').notNull().default('')
});
