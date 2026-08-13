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
-- It IS load-bearing in this file: the guards below compare COLUMN_NAME and
-- TABLE_NAME from information_schema against string literals.
-- ---------------------------------------------------------------------

-- =====================================================================
-- Migration: 012_course_meta_and_closing
--
-- Two changes:
--   1. Six NULLable descriptive columns on `courses`, so the cover sheet
--      reads its programme / batch / academic year / year of study /
--      semester / section from the course record instead of from constants
--      hardcoded in the frontend.
--   2. A new table `closing_report_actions`, one row per numbered action
--      line of the course-file closing report.
--
-- NO SEED DATA. Both are left empty. Every existing course keeps NULL in
-- all six new columns, and every screen that reads them must render a
-- placeholder rather than a blank -- see the note on NULL below.
--
--
-- WHY ALL SIX COLUMNS ARE NULLABLE
--   They describe one OFFERING of a course (B.E. CSE, batch 2022-2026,
--   section A, ...) rather than the course itself, and no such record
--   exists for any row already in the table. A NOT NULL column would need a
--   default, and every default here would be a guess presented as a fact:
--   an invented batch on a printed cover sheet is worse than a visible gap.
--   NULL means "not recorded yet" and is the honest state until somebody
--   fills the cover page in.
--
--   `semester` and `year_of_study` are VARCHAR, not integers. The source
--   sheets record them as text ("V", "III Year", "2025-2026 Odd"), and
--   coercing that to a number would lose what was written.
--
--
-- WHY THE ALTERs ARE GUARDED
--   MySQL has no ADD COLUMN IF NOT EXISTS. Re-running an unguarded ALTER
--   raises ERROR 1060 (duplicate column name) and aborts the rest of the
--   file, so a half-applied migration could not be finished by simply
--   running it again. Each ALTER below is therefore built as a string, and
--   replaced by the no-op `DO 0` when information_schema says the column is
--   already there. The whole file is safe to run any number of times.
--
--   The guards read DATABASE(), so they only ever see the schema the file
--   is being applied to.
--
--
-- WHY closing_report_actions IS A TABLE AND NOT THREE COLUMNS ON courses
--   The report prints a numbered list, and the number of lines is a
--   property of the form, not of the schema. `seq` carries that number, so
--   a fourth action needs a row rather than a migration. UNIQUE(course_id,
--   seq) is what makes the write endpoint an upsert: saving the report
--   twice updates line 2 rather than adding a second line 2.
--
--   `statement` is NULLABLE so a course can have a line 3 that is still
--   blank without that being confused with a line 3 that was never opened.
--
--   ON DELETE CASCADE: the actions are part of one course's closing report
--   and mean nothing without it. Neither column is nullable, so unlike
--   `attendance` and `student_enrolments` the unique key here really does
--   prevent duplicates, and an upsert can rely on it.
--
--
-- Depends on: 003_students_and_courses.sql (courses)
--
-- This file is safely re-runnable.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. courses.programme
-- ---------------------------------------------------------------------
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME   = 'courses'
                   AND COLUMN_NAME  = 'programme');
SET @ddl := IF(@exists = 0,
  'ALTER TABLE `courses` ADD COLUMN `programme` VARCHAR(120) NULL AFTER `department`',
  'DO 0');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- ---------------------------------------------------------------------
-- 2. courses.batch
-- ---------------------------------------------------------------------
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME   = 'courses'
                   AND COLUMN_NAME  = 'batch');
SET @ddl := IF(@exists = 0,
  'ALTER TABLE `courses` ADD COLUMN `batch` VARCHAR(20) NULL AFTER `programme`',
  'DO 0');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- ---------------------------------------------------------------------
-- 3. courses.academic_year
-- ---------------------------------------------------------------------
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME   = 'courses'
                   AND COLUMN_NAME  = 'academic_year');
SET @ddl := IF(@exists = 0,
  'ALTER TABLE `courses` ADD COLUMN `academic_year` VARCHAR(20) NULL AFTER `batch`',
  'DO 0');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- ---------------------------------------------------------------------
-- 4. courses.year_of_study
-- ---------------------------------------------------------------------
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME   = 'courses'
                   AND COLUMN_NAME  = 'year_of_study');
SET @ddl := IF(@exists = 0,
  'ALTER TABLE `courses` ADD COLUMN `year_of_study` VARCHAR(20) NULL AFTER `academic_year`',
  'DO 0');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- ---------------------------------------------------------------------
-- 5. courses.semester
-- ---------------------------------------------------------------------
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME   = 'courses'
                   AND COLUMN_NAME  = 'semester');
SET @ddl := IF(@exists = 0,
  'ALTER TABLE `courses` ADD COLUMN `semester` VARCHAR(10) NULL AFTER `year_of_study`',
  'DO 0');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- ---------------------------------------------------------------------
-- 6. courses.section
-- ---------------------------------------------------------------------
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME   = 'courses'
                   AND COLUMN_NAME  = 'section');
SET @ddl := IF(@exists = 0,
  'ALTER TABLE `courses` ADD COLUMN `section` VARCHAR(10) NULL AFTER `semester`',
  'DO 0');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- ---------------------------------------------------------------------
-- Table: closing_report_actions
--
-- One numbered action line of a course's closing report.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `closing_report_actions` (
  `id`         INT     NOT NULL AUTO_INCREMENT,
  `course_id`  INT     NOT NULL,
  `seq`        TINYINT NOT NULL,
  `statement`  TEXT    NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_closing_report_actions_course_seq` (`course_id`, `seq`),
  CONSTRAINT `fk_closing_report_actions_course`
    FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- End of migration 012
-- =====================================================================
