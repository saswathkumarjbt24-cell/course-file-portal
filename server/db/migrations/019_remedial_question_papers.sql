SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- The SET NAMES line above is REQUIRED and must stay first, for the same
-- reason migration 012 states: every table here is utf8mb4_unicode_ci, and
-- MySQL 8 opens a connection on utf8mb4_0900_ai_ci. Any comparison between
-- a literal and a column then raises ERROR 1267.
-- ---------------------------------------------------------------------

-- =====================================================================
-- Migration: 019_remedial_question_papers
--
-- The remedial ASSESSMENT QUESTION PAPER, the one sheet of the department's
-- remedial section the portal had no equivalent for. Two tables:
--
--   1. remedial_question_papers - one paper per remedial CLASS
--   2. remedial_questions       - the numbered questions on that paper
--
-- NO SEED DATA. Nothing is inserted for any course, 22BT009 included.
--
--
-- WHY ONE PAPER PER CLASS AND NOT ONE PER PLAN
--   remedial_classes is UNIQUE on (schedule_id, co_number), so a class
--   already targets exactly one CO. The paper's maximum is the maximum of
--   that CO: in the real 22BT009 PT1 file, CO1 and CO2 are allocated 20
--   marks each and CO3 is allocated 10. A single paper per plan could not
--   carry both maxima without one of them being wrong on a printed sheet.
--
--
-- WHY remedial_class_id IS UNIQUE
--   A class has one paper or none. The UNIQUE key is what makes the write
--   endpoint an upsert rather than an append: saving the paper twice edits
--   it instead of leaving two papers behind for the same class.
--
--
-- WHY total_marks AND duration_minutes ARE NULLABLE
--   The printed sheet carries "Maximum Marks: 20" and "Time Duration: 30
--   Minutes", but a paper is often drafted question by question before its
--   header is settled. NULL means "not stated yet", which the screen prints
--   as a gap rather than as an invented 0. A stated total that disagrees
--   with the sum of its questions is refused by the endpoint; a total that
--   disagrees with co_allocations is only WARNED about, because the CO
--   allocation is a property of the periodical test and the remedial paper
--   is allowed to be shorter.
--
--
-- WHY remedial_questions.co_number IS NULLABLE
--   The Excel prints a CO against every question, and in the real sheet
--   every question carries the same CO as its class. NULL therefore means
--   exactly one thing: "the CO of this paper's class". It is not a second
--   meaning and must not be read as one -- a question tagged to a different
--   CO records that CO explicitly.
--
--   question_text is TEXT, not VARCHAR: a question is a sentence or several
--   and has no useful column-level maximum. The 2000-character limit lives
--   in the endpoint, where it can be a 400 naming the question rather than
--   a truncation.
--
--
-- WHY marks_allotted IS NOT NULL
--   Unlike the two header fields, a question with no mark is not a draft --
--   it is a defect. The parts of a paper have to add up, and a NULL could
--   not participate in that sum.
--
--
-- Depends on: 008_documents_and_records.sql (remedial_classes)
--
-- This file is safely re-runnable: both statements are CREATE TABLE IF NOT
-- EXISTS, the guard migration 012 uses, and nothing is inserted or altered.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Table: remedial_question_papers
--
-- The header of one remedial class's question paper.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `remedial_question_papers` (
  `id`                 INT          NOT NULL AUTO_INCREMENT,
  `remedial_class_id`  INT          NOT NULL,
  `total_marks`        DECIMAL(6,2) NULL,
  `duration_minutes`   INT          NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_remedial_question_papers_class` (`remedial_class_id`),
  CONSTRAINT `fk_remedial_question_papers_class`
    FOREIGN KEY (`remedial_class_id`) REFERENCES `remedial_classes` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- Table: remedial_questions
--
-- One numbered question of a paper. UNIQUE (paper_id, q_no) is what makes
-- "Q.No." a real number on the printed sheet rather than a label two rows
-- can share.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `remedial_questions` (
  `id`              INT          NOT NULL AUTO_INCREMENT,
  `paper_id`        INT          NOT NULL,
  `q_no`            INT          NOT NULL,
  `question_text`   TEXT         NOT NULL,
  `marks_allotted`  DECIMAL(6,2) NOT NULL,
  `co_number`       TINYINT      NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_remedial_questions_paper_qno` (`paper_id`, `q_no`),
  CONSTRAINT `fk_remedial_questions_paper`
    FOREIGN KEY (`paper_id`) REFERENCES `remedial_question_papers` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- End of migration 019
-- =====================================================================
