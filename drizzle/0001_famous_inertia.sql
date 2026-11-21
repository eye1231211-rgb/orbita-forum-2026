CREATE TABLE `plan_marks` (
	`student_id` text NOT NULL,
	`key` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`student_id`, `key`),
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
