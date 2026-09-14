SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- The SET NAMES line above is REQUIRED and must stay first.
--
-- Same reason as 012: the guard below compares COLUMN_NAME and TABLE_NAME
-- from information_schema against string literals, and MySQL 8 defaults a new
-- connection to utf8mb4_0900_ai_ci while every table here is
-- utf8mb4_unicode_ci. Without it the comparison raises ERROR 1267.
-- ---------------------------------------------------------------------

-- =====================================================================
-- Migration: 023_remedial_answer_text
--
-- One change: remedial_questions.answer_text, the expected answer the
-- faculty member records beside the question they set.
--
-- NULLABLE, AND THAT IS THE WHOLE DESIGN.
--   An answer is optional. A question paper written with no answers at all
--   is a complete, valid paper and must keep saving exactly as it did before
--   this column existed. NULL therefore means "no answer was recorded", and
--   it is distinct from an empty string -- the server stores NULL for an
--   absent or blank answer so the two cannot drift apart, and the printed
--   answer key is suppressed entirely when every answer is NULL.
--
-- TEXT, LIKE question_text.
--   An expected answer is prose of the same order as the question, so it
--   gets the same column type rather than a VARCHAR guess at a maximum. The
--   server caps what it will accept; the column does not need to.
--
-- ADDED AFTER question_text, so the two read together in a DESCRIBE and in
-- any hand query -- the question and its answer are one pair.
--
-- NO SEED ROWS. Nothing is written here; every existing question keeps NULL.
--
-- This file is safely re-runnable: the ALTER is replaced by the no-op `DO 0`
-- when information_schema says the column is already there, so it runs
-- unchanged on every deploy.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. remedial_questions.answer_text
-- ---------------------------------------------------------------------
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME   = 'remedial_questions'
                   AND COLUMN_NAME  = 'answer_text');
SET @ddl := IF(@exists = 0,
  'ALTER TABLE `remedial_questions` ADD COLUMN `answer_text` TEXT NULL AFTER `question_text`',
  'DO 0');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
