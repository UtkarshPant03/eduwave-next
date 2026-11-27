-- 0001_integrity: database-level integrity for academic records.
-- Safe on existing data: adds columns/constraints/indexes/triggers; drops and re-creates
-- some foreign keys with stricter ON DELETE rules; deletes no rows.
-- If existing rows violate a new CHECK or FOREIGN KEY, the migration stops (nothing is
-- applied) and names the constraint. Fix the data and run it again (see docs/DATABASE.md).
CREATE TABLE "grade_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"grader_id" uuid NOT NULL,
	"old_grade" integer,
	"new_grade" integer NOT NULL,
	"feedback_changed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "answers" DROP CONSTRAINT "answers_question_id_questions_id_fk";
--> statement-breakpoint
ALTER TABLE "attempts" DROP CONSTRAINT "attempts_quiz_id_quizzes_id_fk";
--> statement-breakpoint
ALTER TABLE "attempts" DROP CONSTRAINT "attempts_student_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "submissions" DROP CONSTRAINT "submissions_assignment_id_assignments_id_fk";
--> statement-breakpoint
ALTER TABLE "submissions" DROP CONSTRAINT "submissions_student_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "assignments_course_id_index";--> statement-breakpoint
DROP INDEX "quizzes_course_id_index";--> statement-breakpoint
-- Existing answers get their quiz from their attempt before the column becomes NOT NULL.
ALTER TABLE "answers" ADD COLUMN "quiz_id" uuid;--> statement-breakpoint
UPDATE "answers" SET "quiz_id" = "attempts"."quiz_id" FROM "attempts" WHERE "attempts"."id" = "answers"."attempt_id";--> statement-breakpoint
ALTER TABLE "answers" ALTER COLUMN "quiz_id" SET NOT NULL;--> statement-breakpoint
-- UNIQUE (id, parent) pairs must exist before the composite foreign keys that reference them.
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_id_quiz_unique" UNIQUE("id","quiz_id");--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_id_course_unique" UNIQUE("id","course_id");--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_id_quiz_unique" UNIQUE("id","quiz_id");--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_id_course_unique" UNIQUE("id","course_id");--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "graded_by" uuid;--> statement-breakpoint
ALTER TABLE "grade_events" ADD CONSTRAINT "grade_events_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_events" ADD CONSTRAINT "grade_events_grader_id_users_id_fk" FOREIGN KEY ("grader_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grade_events_submission_id_created_at_index" ON "grade_events" USING btree ("submission_id","created_at");--> statement-breakpoint
CREATE INDEX "grade_events_grader_id_index" ON "grade_events" USING btree ("grader_id");--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_attempt_same_quiz_fk" FOREIGN KEY ("attempt_id","quiz_id") REFERENCES "public"."attempts"("id","quiz_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_same_quiz_fk" FOREIGN KEY ("question_id","quiz_id") REFERENCES "public"."questions"("id","quiz_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_section_same_course_fk" FOREIGN KEY ("section_id","course_id") REFERENCES "public"."sections"("id","course_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_section_same_course_fk" FOREIGN KEY ("section_id","course_id") REFERENCES "public"."sections"("id","course_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_section_same_course_fk" FOREIGN KEY ("section_id","course_id") REFERENCES "public"."sections"("id","course_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_section_same_course_fk" FOREIGN KEY ("section_id","course_id") REFERENCES "public"."sections"("id","course_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_file_same_course_fk" FOREIGN KEY ("file_id","course_id") REFERENCES "public"."files"("id","course_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_graded_by_users_id_fk" FOREIGN KEY ("graded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "answers_question_id_index" ON "answers" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "assignments_course_id_due_at_index" ON "assignments" USING btree ("course_id","due_at");--> statement-breakpoint
CREATE INDEX "assignments_section_id_index" ON "assignments" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "audit_log_action_created_at_index" ON "audit_log" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "files_course_id_index" ON "files" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "files_uploader_id_index" ON "files" USING btree ("uploader_id");--> statement-breakpoint
CREATE INDEX "live_sessions_section_id_index" ON "live_sessions" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE INDEX "posts_author_id_index" ON "posts" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "quizzes_course_id_deadline_index" ON "quizzes" USING btree ("course_id","deadline");--> statement-breakpoint
CREATE INDEX "quizzes_section_id_index" ON "quizzes" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "resources_section_id_index" ON "resources" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "resources_file_id_index" ON "resources" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "submissions_file_id_index" ON "submissions" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "submissions_ungraded_idx" ON "submissions" USING btree ("assignment_id","submitted_at") WHERE "submissions"."grade" is null;--> statement-breakpoint
CREATE INDEX "threads_author_id_index" ON "threads" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "threads_announcements_idx" ON "threads" USING btree ("course_id","created_at") WHERE "threads"."is_announcement";--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_selected_index_check" CHECK ("answers"."selected_index" between 0 and 5);--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_points_check" CHECK ("assignments"."max_points" > 0 and "assignments"."late_days" >= 0);--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_score_check" CHECK ("attempts"."score" is null or ("attempts"."score" >= 0 and "attempts"."score" <= "attempts"."total"));--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_finished_check" CHECK (("attempts"."submitted_at" is null) = ("attempts"."score" is null));--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_credits_check" CHECK ("courses"."credits" >= 0);--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_size_check" CHECK ("files"."size" >= 0);--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_duration_check" CHECK ("live_sessions"."duration_minutes" > 0);--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_options_check" CHECK (cardinality("questions"."options") between 2 and 6 and "questions"."correct_index" >= 0 and "questions"."correct_index" < cardinality("questions"."options"));--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_time_limit_check" CHECK ("quizzes"."time_limit_minutes" > 0);--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_url_xor_file_check" CHECK (num_nonnulls("resources"."url", "resources"."file_id") = 1);--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_grade_check" CHECK ("submissions"."grade" is null or "submissions"."grade" >= 0);
--> statement-breakpoint
-- ===================== cross-table rules (triggers) =====================
-- 1. Answers are frozen once their attempt has been scored.
CREATE FUNCTION eduwave_answers_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM attempts WHERE id = COALESCE(NEW.attempt_id, OLD.attempt_id) AND submitted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'answers of a submitted quiz attempt cannot change' USING ERRCODE = 'P0001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;--> statement-breakpoint
CREATE TRIGGER answers_frozen BEFORE INSERT OR UPDATE ON answers FOR EACH ROW EXECUTE FUNCTION eduwave_answers_frozen();--> statement-breakpoint
-- 2. Questions are frozen once any student has started the quiz (keeps every attempt's
--    layout, total and score consistent with the questions it was given).
CREATE FUNCTION eduwave_questions_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM attempts WHERE quiz_id = COALESCE(NEW.quiz_id, OLD.quiz_id)) THEN
    RAISE EXCEPTION 'questions cannot change after students have started the quiz' USING ERRCODE = 'P0001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;--> statement-breakpoint
CREATE TRIGGER questions_frozen BEFORE INSERT OR UPDATE OR DELETE ON questions FOR EACH ROW EXECUTE FUNCTION eduwave_questions_frozen();--> statement-breakpoint
-- 3. A grade can never exceed the assignment's maximum points...
CREATE FUNCTION eduwave_grade_within_max() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.grade IS NOT NULL AND NEW.grade > (SELECT max_points FROM assignments WHERE id = NEW.assignment_id) THEN
    RAISE EXCEPTION 'grade % exceeds the maximum points of the assignment', NEW.grade USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER submissions_grade_within_max BEFORE INSERT OR UPDATE OF grade, assignment_id ON submissions FOR EACH ROW EXECUTE FUNCTION eduwave_grade_within_max();--> statement-breakpoint
-- ...and the maximum can't be lowered below a grade already awarded.
CREATE FUNCTION eduwave_max_points_above_grades() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.max_points < (SELECT COALESCE(max(grade), 0) FROM submissions WHERE assignment_id = NEW.id) THEN
    RAISE EXCEPTION 'max points % is below a grade already awarded', NEW.max_points USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER assignments_max_points_above_grades BEFORE UPDATE OF max_points ON assignments FOR EACH ROW EXECUTE FUNCTION eduwave_max_points_above_grades();--> statement-breakpoint
-- 4. Audit log and grade history are append-only. A database administrator can run
--    retention deliberately with:  SET LOCAL eduwave.allow_history_maintenance = 'on';
CREATE FUNCTION eduwave_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('eduwave.allow_history_maintenance', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'P0001';
END $$;--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION eduwave_append_only();--> statement-breakpoint
CREATE TRIGGER grade_events_append_only BEFORE UPDATE OR DELETE ON grade_events FOR EACH ROW EXECUTE FUNCTION eduwave_append_only();
