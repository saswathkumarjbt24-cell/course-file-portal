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
-- It IS load-bearing in this file: the guard below compares COLUMN_NAME and
-- TABLE_NAME from information_schema against string literals.
-- ---------------------------------------------------------------------

-- =====================================================================
-- Migration: 013_faculty_roles
--
-- One change: a `role` column on `faculty`, so the API can tell what a
-- signed-in member of staff is allowed to reach.
--
--   'faculty'  the default. May read and write only the courses allocated
--              to them in course_allocations.
--   'hod'      may read and write any course in their own department.
--   'admin'    no restriction.
--
-- NO SEED DATA. Every existing row takes the DEFAULT, 'faculty'. That is
-- deliberate: after this file runs, NOBODY is an admin or an HoD, and the
-- first admin must be set by hand:
--
--   UPDATE faculty SET role = 'admin' WHERE email = '...';
--
-- Granting a privilege is an institutional decision, not something a schema
-- file should make. A seeded admin would also be a guess at WHICH account
-- should hold the keys, and the wrong guess here is a security hole rather
-- than a cosmetic error.
--
--
-- WHY NOT NULL WITH A DEFAULT, RATHER THAN NULLABLE
--   Unlike the offering columns added by 012, there is no honest "not
--   recorded yet" state for a permission. A NULL role would have to be
--   treated as SOMETHING by the authorisation code, and whichever way it
--   went it would be wrong: read as 'admin' it opens the API up, read as
--   'faculty' it is just a slower spelling of the default. 'faculty' is the
--   correct answer for every row already in the table -- least privilege --
--   so the column says so outright and the middleware never has to guess.
--
--
-- WHY AN ENUM AND NOT A LOOKUP TABLE
--   These three values are the authorisation rules the server implements in
--   code. A fourth value would need a matching branch in the middleware, so
--   it cannot be added by inserting a row -- which is exactly the constraint
--   an ENUM expresses and a foreign key does not. MySQL also rejects an
--   unknown value outright in strict mode, so a typo in a hand-run UPDATE
--   fails loudly instead of quietly creating a role nobody can satisfy.
--
--
-- NOT TO BE CONFUSED WITH course_allocations.role
--   006 already has a `role` column on course_allocations, holding
--   'handling' or 'incharge'. That one records WHAT SOMEBODY DOES on one
--   course; this one records WHAT SOMEBODY MAY REACH across the whole
--   portal. They are unrelated, and a query joining both must qualify the
--   column name.
--
--
-- WHY THE ALTER IS GUARDED
--   MySQL has no ADD COLUMN IF NOT EXISTS. Re-running an unguarded ALTER
--   raises ERROR 1060 (duplicate column name) and aborts the rest of the
--   file, so a half-applied migration could not be finished by simply
--   running it again. The ALTER below is therefore built as a string, and
--   replaced by the no-op `DO 0` when information_schema says the column is
--   already there. The whole file is safe to run any number of times, and
--   re-running it does NOT reset a role that has since been changed by hand:
--   the guard skips the ALTER entirely rather than re-applying the default.
--
--   The guard reads DATABASE(), so it only ever sees the schema the file is
--   being applied to.
--
--
-- Depends on: 006_faculty_and_allocations.sql (faculty)
--
-- This file is safely re-runnable.
-- =====================================================================


-- ---------------------------------------------------------------------
-- faculty.role
--
-- Placed AFTER `designation` so it sits with the descriptive columns and
-- ahead of the is_active / timestamp block, matching the order the table
-- was declared in.
-- ---------------------------------------------------------------------
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME   = 'faculty'
                   AND COLUMN_NAME  = 'role');
SET @ddl := IF(@exists = 0,
  'ALTER TABLE `faculty` ADD COLUMN `role` ENUM(''faculty'',''hod'',''admin'') NOT NULL DEFAULT ''faculty'' AFTER `designation`',
  'DO 0');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================================
-- End of migration 013
-- =====================================================================
