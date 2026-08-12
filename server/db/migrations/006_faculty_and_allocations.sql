-- =====================================================================
-- Migration: 006_faculty_and_allocations
--
-- Creates the people-and-offering layer:
--   1. faculty            - one row per member of staff (email is the
--                           natural key)
--   2. course_allocations - which faculty member handles which course, in
--                           which academic year / semester / section
--   3. student_enrolments - which student is taking which course, in which
--                           academic year / semester
--
-- NO SEED DATA. All three tables are intentionally left EMPTY by this
-- migration. Sample rows are inserted later by 007_seed_sample_data.sql,
-- which is a TEST seed and is skipped in a production install.
--
--
-- !! THIS STRUCTURE IS PROVISIONAL !!
--   The institution's real faculty-to-course allocation sheet HAS NOT BEEN
--   SUPPLIED YET. Everything below is a best guess at its shape, inferred
--   from the course file templates rather than from the actual document.
--   Expect to revise it once the sheet arrives. In particular:
--     - academic_year / semester / section are free-text VARCHARs with no
--       agreed format ('2025-2026'? '2025-26'? 'ODD 2025'?). They are also
--       NULLABLE, because it is not yet known whether the sheet always
--       states them.
--     - `role` has exactly two values, 'handling' and 'incharge'. The real
--       sheet may distinguish more (course coordinator, lab instructor,
--       moderator, second examiner).
--     - it is not yet confirmed whether more than one faculty member can
--       share one course/section, nor whether a course can run in more than
--       one section at once.
--     - student_enrolments assumes a student's course list is explicit. If
--       the institution derives it from the class/section instead, this
--       table may collapse into a section membership table.
--   Do not build reporting on these columns without re-checking them against
--   the real sheet.
--
--
-- NOTE ON THE UNIQUE KEYS AND NULLS
--   In MySQL a UNIQUE key does NOT block duplicates when one of its columns
--   is NULL: two rows that are NULL in academic_year are treated as distinct.
--   Until the nullable columns above are pinned down, these unique keys
--   therefore guard less than they appear to. 007 works around this by
--   guarding its inserts with NOT EXISTS rather than relying on the key.
--
--
-- Depends on: 003_students_and_courses.sql (course_id -> courses.id,
--                                           student_id -> students.id)
--
-- This file is safely re-runnable: all three tables use
-- CREATE TABLE IF NOT EXISTS.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Table: faculty
--
-- `email` is UNIQUE and is the natural key used by every other file to
-- resolve a faculty member without hardcoding an auto-increment id.
--
-- is_active exists so that a member of staff who has left can be hidden from
-- the allocation screens WITHOUT deleting them -- their name must continue to
-- appear on the course files they signed.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `faculty` (
  `id`           INT          NOT NULL AUTO_INCREMENT,
  `name`         VARCHAR(120) NOT NULL,
  `email`        VARCHAR(160) NOT NULL,
  `department`   VARCHAR(100) NULL,
  `designation`  VARCHAR(80)  NULL,
  `is_active`    BOOLEAN      NOT NULL DEFAULT TRUE,
  `created_at`   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_faculty_email` (`email`),
  KEY `idx_faculty_department` (`department`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- Table: course_allocations
--
-- PROVISIONAL -- see the warning in the file header.
--
-- 'handling' is the faculty member who teaches the section and enters the
-- marks; 'incharge' is the one who owns the course file itself. They are
-- frequently the same person, which is why they are two rows of one table
-- rather than two columns.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `course_allocations` (
  `id`             INT         NOT NULL AUTO_INCREMENT,
  `faculty_id`     INT         NOT NULL,
  `course_id`      INT         NOT NULL,
  `role`           ENUM('handling','incharge') NOT NULL DEFAULT 'handling',
  `academic_year`  VARCHAR(20) NULL,
  `semester`       VARCHAR(10) NULL,
  `section`        VARCHAR(10) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_course_allocations`
    (`faculty_id`, `course_id`, `role`, `academic_year`, `semester`, `section`),
  KEY `idx_course_allocations_course` (`course_id`),
  CONSTRAINT `fk_course_allocations_faculty`
    FOREIGN KEY (`faculty_id`) REFERENCES `faculty` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_course_allocations_course`
    FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- Table: student_enrolments
--
-- PROVISIONAL -- see the warning in the file header.
--
-- The roll of a course: which students the mark sheets and the CO attainment
-- report should cover. A student may legitimately appear here with no
-- student_assessments row yet, which is the state of a course file before any
-- test has been conducted.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `student_enrolments` (
  `id`             INT         NOT NULL AUTO_INCREMENT,
  `student_id`     INT         NOT NULL,
  `course_id`      INT         NOT NULL,
  `academic_year`  VARCHAR(20) NULL,
  `semester`       VARCHAR(10) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_student_enrolments`
    (`student_id`, `course_id`, `academic_year`, `semester`),
  KEY `idx_student_enrolments_course` (`course_id`),
  CONSTRAINT `fk_student_enrolments_student`
    FOREIGN KEY (`student_id`) REFERENCES `students` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_student_enrolments_course`
    FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- End of migration 006
-- =====================================================================
