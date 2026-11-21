SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =====================================================================
-- BEGIN REMOVABLE -- Student Directory
--
-- Migration: 027_student_directory
--
-- Two NULLable columns on `students`, plus an index, for the admin
-- Student Directory screen:
--   1. students.batch      VARCHAR(20)  NULL   e.g. '2023-2027', stored as given
--   2. students.programme  VARCHAR(120) NULL   e.g. 'B Tech', Title Case
--   3. idx_students_batch  on (batch), for the batch filter
--
-- ADDITIVE ONLY. Nothing is dropped, current_sem is not touched, and no
-- student row is inserted, updated or deleted. Existing rows get NULL in
-- both new columns until an admin fills them from the Students screen.
--
-- RE-RUNNABLE. deploy.sh runs every migration on every deploy. MySQL 8 has
-- no ADD COLUMN IF NOT EXISTS, so each ALTER is built as a string and
-- replaced by the no-op `DO 0` when information_schema says the column or
-- index is already there -- the same guard 012 uses. The guards read
-- DATABASE(), so they only ever see the schema the file is applied to.
--
-- TO REMOVE: drop idx_students_batch, then the two columns, and delete
-- this file. Nothing else in the schema refers to them.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. students.batch
-- ---------------------------------------------------------------------
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME   = 'students'
                   AND COLUMN_NAME  = 'batch');
SET @ddl := IF(@exists = 0,
  'ALTER TABLE `students` ADD COLUMN `batch` VARCHAR(20) NULL AFTER `current_sem`',
  'DO 0');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- ---------------------------------------------------------------------
-- 2. students.programme
-- ---------------------------------------------------------------------
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME   = 'students'
                   AND COLUMN_NAME  = 'programme');
SET @ddl := IF(@exists = 0,
  'ALTER TABLE `students` ADD COLUMN `programme` VARCHAR(120) NULL AFTER `batch`',
  'DO 0');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- ---------------------------------------------------------------------
-- 3. idx_students_batch
-- ---------------------------------------------------------------------
SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME   = 'students'
                   AND INDEX_NAME   = 'idx_students_batch');
SET @ddl := IF(@exists = 0,
  'ALTER TABLE `students` ADD INDEX `idx_students_batch` (`batch`)',
  'DO 0');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================================
-- END REMOVABLE -- Student Directory
-- End of migration 027
-- =====================================================================
