SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =====================================================================
-- Migration: 016_test_account
--
-- Adds one further account requested by JSK:
--   test 01  <btinventory@bitsathy.ac.in>
--
-- It is an ordinary 'faculty' row, so it can sign in exactly like any
-- other faculty member. It will see an empty dashboard until a course
-- is allocated to it.
-- =====================================================================

INSERT INTO `faculty` (`name`,`email`,`department`,`designation`,`role`,`is_active`) VALUES
  ('test 01','btinventory@bitsathy.ac.in',NULL,NULL,'faculty',TRUE)
AS `new` ON DUPLICATE KEY UPDATE
  `name` = `new`.`name`,
  `is_active` = `new`.`is_active`;

-- Expected afterwards: 31 faculty rows in total.
