-- =====================================================================
-- Migration: 003_students_and_courses
--
-- Creates the two identity tables the rest of the schema hangs off:
--   1. students - one row per student (registration number is the natural key)
--   2. courses  - one row per course offering, tied to a course_natures row
--
-- NO SEED DATA.
--   Both tables are intentionally left EMPTY by this migration. They are
--   populated later from institutional data (student rolls and the course
--   list), not from anything hard-coded here.
--
-- Why co_target_percent lives on `courses`, with NO default:
--   The CO attainment target is per-course, not global -- the source templates
--   used 60 for Theory-with-lab courses and 55 for Theory courses. The column
--   therefore has deliberately NO DEFAULT: every course must declare its own
--   CO target, and an insert that omits the value fails loudly instead of
--   silently applying the wrong target.
--
-- Depends on: 001_course_natures_and_bands.sql (courses.nature_id references
--             course_natures.id)
--
-- This file is safely re-runnable: both tables use CREATE TABLE IF NOT EXISTS.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Table: students
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `students` (
  `id`           INT          NOT NULL AUTO_INCREMENT,
  `reg_number`   VARCHAR(20)  NOT NULL,
  `name`         VARCHAR(120) NOT NULL,
  `current_sem`  VARCHAR(10)  NULL,
  `created_at`   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_students_reg_number` (`reg_number`),
  KEY `idx_students_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- Table: courses
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `courses` (
  `id`                 INT          NOT NULL AUTO_INCREMENT,
  `code`               VARCHAR(20)  NOT NULL,
  `title`              VARCHAR(200) NOT NULL,
  `nature_id`          INT          NOT NULL,
  `regulation_year`    SMALLINT     NULL,
  `department`         VARCHAR(100) NULL,
  `co_count`           TINYINT      NOT NULL DEFAULT 5,
  `co_target_percent`  DECIMAL(5,2) NOT NULL,
  `created_at`         TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_courses_code` (`code`),
  KEY `idx_courses_department` (`department`),
  KEY `idx_courses_nature_id` (`nature_id`),
  CONSTRAINT `fk_courses_nature`
    FOREIGN KEY (`nature_id`) REFERENCES `course_natures` (`id`)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- End of migration 003
-- =====================================================================
