-- 0006_assignment_versions: several files per submission, read-only submission versions,
-- feedback files (Phase 3, 4.5.0). Additive and safe for existing data: assignments get
-- max_files = 1 (today's behaviour); every existing submission becomes version 1 with its
-- text and file. Grades, grade history, the grading queue and the gradebook read
-- `submissions` and are unchanged. Plan and rollback: docs/DATABASE.md.
CREATE TABLE "feedback_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_files_fileId_unique" UNIQUE("file_id")
);
--> statement-breakpoint
CREATE TABLE "submission_files" (
	"version_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "submission_files_version_id_file_id_pk" PRIMARY KEY("version_id","file_id"),
	CONSTRAINT "submission_files_position_check" CHECK ("submission_files"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "submission_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"text" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_versions_number_unique" UNIQUE("submission_id","version_number"),
	CONSTRAINT "submission_versions_number_check" CHECK ("submission_versions"."version_number" >= 1)
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "max_files" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback_files" ADD CONSTRAINT "feedback_files_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_files" ADD CONSTRAINT "feedback_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_files" ADD CONSTRAINT "feedback_files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_version_id_submission_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."submission_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_versions" ADD CONSTRAINT "submission_versions_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_files_submission_id_index" ON "feedback_files" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "submission_files_file_id_index" ON "submission_files" USING btree ("file_id");--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_max_files_check" CHECK ("assignments"."max_files" between 1 and 20);--> statement-breakpoint
-- 1. Back-fill: each existing submission becomes version 1 (its text, time and single file).
--    Done before the triggers below exist, so legacy rows are copied exactly as they are.
INSERT INTO "submission_versions" ("submission_id", "version_number", "text", "submitted_at")
SELECT "id", 1, "text", "submitted_at" FROM "submissions";--> statement-breakpoint
INSERT INTO "submission_files" ("version_id", "file_id", "position")
SELECT v."id", s."file_id", 0
FROM "submissions" s JOIN "submission_versions" v ON v."submission_id" = s."id"
WHERE s."file_id" IS NOT NULL;--> statement-breakpoint
-- 2. Versions and their file links are read-only history.
CREATE TRIGGER submission_versions_append_only BEFORE UPDATE OR DELETE ON submission_versions FOR EACH ROW EXECUTE FUNCTION eduwave_append_only();--> statement-breakpoint
CREATE TRIGGER submission_files_append_only BEFORE UPDATE OR DELETE ON submission_files FOR EACH ROW EXECUTE FUNCTION eduwave_append_only();--> statement-breakpoint
-- 3. A graded submission accepts no new version; version numbers are consecutive.
CREATE FUNCTION eduwave_submission_version_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM submissions WHERE id = NEW.submission_id AND grade IS NOT NULL) THEN
    RAISE EXCEPTION 'this submission has been graded and accepts no new versions' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.version_number <> (SELECT COALESCE(max(version_number), 0) + 1 FROM submission_versions WHERE submission_id = NEW.submission_id) THEN
    RAISE EXCEPTION 'version numbers must be consecutive' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER submission_versions_rules BEFORE INSERT ON submission_versions FOR EACH ROW EXECUTE FUNCTION eduwave_submission_version_rules();--> statement-breakpoint
-- 4. A version's files belong to the assignment's course, were uploaded by the submitting
--    student, and number at most the assignment's max_files (checked when written).
CREATE FUNCTION eduwave_submission_file_rules() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_course uuid;
  v_student uuid;
  v_max integer;
BEGIN
  SELECT a.course_id, s.student_id, a.max_files INTO v_course, v_student, v_max
  FROM submission_versions v
  JOIN submissions s ON s.id = v.submission_id
  JOIN assignments a ON a.id = s.assignment_id
  WHERE v.id = NEW.version_id;
  IF NOT EXISTS (SELECT 1 FROM files f WHERE f.id = NEW.file_id AND f.course_id = v_course AND f.uploader_id = v_student) THEN
    RAISE EXCEPTION 'a submission file must be uploaded by the student to the same course' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM submission_files WHERE version_id = NEW.version_id) >= v_max THEN
    RAISE EXCEPTION 'this assignment accepts at most % file(s) per submission', v_max USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER submission_files_rules BEFORE INSERT ON submission_files FOR EACH ROW EXECUTE FUNCTION eduwave_submission_file_rules();--> statement-breakpoint
-- 5. A feedback file belongs to the submission's course.
CREATE FUNCTION eduwave_feedback_file_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id
    JOIN files f ON f.id = NEW.file_id AND f.course_id = a.course_id
    WHERE s.id = NEW.submission_id
  ) THEN
    RAISE EXCEPTION 'a feedback file must belong to the submission''s course' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER feedback_files_rules BEFORE INSERT OR UPDATE ON feedback_files FOR EACH ROW EXECUTE FUNCTION eduwave_feedback_file_rules();
