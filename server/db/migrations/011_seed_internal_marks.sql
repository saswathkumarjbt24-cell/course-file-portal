SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- The SET NAMES line above is REQUIRED and must stay first.
--
-- Every table in this schema is declared COLLATE=utf8mb4_unicode_ci, but
-- MySQL 8 defaults a new connection to utf8mb4_0900_ai_ci. This file joins
-- `students` on reg_number and `courses` on code -- two string comparisons
-- between a column and a literal -- which without this line raise
-- ERROR 1267 (illegal mix of collations), exactly as 009 did.
-- ---------------------------------------------------------------------

-- =====================================================================
-- Migration: 011_seed_internal_marks
--
-- !! SAMPLE DATA -- FOR TESTING ONLY. SKIP THIS FILE IN PRODUCTION. !!
--
--   The 36 internal marks below are INVENTED, like every other figure in the
--   sample fixtures. They exist so the institution-wide risk report has three
--   courses of data to rank and band.
--
--   DO NOT run this file on a production install. Running 001-006, 008 and
--   010 gives a complete and correct EMPTY schema; 007, 009 and 011 are the
--   three files that must be skipped.
--
--
-- SOURCE OF EVERY VALUE
--   client/src/data/mockData.js, export `internalMarks`. Transcribed
--   verbatim -- nothing invented, rounded or adjusted relative to that file.
--   The component figures are already SCALED onto each course nature's mark
--   scale in the fixture; they are stored exactly as found, not rescaled
--   here. See the header of 010 for what the columns mean.
--
--
-- WHAT THE THREE COURSES LOOK LIKE
--   19CS502  Theory & Lab    PT1/PT2 out of 15, IP out of 20, INT 50
--   19CS504  Theory          PT1/PT2 out of 12, IP out of 16, INT 40
--   19CS591  Mini Project I  no component breakdown in the source at all --
--                            pt1, pt2 and ip are NULL and only `total` is
--                            recorded. That is the fixture's actual shape,
--                            not missing data.
--
--
-- CONSISTENCY WITH THE ASSESSMENT TABLES
--   For 19CS502 these totals are the same figures the mark pipeline computes
--   from PT1/PT2/IP1/IP2, so the risk report and the internal mark sheet
--   agree. 19CS504 and 19CS591 have no assessment rows at all, which is why
--   this table is the only source for them. See the denormalisation warning
--   in the header of 010.
--
--
-- HOW FOREIGN KEYS ARE RESOLVED
--   By natural key -- registration number and course code. No auto-increment
--   id is hardcoded, so the file runs correctly on any database.
--
--
-- IDEMPOTENCY
--   academic_year and semester are left NULL (the fixture states neither) and
--   both sit inside the unique key. MySQL treats NULLs as distinct, so
--   ON DUPLICATE KEY UPDATE would not catch a re-run. This uses
--   INSERT ... SELECT ... WHERE NOT EXISTS with the NULL-safe <=> operator
--   instead: re-running produces no duplicates and no errors.
--
--   Note the consequence, as in 009: this form is insert-if-missing, so a
--   re-run does NOT restore a total that someone has since edited by hand.
--
--
-- Depends on: 003 (students, courses), 010 (internal_marks).
--   RUN THIS FILE LAST, after 010.
--
-- Rows seeded: internal_marks 36  (12 students x 3 courses)
-- =====================================================================


-- =====================================================================
-- internal_marks  (36 rows -- mockData `internalMarks`)
-- =====================================================================
INSERT INTO `internal_marks`
  (`student_id`, `course_id`, `pt1`, `pt2`, `ip`, `total`,
   `academic_year`, `semester`)
SELECT `s`.`id`, `c`.`id`,
       `new`.`pt1`, `new`.`pt2`, `new`.`ip`, `new`.`total`,
       NULL, NULL
FROM (
  -- 19CS502  Theory & Lab
              SELECT '7376221CS101' AS `reg_number`, '19CS502' AS `code`,
                     12.60 AS `pt1`, 13.20 AS `pt2`, 17.00 AS `ip`,
                     43.00 AS `total`
    UNION ALL SELECT '7376221CS102', '19CS502', 14.10, 14.10, 19.00, 47.00
    UNION ALL SELECT '7376221CS103', '19CS502',  8.40,  7.20, 12.00, 28.00
    UNION ALL SELECT '7376221CS104', '19CS502', 11.70, 10.50, 15.00, 37.00
    UNION ALL SELECT '7376221CS105', '19CS502',  6.30,  6.30,  9.00, 22.00
    UNION ALL SELECT '7376221CS106', '19CS502', 13.50, 11.40, 17.00, 42.00
    UNION ALL SELECT '7376221CS107', '19CS502', 10.20,  9.90, 13.00, 33.00
    UNION ALL SELECT '7376221CS108', '19CS502',  9.90,  9.60, 11.00, 31.00
    UNION ALL SELECT '7376221CS109', '19CS502',  5.40,  5.40,  7.00, 18.00
    UNION ALL SELECT '7376221CS110', '19CS502', 15.00,  8.70, 19.00, 43.00
    UNION ALL SELECT '7376221CS111', '19CS502', 10.80,  9.90, 13.00, 34.00
    UNION ALL SELECT '7376221CS112', '19CS502', 13.20,  8.10,  9.00, 30.00

  -- 19CS504  Theory
    UNION ALL SELECT '7376221CS101', '19CS504',  9.50,  9.00, 12.00, 31.00
    UNION ALL SELECT '7376221CS102', '19CS504', 10.50, 10.00, 14.00, 35.00
    UNION ALL SELECT '7376221CS103', '19CS504',  7.00,  6.00,  9.00, 22.00
    UNION ALL SELECT '7376221CS104', '19CS504',  8.50,  8.00, 11.00, 28.00
    UNION ALL SELECT '7376221CS105', '19CS504',  6.00,  5.50,  8.00, 20.00
    UNION ALL SELECT '7376221CS106', '19CS504', 10.00,  9.50, 13.00, 33.00
    UNION ALL SELECT '7376221CS107', '19CS504',  7.50,  7.00, 10.00, 25.00
    UNION ALL SELECT '7376221CS108', '19CS504',  7.00,  7.00,  9.00, 23.00
    UNION ALL SELECT '7376221CS109', '19CS504',  5.50,  5.00,  7.00, 18.00
    UNION ALL SELECT '7376221CS110', '19CS504', 11.00, 10.50, 15.00, 37.00
    UNION ALL SELECT '7376221CS111', '19CS504',  8.00,  8.00, 10.00, 26.00
    UNION ALL SELECT '7376221CS112', '19CS504',  6.50,  7.00,  8.50, 22.00

  -- 19CS591  Mini Project I -- no component breakdown in the source
    UNION ALL SELECT '7376221CS101', '19CS591', NULL, NULL, NULL, 42.00
    UNION ALL SELECT '7376221CS102', '19CS591', NULL, NULL, NULL, 45.00
    UNION ALL SELECT '7376221CS103', '19CS591', NULL, NULL, NULL, 30.00
    UNION ALL SELECT '7376221CS104', '19CS591', NULL, NULL, NULL, 38.00
    UNION ALL SELECT '7376221CS105', '19CS591', NULL, NULL, NULL, 31.00
    UNION ALL SELECT '7376221CS106', '19CS591', NULL, NULL, NULL, 44.00
    UNION ALL SELECT '7376221CS107', '19CS591', NULL, NULL, NULL, 35.00
    UNION ALL SELECT '7376221CS108', '19CS591', NULL, NULL, NULL, 33.00
    UNION ALL SELECT '7376221CS109', '19CS591', NULL, NULL, NULL, 28.00
    UNION ALL SELECT '7376221CS110', '19CS591', NULL, NULL, NULL, 46.00
    UNION ALL SELECT '7376221CS111', '19CS591', NULL, NULL, NULL, 36.00
    UNION ALL SELECT '7376221CS112', '19CS591', NULL, NULL, NULL, 34.00
) AS `new`
JOIN `students` AS `s` ON `s`.`reg_number` = `new`.`reg_number`
JOIN `courses`  AS `c` ON `c`.`code`       = `new`.`code`
WHERE NOT EXISTS (
  SELECT 1 FROM `internal_marks` AS `x`
  WHERE `x`.`student_id`    =   `s`.`id`
    AND `x`.`course_id`     =   `c`.`id`
    AND `x`.`academic_year` <=> NULL
    AND `x`.`semester`      <=> NULL
);

-- =====================================================================
-- End of migration 011
-- =====================================================================
