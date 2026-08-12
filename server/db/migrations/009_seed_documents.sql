SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- The SET NAMES line above is REQUIRED and must stay first.
--
-- Every table in 001-008 is declared COLLATE=utf8mb4_unicode_ci, but MySQL 8
-- defaults a new connection to utf8mb4_0900_ai_ci. Every string literal in
-- this file therefore arrives as utf8mb4_0900_ai_ci, and comparing one to a
-- utf8mb4_unicode_ci column raises:
--
--   ERROR 1267 (HY000): Illegal mix of collations
--   (utf8mb4_unicode_ci,IMPLICIT) and (utf8mb4_0900_ai_ci,IMPLICIT)
--
-- This file has 12 such comparisons, in statements 2 through 8: the joins on
-- scope, department, code, reg_number and assessment_kind, and the NULL-safe
-- <=> tests. SET NAMES pins the session collation to utf8mb4_unicode_ci so
-- all of them match, which is why no individual COLLATE clause is needed.
--
-- 007 did not hit this because its only <=> comparisons were against the
-- literal NULL, which carries no collation, and its natural-key joins ran
-- before any NULL-safe test.
-- ---------------------------------------------------------------------

-- =====================================================================
-- Migration: 009_seed_documents
--
-- !! SAMPLE DATA -- FOR TESTING ONLY. SKIP THIS FILE IN PRODUCTION. !!
--
--   Nothing in this file is real institutional data. The vision and mission
--   text, the PEOs, the attendance percentages, the exit-survey figures and
--   the remedial circular are ALL PLACEHOLDERS, carried over from the UI
--   fixtures so the printed course file has something to render.
--
--   The institution NAME and PLACE are real, but every other string attached
--   to them here is invented wording. Do not print any of this as though the
--   client had approved it.
--
--   DO NOT run this file on a production install. Running 001 through 008
--   gives a complete and correct schema; 007 and 009 are the only two files
--   that must be skipped.
--
--
-- !! LOAD THIS FILE AS UTF-8 !!
--   Unlike 001-008, this file is NOT pure ASCII. The institution's
--   accreditation line contains an EM DASH (U+2014), copied verbatim from the
--   source fixture. Load it with an explicit charset, e.g.
--       mysql --default-character-set=utf8mb4 ... < 009_seed_documents.sql
--   Loading it as latin1 will store a mojibaked accreditation string.
--
--
-- SOURCE OF EVERY VALUE
--   client/src/data/mockData.js -- exports `institution`,
--   `attainmentConstants`, `institutionVisionMission`,
--   `departmentVisionMission`, `peos`, `attendance`, `courseExitSurvey` and
--   `remedialSchedule`. Transcribed verbatim; nothing invented, rounded or
--   adjusted.
--
--
-- NOT SEEDED HERE
--   remedial_attendance and remedial_results are left EMPTY on purpose --
--   faculty enter those, and the fixtures contain no source for them.
--
--
-- HOW FOREIGN KEYS ARE RESOLVED
--   By natural key only -- course code, registration number, and
--   (scope, department) for a vision. No auto-increment id is hardcoded, so
--   the file runs correctly on any database.
--
--
-- IDEMPOTENCY -- TWO MECHANISMS, AND WHY
--   settings, course_exit_survey, remedial_schedules, remedial_classes and
--   missions have unique keys whose columns are all NOT NULL, so they use
--   ON DUPLICATE KEY UPDATE: a re-run re-asserts the value.
--
--   vision_missions, peos and attendance have a NULLABLE column inside their
--   unique key, and MySQL treats NULLs as distinct, so that key would not
--   catch a re-run. They use INSERT ... SELECT ... WHERE NOT EXISTS with the
--   NULL-safe <=> operator instead.
--
--   The difference has a consequence worth knowing: the NOT EXISTS form is
--   insert-if-missing, so re-running this file does NOT re-assert the text of
--   a vision, a PEO or an attendance percentage that someone has since edited
--   by hand. The ON DUPLICATE KEY UPDATE tables DO overwrite. Both are
--   idempotent in the sense required -- no duplicates, no errors -- but only
--   one of them restores the seeded value.
--
--
-- A NOTE ON THE ATTAINMENT WEIGHTS
--   cieWeight 0.4 / seeWeight 0.6 are seeded as the fixture states them. The
--   fixture records that the source spreadsheet's LABEL text reads 0.5 / 0.5
--   while the FORMULA in the cell computes 0.4 / 0.6, and follows the
--   formula. That unresolved conflict is inherited here. Confirm with the
--   client before treating these as final.
--
--
-- Depends on: 003 (students, courses), 008 (all eight tables seeded below).
--   RUN THIS FILE LAST, after 008.
--
-- Rows seeded, per table:
--   settings              8
--   vision_missions       2
--   missions             10
--   peos                  3
--   attendance           12
--   course_exit_survey    5
--   remedial_schedules    1
--   remedial_classes      3
--   ------------------------
--   TOTAL                44
-- =====================================================================


-- =====================================================================
-- 1. settings  (8 rows -- mockData `institution` + `attainmentConstants`)
--
-- key_name keeps the fixture's own camelCase spelling ('cieWeight', not
-- 'cie_weight') so the API can rebuild the attainmentConstants object by
-- reading the rows straight into a map, with no name translation.
--
-- The weights are stored as TEXT, like every other setting. The API layer
-- casts them to numbers -- see the note in the header about which figures are
-- authoritative.
--
-- (scope, key_name) is UNIQUE and both are NOT NULL, so ON DUPLICATE KEY
-- UPDATE makes this idempotent.
-- =====================================================================
INSERT INTO `settings` (`scope`, `key_name`, `value`)
VALUES
  ('institution', 'name',          'BANNARI AMMAN INSTITUTE OF TECHNOLOGY'),
  ('institution', 'place',         'Sathyamangalam, Erode District'),
  ('institution', 'affiliation',   'Affiliated to Anna University, Chennai'),
  ('institution', 'accreditation', 'An Autonomous Institution — Accredited by NAAC and NBA'),
  ('attainment',  'cieWeight',     '0.4'),
  ('attainment',  'seeWeight',     '0.6'),
  ('attainment',  'directWeight',  '0.8'),
  ('attainment',  'surveyWeight',  '0.2')
AS `new`
ON DUPLICATE KEY UPDATE
  `value` = `new`.`value`;


-- =====================================================================
-- 2. vision_missions  (2 rows -- mockData `institutionVisionMission`
--                                        + `departmentVisionMission`)
--
-- The institution row has department NULL, which puts a NULL inside the
-- unique key, so this uses the NULL-safe NOT EXISTS form.
--
-- CAST(NULL AS CHAR(100)) fixes the column type of the derived table so the
-- department string in the second branch is not truncated or retyped.
-- =====================================================================
INSERT INTO `vision_missions` (`scope`, `department`, `vision`)
SELECT `new`.`scope`, `new`.`department`, `new`.`vision`
FROM (
            SELECT 'institution' AS `scope`,
                   CAST(NULL AS CHAR(100)) AS `department`,
                   'To be a centre of excellence in engineering education and research, developing competent professionals who serve society with integrity.' AS `vision`
  UNION ALL SELECT 'department',
                   'Computer Science and Engineering',
                   'To produce computing professionals with strong fundamentals, practical skill and social responsibility, capable of contributing to a rapidly evolving discipline.'
) AS `new`
WHERE NOT EXISTS (
  SELECT 1 FROM `vision_missions` AS `x`
  WHERE `x`.`scope`      =   `new`.`scope`
    AND `x`.`department` <=> `new`.`department`
);


-- =====================================================================
-- 3. missions  (10 rows = 5 institution + 5 department)
--
-- vision_mission_id is resolved by joining vision_missions on its natural key
-- (scope, department). The join uses <=> on department because the
-- institution row's department is NULL and = would never match it.
--
-- `seq` is the printed order, taken from the position of each string in the
-- fixture's missions array.
--
-- (vision_mission_id, seq) is UNIQUE and both are NOT NULL, so ON DUPLICATE
-- KEY UPDATE makes this idempotent.
-- =====================================================================
INSERT INTO `missions` (`vision_mission_id`, `seq`, `statement`)
SELECT `vm`.`id`, `new`.`seq`, `new`.`statement`
FROM (
  -- institutionVisionMission.missions
            SELECT 'institution' AS `scope`,
                   CAST(NULL AS CHAR(100)) AS `department`,
                   1 AS `seq`,
                   'To impart quality technical education through a learner-centred curriculum supported by modern infrastructure.' AS `statement`
  UNION ALL SELECT 'institution', NULL, 2,
                   'To develop faculty and staff continuously so that teaching and research remain current with industry practice.'
  UNION ALL SELECT 'institution', NULL, 3,
                   'To promote research, innovation and entrepreneurship that address real societal and industrial needs.'
  UNION ALL SELECT 'institution', NULL, 4,
                   'To build professional ethics, leadership and teamwork through structured co-curricular activity.'
  UNION ALL SELECT 'institution', NULL, 5,
                   'To sustain productive collaboration with industry, alumni and the wider community.'
  -- departmentVisionMission.missions
  UNION ALL SELECT 'department', 'Computer Science and Engineering', 1,
                   'To deliver a rigorous computing curriculum that balances theoretical depth with hands-on practice.'
  UNION ALL SELECT 'department', 'Computer Science and Engineering', 2,
                   'To provide laboratory and project experience aligned with current industry tools and methods.'
  UNION ALL SELECT 'department', 'Computer Science and Engineering', 3,
                   'To encourage research, publication and participation in professional bodies among students and faculty.'
  UNION ALL SELECT 'department', 'Computer Science and Engineering', 4,
                   'To nurture communication, teamwork and ethical judgement alongside technical competence.'
  UNION ALL SELECT 'department', 'Computer Science and Engineering', 5,
                   'To support lifelong learning through certification, internship and alumni engagement.'
) AS `new`
JOIN `vision_missions` AS `vm`
  ON  `vm`.`scope`      =   `new`.`scope`
  AND `vm`.`department` <=> `new`.`department`
ON DUPLICATE KEY UPDATE
  `statement` = `new`.`statement`;


-- =====================================================================
-- 4. peos  (3 rows -- mockData `peos`)
--
-- department is NULL: the fixture states none, and the UI prints the same
-- three PEOs for every course whatever its department. NULL here means
-- "applies to every department" -- it is a recorded fact, not a placeholder
-- for a department that was known and omitted.
--
-- That NULL sits inside the unique key, so this uses the NULL-safe NOT EXISTS
-- form.
-- =====================================================================
INSERT INTO `peos` (`department`, `code`, `statement`)
SELECT `new`.`department`, `new`.`code`, `new`.`statement`
FROM (
            SELECT CAST(NULL AS CHAR(100)) AS `department`,
                   'PEO1' AS `code`,
                   'Graduates will apply their knowledge of computing and engineering fundamentals to analyse and solve problems in industry, research or higher study.' AS `statement`
  UNION ALL SELECT NULL, 'PEO2',
                   'Graduates will function effectively in multidisciplinary teams, communicating clearly and exercising professional and ethical responsibility.'
  UNION ALL SELECT NULL, 'PEO3',
                   'Graduates will engage in lifelong learning, adapting to emerging technologies and contributing to the advancement of the profession and society.'
) AS `new`
WHERE NOT EXISTS (
  SELECT 1 FROM `peos` AS `x`
  WHERE `x`.`department` <=> `new`.`department`
    AND `x`.`code`       =   `new`.`code`
);


-- =====================================================================
-- 5. attendance  (12 rows -- mockData `attendance`)
--
-- Course 19CS502 only; the fixture records attendance for no other course.
-- student_id and course_id are resolved by registration number and course
-- code.
--
-- academic_year and semester are left NULL because the fixture states
-- neither. Those NULLs sit inside the unique key, so this uses the NULL-safe
-- NOT EXISTS form.
-- =====================================================================
INSERT INTO `attendance`
  (`student_id`, `course_id`, `percentage`, `academic_year`, `semester`)
SELECT `s`.`id`, `c`.`id`, `new`.`percentage`, NULL, NULL
FROM (
            SELECT '7376221CS101' AS `reg_number`, '19CS502' AS `code`,
                    94.00 AS `percentage`
  UNION ALL SELECT '7376221CS102', '19CS502',  98.00
  UNION ALL SELECT '7376221CS103', '19CS502',  82.00
  UNION ALL SELECT '7376221CS104', '19CS502',  91.00
  UNION ALL SELECT '7376221CS105', '19CS502',  79.00
  UNION ALL SELECT '7376221CS106', '19CS502',  96.00
  UNION ALL SELECT '7376221CS107', '19CS502',  85.00
  UNION ALL SELECT '7376221CS108', '19CS502',  88.00
  UNION ALL SELECT '7376221CS109', '19CS502',  71.00
  UNION ALL SELECT '7376221CS110', '19CS502', 100.00
  UNION ALL SELECT '7376221CS111', '19CS502',  90.00
  UNION ALL SELECT '7376221CS112', '19CS502',  93.00
) AS `new`
JOIN `students` AS `s` ON `s`.`reg_number` = `new`.`reg_number`
JOIN `courses`  AS `c` ON `c`.`code`       = `new`.`code`
WHERE NOT EXISTS (
  SELECT 1 FROM `attendance` AS `x`
  WHERE `x`.`student_id`    =   `s`.`id`
    AND `x`.`course_id`     =   `c`.`id`
    AND `x`.`academic_year` <=> NULL
    AND `x`.`semester`      <=> NULL
);


-- =====================================================================
-- 6. course_exit_survey  (5 rows -- mockData `courseExitSurvey`)
--
-- The indirect attainment level students reported for each CO of 19CS502.
--
-- (course_id, co_number) is UNIQUE and both are NOT NULL, so ON DUPLICATE KEY
-- UPDATE makes this idempotent.
-- =====================================================================
INSERT INTO `course_exit_survey` (`course_id`, `co_number`, `value`)
SELECT `c`.`id`, `new`.`co_number`, `new`.`value`
FROM (
            SELECT '19CS502' AS `code`, 1 AS `co_number`, 2.80 AS `value`
  UNION ALL SELECT '19CS502', 2, 2.70
  UNION ALL SELECT '19CS502', 3, 2.80
  UNION ALL SELECT '19CS502', 4, 2.70
  UNION ALL SELECT '19CS502', 5, 2.80
) AS `new`
JOIN `courses` AS `c` ON `c`.`code` = `new`.`code`
ON DUPLICATE KEY UPDATE
  `value` = `new`.`value`;


-- =====================================================================
-- 7. remedial_schedules  (1 row -- mockData `remedialSchedule`)
--
-- The fixture contains exactly one plan: 19CS502, after PT1, in Seminar
-- Hall B.
--
-- (course_id, assessment_kind) is UNIQUE and both are NOT NULL, so ON
-- DUPLICATE KEY UPDATE makes this idempotent.
-- =====================================================================
INSERT INTO `remedial_schedules` (`course_id`, `assessment_kind`, `venue`)
SELECT `c`.`id`, `new`.`assessment_kind`, `new`.`venue`
FROM (
  SELECT '19CS502' AS `code`, 'PT1' AS `assessment_kind`,
         'Seminar Hall B' AS `venue`
) AS `new`
JOIN `courses` AS `c` ON `c`.`code` = `new`.`code`
ON DUPLICATE KEY UPDATE
  `venue` = `new`.`venue`;


-- =====================================================================
-- 8. remedial_classes  (3 rows -- mockData `remedialSchedule[0].classes`)
--
-- One class per CO that needed remedial work after PT1: CO1, CO2 and CO3 --
-- exactly the three COs PT1 assesses.
--
-- schedule_id is resolved by joining remedial_schedules on its natural key
-- (course code + assessment kind), never by a hardcoded id.
--
-- The dates use the SQL DATE literal form so they are stored as dates, not
-- parsed from strings.
--
-- (schedule_id, co_number) is UNIQUE and both are NOT NULL, so ON DUPLICATE
-- KEY UPDATE makes this idempotent.
-- =====================================================================
INSERT INTO `remedial_classes` (`schedule_id`, `co_number`, `class_date`, `timing`)
SELECT `rs`.`id`, `new`.`co_number`, `new`.`class_date`, `new`.`timing`
FROM (
            SELECT '19CS502' AS `code`, 'PT1' AS `assessment_kind`,
                   1 AS `co_number`,
                   DATE '2025-08-20' AS `class_date`,
                   '4:30PM to 5:30PM' AS `timing`
  UNION ALL SELECT '19CS502', 'PT1', 2, DATE '2025-08-21', '4:30PM to 5:30PM'
  UNION ALL SELECT '19CS502', 'PT1', 3, DATE '2025-08-22', '4:30PM to 5:30PM'
) AS `new`
JOIN `courses`            AS `c`  ON `c`.`code` = `new`.`code`
JOIN `remedial_schedules` AS `rs` ON `rs`.`course_id`       = `c`.`id`
                                 AND `rs`.`assessment_kind` = `new`.`assessment_kind`
ON DUPLICATE KEY UPDATE
  `class_date` = `new`.`class_date`,
  `timing`     = `new`.`timing`;

-- =====================================================================
-- End of migration 009
-- =====================================================================
