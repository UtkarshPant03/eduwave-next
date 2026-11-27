-- 0004_attendance: attendance sessions, records, append-only history and correction requests (Phase 3).
-- Additive: new tables, enums and triggers; no existing table altered. Plan and rollback: docs/DATABASE.md.
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'late', 'excused');--> statement-breakpoint
CREATE TYPE "public"."correction_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "attendance_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"requested_status" "attendance_status" NOT NULL,
	"reason" text NOT NULL,
	"status" "correction_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	CONSTRAINT "attendance_corrections_decision_check" CHECK (("attendance_corrections"."status" = 'pending') = ("attendance_corrections"."decided_at" is null))
);
--> statement-breakpoint
CREATE TABLE "attendance_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"old_status" "attendance_status",
	"new_status" "attendance_status" NOT NULL,
	"changed_by" uuid NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "attendance_status" NOT NULL,
	"marked_by" uuid NOT NULL,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	CONSTRAINT "attendance_records_session_id_student_id_pk" PRIMARY KEY("session_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "attendance_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"section_id" uuid,
	"live_session_id" uuid,
	"held_at" timestamp with time zone NOT NULL,
	"topic" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_settings" (
	"course_id" uuid PRIMARY KEY NOT NULL,
	"threshold_percent" integer,
	"late_credit_percent" integer DEFAULT 100 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_settings_threshold_check" CHECK ("attendance_settings"."threshold_percent" is null or "attendance_settings"."threshold_percent" between 0 and 100),
	CONSTRAINT "attendance_settings_late_check" CHECK ("attendance_settings"."late_credit_percent" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_session_id_attendance_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."attendance_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_session_id_attendance_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."attendance_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_attendance_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."attendance_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_marked_by_users_id_fk" FOREIGN KEY ("marked_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_section_id_class_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."class_sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_live_session_id_live_sessions_id_fk" FOREIGN KEY ("live_session_id") REFERENCES "public"."live_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_settings" ADD CONSTRAINT "attendance_settings_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_corrections_session_id_index" ON "attendance_corrections" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "attendance_corrections_student_id_index" ON "attendance_corrections" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_corrections_one_pending_idx" ON "attendance_corrections" USING btree ("session_id","student_id") WHERE "attendance_corrections"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "attendance_events_session_id_student_id_created_at_index" ON "attendance_events" USING btree ("session_id","student_id","created_at");--> statement-breakpoint
CREATE INDEX "attendance_records_student_id_index" ON "attendance_records" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "attendance_sessions_course_id_held_at_index" ON "attendance_sessions" USING btree ("course_id","held_at");--> statement-breakpoint
-- Only students enrolled in the session's course can be marked.
CREATE FUNCTION eduwave_attendance_enrolled() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM attendance_sessions s JOIN enrollments e ON e.course_id = s.course_id AND e.user_id = NEW.student_id
    WHERE s.id = NEW.session_id
  ) THEN
    RAISE EXCEPTION 'student is not enrolled in this course' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER attendance_records_enrolled BEFORE INSERT OR UPDATE OF student_id, session_id ON attendance_records FOR EACH ROW EXECUTE FUNCTION eduwave_attendance_enrolled();--> statement-breakpoint
-- Every mark and every change is written to the history, by the database itself.
CREATE FUNCTION eduwave_attendance_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO attendance_events (session_id, student_id, old_status, new_status, changed_by, reason)
    VALUES (NEW.session_id, NEW.student_id, NULL, NEW.status, NEW.marked_by, NEW.note);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO attendance_events (session_id, student_id, old_status, new_status, changed_by, reason)
    VALUES (NEW.session_id, NEW.student_id, OLD.status, NEW.status, NEW.marked_by, NEW.note);
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER attendance_records_history AFTER INSERT OR UPDATE ON attendance_records FOR EACH ROW EXECUTE FUNCTION eduwave_attendance_history();--> statement-breakpoint
-- History is append-only (same rule and maintenance switch as the audit log).
CREATE TRIGGER attendance_events_append_only BEFORE UPDATE OR DELETE ON attendance_events FOR EACH ROW EXECUTE FUNCTION eduwave_append_only();
