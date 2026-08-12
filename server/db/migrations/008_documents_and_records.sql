-- =====================================================================
-- Migration: 008_documents_and_records
--
-- Completes the schema with the tables the PRINTED course file needs but the
-- mark pipeline does not, plus the remedial record:
--   1. settings            - institution details and attainment constants,
--                            as free key/value pairs
--   2. vision_missions     - the vision of the institution and of a department
--   3. missions            - the ordered mission statements under one vision
--   4. peos                - Programme Educational Objectives
--   5. attendance          - overall course attendance percentage
--   6. course_exit_survey  - indirect attainment: the level students report
--   7. remedial_schedules  - one remedial plan per (course, assessment)
--   8. remedial_classes    - the individual classes of that plan, one per CO
--   9. remedial_attendance - who attended each remedial class
--  10. remedial_results    - the re-test mark after remedial work
--
-- NO SEED DATA. Every table here is left EMPTY. Sample rows for tables 1-8
-- are inserted by 009_seed_documents.sql, which is a TEST seed and is skipped
-- in a production install. Tables 9 and 10 are never seeded at all -- they are
-- faculty-entered records with no source in the sample fixtures.
--
--
-- WHY `settings` IS KEY/VALUE AND NOT COLUMNS
--   The institution block (name, place, affiliation, accreditation) and the
--   attainment constants (cieWeight, seeWeight, directWeight, surveyWeight)
--   are single-row, slow-changing values that the client keeps adding to. As
--   columns, every new constant would be a schema migration and a deploy. As
--   rows, adding one is an INSERT. `scope` groups them so a caller can fetch
--   just the institution block or just the attainment constants.
--   The cost is that `value` is TEXT: numbers come back as strings and the
--   API layer must cast them. That is deliberate -- see the note in 009 about
--   which weights are authoritative.
--
-- WHY VISION AND MISSIONS ARE TWO TABLES
--   A vision is one paragraph; the missions are an ORDERED list of five. `seq`
--   carries that order explicitly, because the printed sheet numbers them and
--   row order in SQL is not a guarantee.
--
-- WHY THE REMEDIAL RECORD IS FOUR TABLES
--   A remedial plan is announced per (course, assessment) -- "after PT1, in
--   Seminar Hall B". Within it there is one class per CO that fell short, each
--   with its own date and timing. Attendance is then per (class, student), and
--   the re-test mark is per (student attempt, CO). Each level has a different
--   grain, so each is its own table.
--
-- WHY remedial_results HANGS OFF student_assessments
--   The after-remedial mark replaces a specific CO mark of a specific ATTEMPT,
--   so it must point at the student_assessments row, not at (student, course).
--   That also means it cascades away with the attempt it corrects.
--
--
-- NOTE ON NULLABLE COLUMNS IN UNIQUE KEYS
--   peos.department, attendance.academic_year / .semester and
--   vision_missions.department are all NULLABLE and all appear in a UNIQUE
--   key. In MySQL a UNIQUE key does NOT block duplicates when one of its
--   columns is NULL -- two NULL departments are treated as distinct. Those
--   keys therefore guard less than they appear to, and 009 uses the NULL-safe
--   INSERT ... SELECT ... WHERE NOT EXISTS with <=> for exactly these tables,
--   as 007 does for course_allocations and student_enrolments.
--
--   peos.department is NULL in the sample data on purpose: the source fixture
--   states no department for the PEOs and the UI prints the same three for
--   every course, whatever its department. It is nullable rather than NOT NULL
--   so that fact can be recorded without inventing a department.
--
--
-- Depends on: 003_students_and_courses.sql (student_id -> students.id,
--                                           course_id -> courses.id)
--             005_assessments_and_marks.sql (student_assessment_id ->
--                                            student_assessments.id)
--
-- This file is safely re-runnable: all ten tables use
-- CREATE TABLE IF NOT EXISTS.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Table: settings
--
-- `value` is NULLABLE so a key can be declared as "known but not yet
-- supplied", which is different from the key being absent entirely.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `settings` (
  `id`        INT         NOT NULL AUTO_INCREMENT,
  `scope`     VARCHAR(50) NOT NULL,
  `key_name`  VARCHAR(80) NOT NULL,
  `value`     TEXT        NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_settings_scope_key` (`scope`, `key_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- Table: vision_missions
--
-- `department` is NULL when scope = 'institution' and carries the department
-- name when scope = 'department'. See the NULL/UNIQUE note in the header.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `vision_missions` (
  `id`          INT          NOT NULL AUTO_INCREMENT,
  `scope`       ENUM('institution','department') NOT NULL,
  `department`  VARCHAR(100) NULL,
  `vision`      TEXT         NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_vision_missions_scope_department` (`scope`, `department`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- Table: missions
--
-- `seq` is the printed order (1..n), not a database artefact. It is part of
-- the unique key so the same position cannot be filled twice.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `missions` (
  `id`                 INT     NOT NULL AUTO_INCREMENT,
  `vision_mission_id`  INT     NOT NULL,
  `seq`                TINYINT NOT NULL,
  `statement`          TEXT    NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_missions_parent_seq` (`vision_mission_id`, `seq`),
  CONSTRAINT `fk_missions_vision_mission`
    FOREIGN KEY (`vision_mission_id`) REFERENCES `vision_missions` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- Table: peos
--
-- `department` is NULLABLE -- see the header. NULL means "applies to every
-- department", which is how the sample PEOs are printed.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `peos` (
  `id`          INT          NOT NULL AUTO_INCREMENT,
  `department`  VARCHAR(100) NULL,
  `code`        VARCHAR(10)  NOT NULL,
  `statement`   TEXT         NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_peos_department_code` (`department`, `code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- Table: attendance
--
-- One overall percentage per student per course offering. `percentage` is
-- NULLABLE because a course file is routinely printed before attendance has
-- been consolidated, and 0 would read as "never attended".
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `attendance` (
  `id`             INT          NOT NULL AUTO_INCREMENT,
  `student_id`     INT          NOT NULL,
  `course_id`      INT          NOT NULL,
  `percentage`     DECIMAL(5,2) NULL,
  `academic_year`  VARCHAR(20)  NULL,
  `semester`       VARCHAR(10)  NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_attendance`
    (`student_id`, `course_id`, `academic_year`, `semester`),
  KEY `idx_attendance_course` (`course_id`),
  CONSTRAINT `fk_attendance_student`
    FOREIGN KEY (`student_id`) REFERENCES `students` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_attendance_course`
    FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- Table: course_exit_survey
--
-- INDIRECT attainment: the level students themselves report for each CO, on
-- the same 0..3 scale as the direct attainment level. DECIMAL(4,2) because
-- the reported figure is an average and carries decimals (e.g. 2.80).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `course_exit_survey` (
  `id`         INT          NOT NULL AUTO_INCREMENT,
  `course_id`  INT          NOT NULL,
  `co_number`  TINYINT      NOT NULL,
  `value`      DECIMAL(4,2) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_course_exit_survey_course_co` (`course_id`, `co_number`),
  CONSTRAINT `fk_course_exit_survey_course`
    FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- Table: remedial_schedules
--
-- One plan per (course, assessment). `assessment_kind` repeats the ENUM of
-- assessments.kind rather than holding an assessment_id: a remedial plan is
-- announced against "PT1" on the printed circular, and must survive an
-- assessment row being re-created.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `remedial_schedules` (
  `id`               INT          NOT NULL AUTO_INCREMENT,
  `course_id`        INT          NOT NULL,
  `assessment_kind`  ENUM('PT1','PT2','IP1','IP2','OT','SEE') NOT NULL,
  `venue`            VARCHAR(150) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_remedial_schedules_course_kind` (`course_id`, `assessment_kind`),
  CONSTRAINT `fk_remedial_schedules_course`
    FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- Table: remedial_classes
--
-- One class per CO that needed remedial work. `class_date` and `timing` are
-- NULLABLE because a circular is often drafted with the CO list settled but
-- the room and slot not yet booked.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `remedial_classes` (
  `id`           INT         NOT NULL AUTO_INCREMENT,
  `schedule_id`  INT         NOT NULL,
  `co_number`    TINYINT     NOT NULL,
  `class_date`   DATE        NULL,
  `timing`       VARCHAR(60) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_remedial_classes_schedule_co` (`schedule_id`, `co_number`),
  CONSTRAINT `fk_remedial_classes_schedule`
    FOREIGN KEY (`schedule_id`) REFERENCES `remedial_schedules` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- Table: remedial_attendance
--
-- NEVER SEEDED -- faculty enter this.
--
-- 'NA' is the DEFAULT and means "not recorded", which is deliberately
-- distinct from 'AB' (recorded as absent). Collapsing the two would make an
-- unfilled register indistinguishable from a class nobody attended.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `remedial_attendance` (
  `id`                 INT NOT NULL AUTO_INCREMENT,
  `remedial_class_id`  INT NOT NULL,
  `student_id`         INT NOT NULL,
  `status`             ENUM('PR','AB','NA') NOT NULL DEFAULT 'NA',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_remedial_attendance_class_student`
    (`remedial_class_id`, `student_id`),
  KEY `idx_remedial_attendance_student` (`student_id`),
  CONSTRAINT `fk_remedial_attendance_class`
    FOREIGN KEY (`remedial_class_id`) REFERENCES `remedial_classes` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_remedial_attendance_student`
    FOREIGN KEY (`student_id`) REFERENCES `students` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- Table: remedial_results
--
-- NEVER SEEDED -- faculty enter this.
--
-- The mark a student scored on the CO AFTER remedial teaching. It is stored
-- separately from student_co_marks and never overwrites it: the original
-- attempt is the evidence the remedial was needed, and both figures appear on
-- the printed report.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `remedial_results` (
  `id`                     INT          NOT NULL AUTO_INCREMENT,
  `student_assessment_id`  INT          NOT NULL,
  `co_number`              TINYINT      NOT NULL,
  `after_remedial_mark`    DECIMAL(6,2) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_remedial_results_sa_co` (`student_assessment_id`, `co_number`),
  CONSTRAINT `fk_remedial_results_student_assessment`
    FOREIGN KEY (`student_assessment_id`) REFERENCES `student_assessments` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- End of migration 008
-- =====================================================================
