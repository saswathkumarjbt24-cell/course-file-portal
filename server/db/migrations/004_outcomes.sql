-- =====================================================================
-- Migration: 004_outcomes
--
-- Creates the outcome vocabulary the whole attainment calculation is
-- articulated against:
--   1. program_outcomes           - the 12 NBA programme outcomes (PO1..PO12),
--                                   identical for every department
--   2. program_specific_outcomes  - PSOs, which are defined PER DEPARTMENT
--   3. course_outcomes            - the CO1..COn statements of one course
--   4. co_po_matrix               - the CO -> PO/PSO articulation matrix
--                                   (correlation strength 1..3)
--
-- Source of values:
--   - NBA / NBA-aligned programme outcome statements (PO1..PO12 below)
--
-- WHAT IS SEEDED AND WHAT IS NOT:
--   Only program_outcomes is seeded. The other three tables are deliberately
--   left EMPTY:
--     - PSOs differ per department, so there is no universal set to seed.
--     - course_outcomes and co_po_matrix are per course, and are supplied by
--       the faculty who owns the course file.
--   Sample rows for all three are inserted later by 007_seed_sample_data.sql,
--   which is a TEST seed and is skipped in a production install.
--
-- Why co_po_matrix stores only the cells that have a correlation:
--   An absent row means "no correlation", not "zero". This is why `value` is
--   constrained to 1..3 and has no 0 state -- a blank cell in the source
--   articulation sheet becomes a missing row, not a row holding 0.
--
-- Why co_po_matrix has NO foreign key to program_outcomes /
-- program_specific_outcomes:
--   A single column (`outcome_code`) points at either table depending on
--   `outcome_type`, which SQL cannot express as one foreign key. The
--   application is responsible for validating that the code exists.
--
-- Depends on: 003_students_and_courses.sql (course_id references courses.id)
--
-- This file is safely re-runnable: tables use CREATE TABLE IF NOT EXISTS and
-- every seed row is idempotent (no duplicates, no errors on a second run).
-- =====================================================================


-- ---------------------------------------------------------------------
-- Table: program_outcomes
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `program_outcomes` (
  `id`         INT          NOT NULL AUTO_INCREMENT,
  `code`       VARCHAR(10)  NOT NULL,
  `title`      VARCHAR(120) NOT NULL,
  `statement`  TEXT         NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_program_outcomes_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- Seed: program_outcomes  (12 rows: PO1 through PO12)
--
-- `code` is UNIQUE, so ON DUPLICATE KEY UPDATE makes this idempotent:
-- a re-run re-asserts each title and statement instead of duplicating it.
--
-- The statement text keeps the leading title label ("Engineering knowledge:
-- ...") because that is how the statement is printed verbatim on the course
-- file sheets. `title` is stored separately so the short label can be used on
-- its own in the articulation matrix header.
--
-- Apostrophes inside the text are escaped by doubling them (see PO11).
-- ---------------------------------------------------------------------
INSERT INTO `program_outcomes` (`code`, `title`, `statement`)
VALUES
  ('PO1',  'Engineering knowledge',
     'Engineering knowledge: Apply the knowledge of mathematics, science, engineering fundamentals and an engineering specialisation to the solution of complex engineering problems.'),
  ('PO2',  'Problem analysis',
     'Problem analysis: Identify, formulate, review research literature and analyse complex engineering problems reaching substantiated conclusions using first principles of mathematics, natural sciences and engineering sciences.'),
  ('PO3',  'Design/development of solutions',
     'Design/development of solutions: Design solutions for complex engineering problems and design system components or processes that meet the specified needs with appropriate consideration for public health and safety, and cultural, societal and environmental considerations.'),
  ('PO4',  'Conduct investigations of complex problems',
     'Conduct investigations of complex problems: Use research-based knowledge and research methods including design of experiments, analysis and interpretation of data, and synthesis of the information to provide valid conclusions.'),
  ('PO5',  'Modern tool usage',
     'Modern tool usage: Create, select and apply appropriate techniques, resources and modern engineering and IT tools including prediction and modelling to complex engineering activities with an understanding of the limitations.'),
  ('PO6',  'The engineer and society',
     'The engineer and society: Apply reasoning informed by contextual knowledge to assess societal, health, safety, legal and cultural issues and the consequent responsibilities relevant to professional engineering practice.'),
  ('PO7',  'Environment and sustainability',
     'Environment and sustainability: Understand the impact of professional engineering solutions in societal and environmental contexts and demonstrate the knowledge of, and need for, sustainable development.'),
  ('PO8',  'Ethics',
     'Ethics: Apply ethical principles and commit to professional ethics and responsibilities and norms of engineering practice.'),
  ('PO9',  'Individual and team work',
     'Individual and team work: Function effectively as an individual, and as a member or leader in diverse teams and in multidisciplinary settings.'),
  ('PO10', 'Communication',
     'Communication: Communicate effectively on complex engineering activities with the engineering community and with society at large, including the ability to write effective reports, make effective presentations and give and receive clear instructions.'),
  ('PO11', 'Project management and finance',
     'Project management and finance: Demonstrate knowledge and understanding of engineering and management principles and apply these to one''s own work, as a member and leader in a team, to manage projects and in multidisciplinary environments.'),
  ('PO12', 'Life-long learning',
     'Life-long learning: Recognise the need for, and have the preparation and ability to engage in independent and life-long learning in the broadest context of technological change.')
AS `new`
ON DUPLICATE KEY UPDATE
  `title`     = `new`.`title`,
  `statement` = `new`.`statement`;


-- ---------------------------------------------------------------------
-- Table: program_specific_outcomes
--
-- NO SEED. PSOs are department-specific, so there is no institution-wide set
-- to insert here. `code` is unique only WITHIN a department, which is why the
-- unique key is (department, code) and not (code) alone.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `program_specific_outcomes` (
  `id`          INT          NOT NULL AUTO_INCREMENT,
  `department`  VARCHAR(100) NOT NULL,
  `code`        VARCHAR(10)  NOT NULL,
  `statement`   TEXT         NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_program_specific_outcomes_dept_code` (`department`, `code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- Table: course_outcomes
--
-- NO SEED. One row per CO of a course. `statement` is NULLABLE on purpose:
-- a course file often has its CO numbers and its mark allocations entered
-- before the wording of each CO has been finalised.
--
-- ON DELETE CASCADE: a course's COs have no meaning without the course.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `course_outcomes` (
  `id`         INT     NOT NULL AUTO_INCREMENT,
  `course_id`  INT     NOT NULL,
  `co_number`  TINYINT NOT NULL,
  `statement`  TEXT    NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_course_outcomes_course_co` (`course_id`, `co_number`),
  CONSTRAINT `fk_course_outcomes_course`
    FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- Table: co_po_matrix
--
-- NO SEED. One row per NON-EMPTY cell of the articulation matrix.
-- `outcome_type` selects which vocabulary `outcome_code` is drawn from:
-- 'PO'  -> program_outcomes.code
-- 'PSO' -> program_specific_outcomes.code (within the course's department)
--
-- CHECK (value BETWEEN 1 AND 3) enforces the 1..3 correlation scale. There is
-- no 0: "no correlation" is represented by the absence of the row.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `co_po_matrix` (
  `id`            INT                 NOT NULL AUTO_INCREMENT,
  `course_id`     INT                 NOT NULL,
  `co_number`     TINYINT             NOT NULL,
  `outcome_type`  ENUM('PO','PSO')    NOT NULL,
  `outcome_code`  VARCHAR(10)         NOT NULL,
  `value`         TINYINT             NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_co_po_matrix_cell`
    (`course_id`, `co_number`, `outcome_type`, `outcome_code`),
  CONSTRAINT `fk_co_po_matrix_course`
    FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `chk_co_po_matrix_value`
    CHECK (`value` BETWEEN 1 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- End of migration 004
-- =====================================================================
