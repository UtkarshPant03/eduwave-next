-- 0003_institution: academic structure, course staff and scoped roles (Phase 2).
-- Additive: new tables and two nullable columns on courses; back-fills from existing data; drops nothing.
-- Plan and rollback: docs/DATABASE.md ("0003_institution").
CREATE TYPE "public"."course_staff_role" AS ENUM('coordinator', 'instructor', 'teaching_assistant');--> statement-breakpoint
CREATE TYPE "public"."scoped_role" AS ENUM('department_admin', 'hod', 'dean');--> statement-breakpoint
CREATE TABLE "academic_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	CONSTRAINT "academic_sessions_name_unique" UNIQUE("name"),
	CONSTRAINT "academic_sessions_dates_check" CHECK ("academic_sessions"."ends_on" > "academic_sessions"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"programme_id" uuid NOT NULL,
	"intake_year" integer NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "batches_programmeId_intakeYear_unique" UNIQUE("programme_id","intake_year"),
	CONSTRAINT "batches_year_check" CHECK ("batches"."intake_year" between 1990 and 2200)
);
--> statement-breakpoint
CREATE TABLE "class_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "class_sections_batchId_name_unique" UNIQUE("batch_id","name")
);
--> statement-breakpoint
CREATE TABLE "course_sections" (
	"course_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	CONSTRAINT "course_sections_course_id_section_id_pk" PRIMARY KEY("course_id","section_id")
);
--> statement-breakpoint
CREATE TABLE "course_staff" (
	"course_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "course_staff_role" NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_staff_course_id_user_id_pk" PRIMARY KEY("course_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_code_unique" UNIQUE("code"),
	CONSTRAINT "departments_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "programmes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department_id" uuid NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"semesters" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programmes_departmentId_name_unique" UNIQUE("department_id","name"),
	CONSTRAINT "programmes_semesters_check" CHECK ("programmes"."semesters" between 1 and 16)
);
--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "scoped_role" NOT NULL,
	"department_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_assignments_userId_role_departmentId_unique" UNIQUE("user_id","role","department_id")
);
--> statement-breakpoint
CREATE TABLE "student_sections" (
	"student_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_sections_student_id_term_id_pk" PRIMARY KEY("student_id","term_id")
);
--> statement-breakpoint
CREATE TABLE "terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	CONSTRAINT "terms_sessionId_name_unique" UNIQUE("session_id","name"),
	CONSTRAINT "terms_dates_check" CHECK ("terms"."ends_on" > "terms"."starts_on")
);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "department_id" uuid;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "term_id" uuid;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_programme_id_programmes_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."programmes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sections" ADD CONSTRAINT "class_sections_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_sections" ADD CONSTRAINT "course_sections_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_sections" ADD CONSTRAINT "course_sections_section_id_class_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."class_sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_staff" ADD CONSTRAINT "course_staff_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_staff" ADD CONSTRAINT "course_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programmes" ADD CONSTRAINT "programmes_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_sections" ADD CONSTRAINT "student_sections_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_sections" ADD CONSTRAINT "student_sections_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_sections" ADD CONSTRAINT "student_sections_section_id_class_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."class_sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_session_id_academic_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_sections_section_id_index" ON "course_sections" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "course_staff_user_id_index" ON "course_staff" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "role_assignments_department_id_index" ON "role_assignments" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "student_sections_section_id_term_id_index" ON "student_sections" USING btree ("section_id","term_id");--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "courses_department_id_index" ON "courses" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "courses_term_id_index" ON "courses" USING btree ("term_id");--> statement-breakpoint
-- ===================== back-fill from existing data (no row removed) =====================
-- Departments from the free-text department names already on courses; courses linked to them.
INSERT INTO "departments" ("name") SELECT DISTINCT "department" FROM "courses" WHERE btrim("department") <> '' ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
UPDATE "courses" c SET "department_id" = d."id" FROM "departments" d WHERE d."name" = c."department" AND c."department_id" IS NULL;--> statement-breakpoint
-- Every course's primary instructor becomes course staff.
INSERT INTO "course_staff" ("course_id", "user_id", "role") SELECT "id", "instructor_id", 'instructor' FROM "courses" ON CONFLICT DO NOTHING;--> statement-breakpoint
-- ===================== integrity rules spanning tables =====================
-- People in each relationship must have the right kind of account.
CREATE FUNCTION eduwave_require_persona() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  uid uuid;
  persona text;
BEGIN
  -- Separate branches: PL/pgSQL plans each statement on its own, so a branch that names
  -- a column this table doesn't have is never evaluated.
  IF TG_TABLE_NAME = 'student_sections' THEN
    uid := NEW.student_id;
  ELSE
    uid := NEW.user_id;
  END IF;
  SELECT role::text INTO persona FROM users WHERE id = uid;
  IF (TG_TABLE_NAME = 'student_sections' AND persona <> 'student')
     OR (TG_TABLE_NAME = 'course_staff' AND persona <> 'instructor')
     OR (TG_TABLE_NAME = 'role_assignments' AND persona NOT IN ('instructor', 'admin')) THEN
    RAISE EXCEPTION '% requires a different kind of account (this user is %)', TG_TABLE_NAME, persona USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER student_sections_persona BEFORE INSERT OR UPDATE ON student_sections FOR EACH ROW EXECUTE FUNCTION eduwave_require_persona();--> statement-breakpoint
CREATE TRIGGER course_staff_persona BEFORE INSERT OR UPDATE ON course_staff FOR EACH ROW EXECUTE FUNCTION eduwave_require_persona();--> statement-breakpoint
CREATE TRIGGER role_assignments_persona BEFORE INSERT OR UPDATE ON role_assignments FOR EACH ROW EXECUTE FUNCTION eduwave_require_persona();--> statement-breakpoint
-- The primary instructor (courses.instructor_id) is always listed as course staff...
CREATE FUNCTION eduwave_sync_primary_instructor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO course_staff (course_id, user_id, role) VALUES (NEW.id, NEW.instructor_id, 'instructor')
  ON CONFLICT (course_id, user_id) DO NOTHING;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER courses_primary_instructor_staff AFTER INSERT OR UPDATE OF instructor_id ON courses FOR EACH ROW EXECUTE FUNCTION eduwave_sync_primary_instructor();--> statement-breakpoint
-- ...and can't be removed from it (reassign the primary instructor first).
CREATE FUNCTION eduwave_keep_primary_instructor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM courses WHERE id = OLD.course_id AND instructor_id = OLD.user_id) THEN
    RAISE EXCEPTION 'the primary instructor must stay on the course staff' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END $$;--> statement-breakpoint
CREATE TRIGGER course_staff_keep_primary BEFORE DELETE ON course_staff FOR EACH ROW EXECUTE FUNCTION eduwave_keep_primary_instructor();
