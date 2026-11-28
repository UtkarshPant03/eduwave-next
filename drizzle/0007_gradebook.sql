-- 0007_gradebook: total method, weighted categories, grade scale as data, overrides with
-- append-only history, grade release (Phase 3, 4.6). Additive: existing courses keep the
-- points total, get today's 10-point scale as data, and every item stays released, so
-- every existing number, letter and GPA is unchanged. Plan and rollback: docs/DATABASE.md.
CREATE TYPE "public"."grade_total_method" AS ENUM('points', 'weighted');--> statement-breakpoint
CREATE TABLE "grade_bands" (
	"course_id" uuid NOT NULL,
	"letter" text NOT NULL,
	"label" text NOT NULL,
	"min_percent" integer NOT NULL,
	"points" double precision NOT NULL,
	CONSTRAINT "grade_bands_course_id_letter_pk" PRIMARY KEY("course_id","letter"),
	CONSTRAINT "grade_bands_min_check" CHECK ("grade_bands"."min_percent" between 0 and 100),
	CONSTRAINT "grade_bands_points_check" CHECK ("grade_bands"."points" >= 0 and "grade_bands"."points" <= 100),
	CONSTRAINT "grade_bands_letter_check" CHECK (length(btrim("grade_bands"."letter")) between 1 and 8),
	CONSTRAINT "grade_bands_label_check" CHECK (length("grade_bands"."label") <= 40)
);
--> statement-breakpoint
CREATE TABLE "grade_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"name" text NOT NULL,
	"weight" double precision DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grade_categories_courseId_name_unique" UNIQUE("course_id","name"),
	CONSTRAINT "grade_categories_id_course_unique" UNIQUE("id","course_id"),
	CONSTRAINT "grade_categories_weight_check" CHECK ("grade_categories"."weight" >= 0 and "grade_categories"."weight" <= 100),
	CONSTRAINT "grade_categories_name_check" CHECK (length(btrim("grade_categories"."name")) between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "grade_override_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"override_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"assignment_id" uuid,
	"quiz_id" uuid,
	"old_points" double precision,
	"new_points" double precision,
	"old_percent" double precision,
	"new_percent" double precision,
	"old_letter" text,
	"new_letter" text,
	"reason" text NOT NULL,
	"changed_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grade_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"assignment_id" uuid,
	"quiz_id" uuid,
	"points" double precision,
	"percent" double precision,
	"letter" text,
	"reason" text NOT NULL,
	"set_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grade_overrides_target_unique" UNIQUE NULLS NOT DISTINCT("course_id","student_id","assignment_id","quiz_id"),
	CONSTRAINT "grade_overrides_target_check" CHECK (num_nonnulls("grade_overrides"."assignment_id", "grade_overrides"."quiz_id") <= 1),
	CONSTRAINT "grade_overrides_value_check" CHECK (case when "grade_overrides"."assignment_id" is null and "grade_overrides"."quiz_id" is null
        then "grade_overrides"."points" is null and ("grade_overrides"."percent" is null or ("grade_overrides"."percent" >= 0 and "grade_overrides"."percent" <= 100))
        else "grade_overrides"."percent" is null and "grade_overrides"."letter" is null and ("grade_overrides"."points" is null or "grade_overrides"."points" >= 0) end),
	CONSTRAINT "grade_overrides_reason_check" CHECK (length(btrim("grade_overrides"."reason")) between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "grade_category_id" uuid;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "grades_released" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "grade_total_method" "grade_total_method" DEFAULT 'points' NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "grade_category_id" uuid;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "grades_released" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "grade_bands" ADD CONSTRAINT "grade_bands_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_categories" ADD CONSTRAINT "grade_categories_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_override_events" ADD CONSTRAINT "grade_override_events_override_id_grade_overrides_id_fk" FOREIGN KEY ("override_id") REFERENCES "public"."grade_overrides"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_override_events" ADD CONSTRAINT "grade_override_events_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_overrides" ADD CONSTRAINT "grade_overrides_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_overrides" ADD CONSTRAINT "grade_overrides_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_overrides" ADD CONSTRAINT "grade_overrides_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- UNIQUE (id, course_id) must exist before the composite FKs that reference it.
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_id_course_unique" UNIQUE("id","course_id");--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_id_course_unique" UNIQUE("id","course_id");--> statement-breakpoint
ALTER TABLE "grade_overrides" ADD CONSTRAINT "grade_overrides_assignment_same_course_fk" FOREIGN KEY ("assignment_id","course_id") REFERENCES "public"."assignments"("id","course_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_overrides" ADD CONSTRAINT "grade_overrides_quiz_same_course_fk" FOREIGN KEY ("quiz_id","course_id") REFERENCES "public"."quizzes"("id","course_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_overrides" ADD CONSTRAINT "grade_overrides_letter_in_scale_fk" FOREIGN KEY ("course_id","letter") REFERENCES "public"."grade_bands"("course_id","letter") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grade_override_events_course_id_created_at_index" ON "grade_override_events" USING btree ("course_id","created_at");--> statement-breakpoint
CREATE INDEX "grade_override_events_override_id_index" ON "grade_override_events" USING btree ("override_id");--> statement-breakpoint
CREATE INDEX "grade_overrides_student_id_index" ON "grade_overrides" USING btree ("student_id");--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_grade_category_id_grade_categories_id_fk" FOREIGN KEY ("grade_category_id") REFERENCES "public"."grade_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_grade_category_same_course_fk" FOREIGN KEY ("grade_category_id","course_id") REFERENCES "public"."grade_categories"("id","course_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_grade_category_id_grade_categories_id_fk" FOREIGN KEY ("grade_category_id") REFERENCES "public"."grade_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_grade_category_same_course_fk" FOREIGN KEY ("grade_category_id","course_id") REFERENCES "public"."grade_categories"("id","course_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Back-fill: every existing course gets today's 10-point scale as data (the same bands as
-- DEFAULT_GRADE_SCALE in src/lib/grading.ts), so its letters and GPA points don't change.
INSERT INTO grade_bands (course_id, letter, label, min_percent, points)
SELECT c.id, b.letter, b.label, b.min_percent, b.points
FROM courses c CROSS JOIN (VALUES
  ('O', 'Outstanding', 90, 10), ('A+', 'Excellent', 80, 9), ('A', 'Very good', 70, 8), ('B+', 'Good', 60, 7),
  ('B', 'Above average', 50, 6), ('C', 'Average', 45, 5), ('P', 'Pass', 40, 4), ('F', 'Fail', 0, 0)
) AS b(letter, label, min_percent, points);--> statement-breakpoint
-- Every new course starts with the same default scale (staff may change it per course).
CREATE FUNCTION eduwave_default_grade_scale() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO grade_bands (course_id, letter, label, min_percent, points)
  SELECT NEW.id, b.letter, b.label, b.min_percent, b.points
  FROM (VALUES
    ('O', 'Outstanding', 90, 10), ('A+', 'Excellent', 80, 9), ('A', 'Very good', 70, 8), ('B+', 'Good', 60, 7),
    ('B', 'Above average', 50, 6), ('C', 'Average', 45, 5), ('P', 'Pass', 40, 4), ('F', 'Fail', 0, 0)
  ) AS b(letter, label, min_percent, points);
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER courses_default_grade_scale AFTER INSERT ON courses FOR EACH ROW EXECUTE FUNCTION eduwave_default_grade_scale();--> statement-breakpoint
-- Overrides: the target never changes after creation, the student is enrolled, and an
-- assignment override stays within the assignment's maximum points.
CREATE FUNCTION eduwave_grade_override_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.course_id, NEW.student_id, NEW.assignment_id, NEW.quiz_id)
     IS DISTINCT FROM (OLD.course_id, OLD.student_id, OLD.assignment_id, OLD.quiz_id) THEN
    RAISE EXCEPTION 'an override''s course, student and item can''t change' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'INSERT' AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = NEW.course_id AND e.user_id = NEW.student_id) THEN
    RAISE EXCEPTION 'student is not enrolled in this course' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.assignment_id IS NOT NULL AND NEW.points > (SELECT max_points FROM assignments WHERE id = NEW.assignment_id) THEN
    RAISE EXCEPTION 'override points % are above the assignment''s maximum', NEW.points USING ERRCODE = 'P0001';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER grade_overrides_rules BEFORE INSERT OR UPDATE ON grade_overrides FOR EACH ROW EXECUTE FUNCTION eduwave_grade_override_rules();--> statement-breakpoint
-- Every override, change and removal is written to the history by the database itself.
CREATE FUNCTION eduwave_grade_override_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.points IS NOT DISTINCT FROM OLD.points AND NEW.percent IS NOT DISTINCT FROM OLD.percent
     AND NEW.letter IS NOT DISTINCT FROM OLD.letter AND NEW.reason IS NOT DISTINCT FROM OLD.reason THEN
    RETURN NEW;
  END IF;
  INSERT INTO grade_override_events (override_id, course_id, student_id, assignment_id, quiz_id,
    old_points, new_points, old_percent, new_percent, old_letter, new_letter, reason, changed_by)
  VALUES (NEW.id, NEW.course_id, NEW.student_id, NEW.assignment_id, NEW.quiz_id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.points END, NEW.points,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.percent END, NEW.percent,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.letter END, NEW.letter,
    NEW.reason, NEW.set_by);
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER grade_overrides_history AFTER INSERT OR UPDATE ON grade_overrides FOR EACH ROW EXECUTE FUNCTION eduwave_grade_override_history();--> statement-breakpoint
-- History is append-only (same rule and maintenance switch as the audit log).
CREATE TRIGGER grade_override_events_append_only BEFORE UPDATE OR DELETE ON grade_override_events FOR EACH ROW EXECUTE FUNCTION eduwave_append_only();--> statement-breakpoint
-- An assignment's maximum can't drop below an override already given (as for grades).
CREATE OR REPLACE FUNCTION eduwave_max_points_above_grades() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.max_points < GREATEST(
    (SELECT COALESCE(max(grade), 0) FROM submissions WHERE assignment_id = NEW.id),
    (SELECT COALESCE(max(points), 0) FROM grade_overrides WHERE assignment_id = NEW.id)
  ) THEN
    RAISE EXCEPTION 'max points % is below a grade already awarded', NEW.max_points USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
