-- =====================================================================
-- Migration: 005_assessments_and_marks
--
-- Creates the four tables that hold every mark in the system:
--   1. assessments         - one row per assessment of a course
--                            (PT1 / PT2 / IP1 / IP2 / OT / SEE)
--   2. co_allocations      - how that assessment's maximum mark is divided
--                            across its COs
--   3. student_assessments - one row per student per assessment: the TOTAL
--                            mark, and whether the student was absent
--   4. student_co_marks    - the PER-CO breakdown of one student_assessments
--                            row
--
-- NO SEED DATA. All four tables are intentionally left EMPTY by this
-- migration. Sample rows are inserted later by 007_seed_sample_data.sql,
-- which is a TEST seed and is skipped in a production install.
--
--
-- WHAT `split_mode` MEANS
--   'lookup' - the per-CO marks are NOT entered. The faculty enters only
--              total_obtained, and the three per-question (per-CO) marks are
--              DERIVED from that total through the co_split_values lookup of
--              the pattern named by co_split_pattern_id. This is how the
--              periodical tests work: the source workbook fixes the exact
--              q1/q2/q3 split for every possible total.
--   'manual' - the faculty enters each CO mark directly. The lookup is not
--              consulted, co_split_pattern_id is NULL, and the total is the
--              sum of the entered per-CO marks. This is how the innovative
--              practices (IP) and the semester end exam (SEE) work.
--
--
-- WHY `is_absent` EXISTS
--   The source spreadsheets had NO absent handling at all -- an absent
--   student was simply left blank, which is indistinguishable from "not
--   entered yet" and silently counts as zero in an average. is_absent makes
--   the absence explicit, so an absent student can be excluded from CO
--   attainment instead of dragging it down as a zero. total_obtained is
--   NULLABLE for the same reason: an absent student has no mark, which is not
--   the same value as a mark of 0.
--
--
-- WHY TOTALS AND PER-CO MARKS LIVE IN SEPARATE TABLES
--   This split is deliberate, not normalisation for its own sake. Either side
--   can be the ENTERED value and the other the DERIVED one, and which is
--   which depends on split_mode:
--     - in 'lookup' mode the total is entered and the per-CO marks derived
--     - in 'manual' mode the per-CO marks are entered and the total derived
--   Keeping them in one table would force one of those two directions to be
--   stored as a redundant, hand-maintained copy of the other.
--
--
-- Depends on: 002_co_split_lookup.sql   (co_split_pattern_id -> co_split_patterns.id)
--             003_students_and_courses.sql (course_id -> courses.id,
--                                           student_id -> students.id)
--
-- This file is safely re-runnable: all four tables use
-- CREATE TABLE IF NOT EXISTS.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Table: assessments
--
-- UNIQUE (course_id, kind): a course has at most one PT1, one PT2, and so on.
-- This is also the natural key that 007 and the application use to find an
-- assessment without relying on its auto-increment id.
--
-- co_split_pattern_id is NULL for 'manual' assessments, and the foreign key
-- is ON DELETE SET NULL so that retiring a split pattern downgrades those
-- assessments rather than deleting their marks.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `assessments` (
  `id`                   INT          NOT NULL AUTO_INCREMENT,
  `course_id`            INT          NOT NULL,
  `kind`                 ENUM('PT1','PT2','IP1','IP2','OT','SEE') NOT NULL,
  `max_total`            DECIMAL(6,2) NOT NULL,
  `conducted_on`         DATE         NULL,
  `split_mode`           ENUM('lookup','manual') NOT NULL DEFAULT 'manual',
  `co_split_pattern_id`  INT          NULL,
  `created_at`           TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_assessments_course_kind` (`course_id`, `kind`),
  KEY `idx_assessments_split_pattern` (`co_split_pattern_id`),
  CONSTRAINT `fk_assessments_course`
    FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_assessments_split_pattern`
    FOREIGN KEY (`co_split_pattern_id`) REFERENCES `co_split_patterns` (`id`)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- Table: co_allocations
--
-- The mark budget of an assessment, per CO. The sum of marks_allocated for an
-- assessment is expected to equal assessments.max_total; that is an
-- application-level rule, not a database constraint, because a course file is
-- routinely saved half-entered.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `co_allocations` (
  `id`               INT          NOT NULL AUTO_INCREMENT,
  `assessment_id`    INT          NOT NULL,
  `co_number`        TINYINT      NOT NULL,
  `marks_allocated`  DECIMAL(6,2) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_co_allocations_assessment_co` (`assessment_id`, `co_number`),
  CONSTRAINT `fk_co_allocations_assessment`
    FOREIGN KEY (`assessment_id`) REFERENCES `assessments` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- Table: student_assessments
--
-- One row per student per assessment. A student who did not sit an optional
-- assessment has NO row; a student who sat it and was absent has a row with
-- is_absent = TRUE and total_obtained = NULL. The two states are different
-- and are stored differently.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `student_assessments` (
  `id`              INT          NOT NULL AUTO_INCREMENT,
  `assessment_id`   INT          NOT NULL,
  `student_id`      INT          NOT NULL,
  `total_obtained`  DECIMAL(6,2) NULL,
  `is_absent`       BOOLEAN      NOT NULL DEFAULT FALSE,
  `created_at`      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_student_assessments_assessment_student`
    (`assessment_id`, `student_id`),
  KEY `idx_student_assessments_student` (`student_id`),
  CONSTRAINT `fk_student_assessments_assessment`
    FOREIGN KEY (`assessment_id`) REFERENCES `assessments` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_student_assessments_student`
    FOREIGN KEY (`student_id`) REFERENCES `students` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- Table: student_co_marks
--
-- The per-CO breakdown of one student_assessments row.
--
-- Populated only for 'manual' assessments. For a 'lookup' assessment these
-- rows are absent by design: the breakdown is computed on demand from
-- total_obtained through co_split_values, so storing it here as well would
-- create a second copy that can drift.
--
-- It hangs off student_assessment_id rather than (assessment_id, student_id)
-- so that a per-CO mark cannot exist without the parent mark row, and so that
-- deleting a student's attempt removes its breakdown in one cascade.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `student_co_marks` (
  `id`                     INT          NOT NULL AUTO_INCREMENT,
  `student_assessment_id`  INT          NOT NULL,
  `co_number`              TINYINT      NOT NULL,
  `marks_obtained`         DECIMAL(6,2) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_student_co_marks_sa_co` (`student_assessment_id`, `co_number`),
  CONSTRAINT `fk_student_co_marks_student_assessment`
    FOREIGN KEY (`student_assessment_id`) REFERENCES `student_assessments` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- End of migration 005
-- =====================================================================
