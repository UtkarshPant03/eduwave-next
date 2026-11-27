-- 0002_completions_integrity: completion ticks always point at a real item of the same course.
-- Additive only (functions + triggers). No column changes; no existing row modified or deleted.
-- Plan and rollback: docs/DATABASE.md ("Plan for 0002_completions_integrity").

-- 1. A tick must name a resource or live session of the SAME course.
CREATE FUNCTION eduwave_completion_item_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM resources WHERE id = NEW.item_id AND course_id = NEW.course_id)
     AND NOT EXISTS (SELECT 1 FROM live_sessions WHERE id = NEW.item_id AND course_id = NEW.course_id) THEN
    RAISE EXCEPTION 'completion item % is not a resource or live session of course %', NEW.item_id, NEW.course_id USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER completions_item_valid BEFORE INSERT OR UPDATE ON completions FOR EACH ROW EXECUTE FUNCTION eduwave_completion_item_valid();--> statement-breakpoint
-- 2. Deleting an item (by any path) removes its ticks, so progress can never count ghosts.
CREATE FUNCTION eduwave_delete_item_completions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM completions WHERE item_id = OLD.id;
  RETURN OLD;
END $$;--> statement-breakpoint
CREATE TRIGGER resources_completions_cleanup AFTER DELETE ON resources FOR EACH ROW EXECUTE FUNCTION eduwave_delete_item_completions();--> statement-breakpoint
CREATE TRIGGER live_sessions_completions_cleanup AFTER DELETE ON live_sessions FOR EACH ROW EXECUTE FUNCTION eduwave_delete_item_completions();
