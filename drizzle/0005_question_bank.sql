-- 0005_question_bank: question bank (categories, bank questions), question types and points,
-- random slots, quiz open date, multiple attempts with a grading method (Phase 3, 4.4.0).
-- Additive and safe for existing data: new tables/enums; new columns are nullable or have
-- defaults that keep today's behaviour (single choice, 1 point, 1 attempt = attempt 1).
-- Replaced CHECKs accept every existing row. Plan and rollback: docs/DATABASE.md.
CREATE TYPE "public"."grading_method" AS ENUM('highest', 'average', 'first', 'last');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('single', 'multiple', 'true_false', 'short_answer', 'numerical');--> statement-breakpoint
CREATE TABLE "bank_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"type" "question_type" DEFAULT 'single' NOT NULL,
	"prompt" text NOT NULL,
	"options" text[] NOT NULL,
	"correct_index" integer,
	"correct_indexes" integer[],
	"accepted_answers" text[],
	"numeric_answer" double precision,
	"tolerance" double precision,
	"points" integer DEFAULT 1 NOT NULL,
	"explanation" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_questions_shape_check" CHECK (coalesce(case "bank_questions"."type"
      when 'single' then cardinality("bank_questions"."options") between 2 and 6 and "bank_questions"."correct_index" >= 0 and "bank_questions"."correct_index" < cardinality("bank_questions"."options")
      when 'true_false' then cardinality("bank_questions"."options") = 2 and "bank_questions"."correct_index" between 0 and 1
      when 'multiple' then cardinality("bank_questions"."options") between 2 and 6 and cardinality("bank_questions"."correct_indexes") between 1 and cardinality("bank_questions"."options")
        and 0 <= all("bank_questions"."correct_indexes") and cardinality("bank_questions"."options") > all("bank_questions"."correct_indexes")
      when 'short_answer' then cardinality("bank_questions"."options") = 0 and cardinality("bank_questions"."accepted_answers") between 1 and 20
      when 'numerical' then cardinality("bank_questions"."options") = 0 and "bank_questions"."numeric_answer" is not null and "bank_questions"."tolerance" >= 0
    end, false)),
	CONSTRAINT "bank_questions_points_check" CHECK ("bank_questions"."points" > 0)
);
--> statement-breakpoint
CREATE TABLE "question_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_categories_courseId_name_unique" UNIQUE("course_id","name"),
	CONSTRAINT "question_categories_id_course_unique" UNIQUE("id","course_id")
);
--> statement-breakpoint
CREATE TABLE "quiz_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"category_id" uuid NOT NULL,
	"category_name" text NOT NULL,
	"pick_count" integer NOT NULL,
	"points" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "quiz_slots_id_quiz_unique" UNIQUE("id","quiz_id"),
	CONSTRAINT "quiz_slots_values_check" CHECK ("quiz_slots"."pick_count" > 0 and "quiz_slots"."points" > 0)
);
--> statement-breakpoint
ALTER TABLE "attempts" DROP CONSTRAINT "attempts_quizId_studentId_unique";--> statement-breakpoint
ALTER TABLE "questions" DROP CONSTRAINT "questions_options_check";--> statement-breakpoint
ALTER TABLE "answers" ALTER COLUMN "selected_index" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ALTER COLUMN "correct_index" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "selected_indexes" integer[];--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "text_answer" text;--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "number_answer" double precision;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "attempt_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "type" "question_type" DEFAULT 'single' NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "correct_indexes" integer[];--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "accepted_answers" text[];--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "numeric_answer" double precision;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "tolerance" double precision;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "points" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "slot_id" uuid;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "bank_question_id" uuid;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "opens_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "max_attempts" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "grading_method" "grading_method" DEFAULT 'highest' NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_questions" ADD CONSTRAINT "bank_questions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_questions" ADD CONSTRAINT "bank_questions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_questions" ADD CONSTRAINT "bank_questions_category_same_course_fk" FOREIGN KEY ("category_id","course_id") REFERENCES "public"."question_categories"("id","course_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_categories" ADD CONSTRAINT "question_categories_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_slots" ADD CONSTRAINT "quiz_slots_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_questions_course_id_category_id_index" ON "bank_questions" USING btree ("course_id","category_id");--> statement-breakpoint
CREATE INDEX "quiz_slots_quiz_id_index" ON "quiz_slots" USING btree ("quiz_id");--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_slot_same_quiz_fk" FOREIGN KEY ("slot_id","quiz_id") REFERENCES "public"."quiz_slots"("id","quiz_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attempts_one_open_idx" ON "attempts" USING btree ("quiz_id","student_id") WHERE "attempts"."submitted_at" is null;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_quiz_student_number_unique" UNIQUE("quiz_id","student_id","attempt_number");--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_one_response_check" CHECK (num_nonnulls("answers"."selected_index", "answers"."selected_indexes", "answers"."text_answer", "answers"."number_answer") = 1);--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_selected_indexes_check" CHECK ("answers"."selected_indexes" is null or (cardinality("answers"."selected_indexes") <= 6 and 0 <= all("answers"."selected_indexes") and 5 >= all("answers"."selected_indexes")));--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_text_length_check" CHECK ("answers"."text_answer" is null or length("answers"."text_answer") <= 500);--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_number_check" CHECK ("attempts"."attempt_number" >= 1);--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_shape_check" CHECK (coalesce(case "questions"."type"
      when 'single' then cardinality("questions"."options") between 2 and 6 and "questions"."correct_index" >= 0 and "questions"."correct_index" < cardinality("questions"."options")
      when 'true_false' then cardinality("questions"."options") = 2 and "questions"."correct_index" between 0 and 1
      when 'multiple' then cardinality("questions"."options") between 2 and 6 and cardinality("questions"."correct_indexes") between 1 and cardinality("questions"."options")
        and 0 <= all("questions"."correct_indexes") and cardinality("questions"."options") > all("questions"."correct_indexes")
      when 'short_answer' then cardinality("questions"."options") = 0 and cardinality("questions"."accepted_answers") between 1 and 20
      when 'numerical' then cardinality("questions"."options") = 0 and "questions"."numeric_answer" is not null and "questions"."tolerance" >= 0
    end, false));--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_points_check" CHECK ("questions"."points" > 0);--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_attempts_check" CHECK ("quizzes"."max_attempts" between 1 and 10);--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_opens_check" CHECK ("quizzes"."opens_at" is null or "quizzes"."opens_at" < "quizzes"."deadline");
--> statement-breakpoint
-- ===================== cross-table rules (triggers) =====================
-- 1. Random slots are frozen together with the questions once anyone has started.
CREATE TRIGGER quiz_slots_frozen BEFORE INSERT OR UPDATE OR DELETE ON quiz_slots FOR EACH ROW EXECUTE FUNCTION eduwave_questions_frozen();--> statement-breakpoint
-- 2. Attempt numbers stay within the quiz's maximum, and nobody starts before the quiz opens.
CREATE FUNCTION eduwave_attempt_rules() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  q record;
BEGIN
  SELECT max_attempts, opens_at INTO q FROM quizzes WHERE id = NEW.quiz_id;
  IF NEW.attempt_number > q.max_attempts THEN
    RAISE EXCEPTION 'attempt % exceeds the maximum of % attempts for this quiz', NEW.attempt_number, q.max_attempts USING ERRCODE = 'P0001';
  END IF;
  IF q.opens_at IS NOT NULL AND NEW.started_at < q.opens_at THEN
    RAISE EXCEPTION 'this quiz has not opened yet' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER attempts_rules BEFORE INSERT ON attempts FOR EACH ROW EXECUTE FUNCTION eduwave_attempt_rules();--> statement-breakpoint
-- 3. The maximum number of attempts can't drop below an attempt number already used.
CREATE FUNCTION eduwave_max_attempts_used() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.max_attempts < (SELECT COALESCE(max(attempt_number), 0) FROM attempts WHERE quiz_id = NEW.id) THEN
    RAISE EXCEPTION 'max attempts % is below an attempt a student has already made', NEW.max_attempts USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER quizzes_max_attempts_used BEFORE UPDATE OF max_attempts ON quizzes FOR EACH ROW EXECUTE FUNCTION eduwave_max_attempts_used();--> statement-breakpoint
-- 4. An answer must be for a question this attempt was given (the layout lists them, random
--    picks included). Attempts from before 4.0 have no layout and are exempt.
CREATE FUNCTION eduwave_answer_in_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM attempts a
    WHERE a.id = NEW.attempt_id AND a.layout IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(a.layout -> 'questionOrder') e WHERE e = NEW.question_id::text)
  ) THEN
    RAISE EXCEPTION 'this question is not part of the attempt' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER answers_in_attempt BEFORE INSERT OR UPDATE OF question_id, attempt_id ON answers FOR EACH ROW EXECUTE FUNCTION eduwave_answer_in_attempt();