SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- The SET NAMES line above is REQUIRED and must stay first.
--
-- Every table in this schema is declared COLLATE=utf8mb4_unicode_ci, but
-- MySQL 8 defaults a new connection to utf8mb4_0900_ai_ci. Any comparison
-- between a string literal and a column then raises ERROR 1267 (illegal mix
-- of collations). Pinning the session collation here keeps this file, and
-- every file after it, consistent with the tables.
--
-- This particular file creates a table and compares nothing, so the line is
-- not strictly load-bearing here -- it is present so that every migration
-- from 009 onward opens identically and none is left to chance.
-- ---------------------------------------------------------------------

-- =====================================================================
-- Migration: 010_internal_marks
--
-- Creates one table:
--   internal_marks - the consolidated internal mark of a student in a course,
--                    with its component breakdown where one exists
--
-- NO SEED DATA. The table is left EMPTY. Sample rows are inserted by
-- 011_seed_internal_marks.sql, which is a TEST seed and is skipped in a
-- production install.
--
--
-- WHY THIS IS STORED AND NOT COMPUTED
--   For a Theory or Theory & Lab course whose assessments are all entered,
--   the internal mark IS derivable: scale PT1 and PT2 onto the nature's
--   pt1_max / pt2_max, add the IP components, round. So why store it?
--
--   1. Not every course has assessment rows. Mini Project I has NO component
--      breakdown in the source at all -- the workbook records a single total
--      and nothing else. There is nothing to derive it from.
--   2. The institution-wide risk report covers courses whose marks live in
--      other systems, or which have not been entered here yet. It needs one
--      uniform source for every course, not a mix of derived and absent.
--   3. `total` is NOT always exactly pt1 + pt2 + ip. The source rounds it,
--      and the rounded figure is the one that goes on the record. Recomputing
--      would silently disagree with the printed sheet.
--
--   The cost is real and worth stating plainly: for a course whose
--   assessments ARE fully entered, this table holds a SECOND copy of a figure
--   that could be computed, and the two can drift apart. Whichever screen
--   writes marks must keep them in step, or the risk report and the internal
--   mark sheet will disagree. This is a denormalisation accepted for the
--   reason above, not an oversight.
--
--
-- WHAT THE COMPONENT COLUMNS HOLD
--   SCALED marks, already converted onto the course nature's mark scale --
--   not the raw assessment totals. For Theory & Lab (pt1_max 15, ip_max 20):
--     a PT1 total of 42/50 is stored as 12.60   (42 / 50 * 15)
--     IP1 9 + IP2 8 out of 20                   is stored as 17.00
--     total = round(12.60 + 13.20 + 17.00) = 43
--   All three are NULLABLE because Mini Project I supplies none of them.
--   `total` is nullable too: a course file is routinely saved before the
--   internal mark has been consolidated, and 0 would read as "scored zero".
--
--
-- !! EDITING co_split_values LEAVES STORED MARKS STALE !!
--   The write endpoint derives the per-CO marks of a 'lookup' assessment from
--   co_split_values and PERSISTS them into student_co_marks, then recomputes
--   the internal_marks row below from those same assessment totals. Both are a
--   snapshot of the lookup as it stood when the mark was saved.
--
--   If co_split_values is ever corrected, nothing recomputes them: the stored
--   per-CO marks, and any attainment read from them, silently go stale. A
--   change to that table needs a deliberate recompute pass -- re-save every
--   affected assessment through PUT /api/assessments/:id/marks. No migration
--   does it for you.
--
-- NOTE ON THE NULLABLE COLUMNS IN THE UNIQUE KEY
--   academic_year and semester are NULLABLE and sit inside the unique key,
--   matching `attendance` and `student_enrolments`, because an internal mark
--   belongs to one OFFERING of a course rather than to the course forever.
--   In MySQL a UNIQUE key does not block duplicates when one of its columns
--   is NULL, so 011 guards its insert with the NULL-safe NOT EXISTS / <=>
--   form rather than relying on the key.
--
--
-- Depends on: 003_students_and_courses.sql (student_id -> students.id,
--                                           course_id  -> courses.id)
--
-- This file is safely re-runnable: the table uses CREATE TABLE IF NOT EXISTS.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Table: internal_marks
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `internal_marks` (
  `id`             INT          NOT NULL AUTO_INCREMENT,
  `student_id`     INT          NOT NULL,
  `course_id`      INT          NOT NULL,
  `pt1`            DECIMAL(6,2) NULL,
  `pt2`            DECIMAL(6,2) NULL,
  `ip`             DECIMAL(6,2) NULL,
  `total`          DECIMAL(6,2) NULL,
  `academic_year`  VARCHAR(20)  NULL,
  `semester`       VARCHAR(10)  NULL,
  `created_at`     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_internal_marks`
    (`student_id`, `course_id`, `academic_year`, `semester`),
  KEY `idx_internal_marks_course` (`course_id`),
  CONSTRAINT `fk_internal_marks_student`
    FOREIGN KEY (`student_id`) REFERENCES `students` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_internal_marks_course`
    FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- End of migration 010
-- =====================================================================
