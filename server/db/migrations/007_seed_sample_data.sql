-- =====================================================================
-- Migration: 007_seed_sample_data
--
-- !! SAMPLE DATA -- FOR TESTING ONLY. SKIP THIS FILE IN PRODUCTION. !!
--
--   Nothing in this file is real institutional data. The student names,
--   registration numbers, course codes, faculty names, marks, attainment
--   figures and CO/PO articulation values are ALL INVENTED. They exist so
--   that the portal has something to render and so that the attainment
--   calculations can be tested end to end.
--
--   DO NOT run this file on a production install. A production database is
--   populated from the institution's own student rolls, course list and
--   allocation sheet. Running 001 through 006 gives a complete and correct
--   EMPTY schema; this file is the only one that must be skipped.
--
--
-- SOURCE OF EVERY VALUE
--   client/src/data/mockData.js -- the same fixtures the React frontend
--   renders today. The values are transcribed VERBATIM so that the database
--   and the frontend hold identical figures while the API is being wired up.
--   Nothing here has been invented, rounded or adjusted relative to that
--   file. If a figure looks wrong, fix mockData.js and regenerate; do not
--   "correct" it here, or the two will disagree.
--
--
-- HOW FOREIGN KEYS ARE RESOLVED
--   Every insert resolves its foreign keys by NATURAL KEY -- course code,
--   registration number, faculty email, course-nature name, split-pattern
--   name, assessment kind -- and never by a hardcoded auto-increment id.
--   The mockData objects do carry numeric ids (courseId: 1, studentId: 7,
--   assessmentId: 3); those ids are used ONLY to work out which natural key
--   a row refers to, and none of them appear in the SQL below. The file
--   therefore runs correctly on any database, whatever ids the rows happen
--   to receive.
--
--
-- IDEMPOTENCY
--   Running this file twice produces no duplicates and no errors.
--   Most inserts achieve that with ON DUPLICATE KEY UPDATE on a unique key
--   whose columns are all NOT NULL. Two tables cannot: course_allocations
--   and student_enrolments have NULLABLE columns in their unique keys, and
--   MySQL treats NULLs as distinct, so the key would not catch a re-run.
--   Those two use INSERT ... SELECT ... WHERE NOT EXISTS with the NULL-safe
--   <=> operator instead. See the header of migration 006.
--
--
-- Depends on: 001 (course_natures, co_split_patterns via 002),
--             002 (co_split_patterns), 003 (students, courses),
--             004 (program_specific_outcomes, course_outcomes, co_po_matrix),
--             005 (assessments, co_allocations, student_assessments,
--                  student_co_marks),
--             006 (faculty, course_allocations, student_enrolments)
--   RUN THIS FILE LAST.
--
-- Rows seeded, per table:
--   students                     12
--   faculty                       3
--   courses                       3
--   course_allocations            3
--   student_enrolments           36
--   program_specific_outcomes     2
--   course_outcomes               5
--   co_po_matrix                 21
--   assessments                   6
--   co_allocations               16
--   student_assessments          63
--   student_co_marks             79
--   ------------------------------
--   TOTAL                       249
-- =====================================================================


-- =====================================================================
-- 1. students  (12 rows -- mockData `students`)
--
-- `reg_number` is UNIQUE, so ON DUPLICATE KEY UPDATE makes this idempotent.
-- =====================================================================
INSERT INTO `students` (`reg_number`, `name`, `current_sem`)
VALUES
  ('7376221CS101', 'Aravind Kumar S',      '5'),
  ('7376221CS102', 'Divya Bharathi R',     '5'),
  ('7376221CS103', 'Harish Venkatesan M',  '5'),
  ('7376221CS104', 'Keerthana Priya G',    '5'),
  ('7376221CS105', 'Manoj Prabhakaran T',  '5'),
  ('7376221CS106', 'Nandhini Devi K',      '5'),
  ('7376221CS107', 'Praveen Raj A',        '5'),
  ('7376221CS108', 'Ramya Shree V',        '5'),
  ('7376221CS109', 'Sanjay Balaji N',      '5'),
  ('7376221CS110', 'Swetha Lakshmi P',     '5'),
  ('7376221CS111', 'Vignesh Karthik D',    '5'),
  ('7376221CS112', 'Yamini Sundari J',     '5')
AS `new`
ON DUPLICATE KEY UPDATE
  `name`        = `new`.`name`,
  `current_sem` = `new`.`current_sem`;


-- =====================================================================
-- 2. faculty  (3 rows -- mockData `facultyList`)
--
-- `email` is UNIQUE, so ON DUPLICATE KEY UPDATE makes this idempotent.
-- is_active is left at its DEFAULT TRUE: mockData has no such field.
-- =====================================================================
INSERT INTO `faculty` (`name`, `email`, `department`, `designation`)
VALUES
  ('Balakrishnaraja', 'balakrishnaraja@bitsathy.ac.in',
     'Computer Science and Engineering',        'Assistant Professor'),
  ('Tamilselvi prof', 'tamilselvi@bitsathy.ac.in',
     'Computer Science and Engineering',        'Associate Professor'),
  ('Pavithra MKS',    'pavithramks@bitsathy.ac.in',
     'Artificial Intelligence and Data Science', 'Assistant Professor')
AS `new`
ON DUPLICATE KEY UPDATE
  `name`        = `new`.`name`,
  `department`  = `new`.`department`,
  `designation` = `new`.`designation`;


-- =====================================================================
-- 3. courses  (3 rows -- mockData `courses`)
--
-- nature_id is resolved by joining course_natures ON ITS NAME. mockData
-- stores natureId 1/2/3; those numbers are NOT used here. They were read
-- against mockData `courseNatures` to obtain the name, and the name is what
-- the join uses:
--   natureId 1 -> 'Theory'
--   natureId 2 -> 'Theory & Lab'
--   natureId 3 -> 'Mini Project I'
--
-- co_target_percent has NO DEFAULT on `courses` (see migration 003), so it is
-- supplied explicitly for every row.
--
-- `code` is UNIQUE, so ON DUPLICATE KEY UPDATE makes this idempotent.
-- =====================================================================
INSERT INTO `courses`
  (`code`, `title`, `nature_id`, `regulation_year`, `department`,
   `co_count`, `co_target_percent`)
SELECT
  `new`.`code`, `new`.`title`, `n`.`id`, `new`.`regulation_year`,
  `new`.`department`, `new`.`co_count`, `new`.`co_target_percent`
FROM (
            SELECT '19CS502' AS `code`,
                   'Database Management Systems' AS `title`,
                   'Theory & Lab'    AS `nature_name`,
                   2019              AS `regulation_year`,
                   'Computer Science and Engineering' AS `department`,
                   5                 AS `co_count`,
                   60.00             AS `co_target_percent`
  UNION ALL SELECT '19CS504', 'Theory of Computation',
                   'Theory',         2019,
                   'Computer Science and Engineering',          5, 55.00
  UNION ALL SELECT '19CS591', 'Mini Project I',
                   'Mini Project I', 2019,
                   'Artificial Intelligence and Data Science',  5, 60.00
) AS `new`
JOIN `course_natures` AS `n` ON `n`.`name` = `new`.`nature_name`
ON DUPLICATE KEY UPDATE
  `title`             = `new`.`title`,
  `nature_id`         = `n`.`id`,
  `regulation_year`   = `new`.`regulation_year`,
  `department`        = `new`.`department`,
  `co_count`          = `new`.`co_count`,
  `co_target_percent` = `new`.`co_target_percent`;


-- =====================================================================
-- 4. course_allocations  (3 rows)
--
-- !! NOT PRESENT IN mockData !!
--   mockData.js does NOT state which faculty member handles which course --
--   facultyList exists only to drive the mock sign-in screen. The three
--   allocations below were therefore CHOSEN HERE, not transcribed. The rule
--   used was the only sensible one available: match the faculty member's
--   department to the course's department, and give each of the three
--   faculty members one course.
--     19CS502 (CSE)  -> Balakrishnaraja  (CSE)
--     19CS504 (CSE)  -> Tamilselvi prof  (CSE)
--     19CS591 (AIDS) -> Pavithra MKS     (AIDS)
--   Replace these with the real allocation sheet when it is supplied.
--
-- role is 'handling' for all three; mockData says nothing about who owns each
-- course file, so no 'incharge' rows are invented.
--
-- academic_year / semester / section are left NULL because mockData does not
-- state them. That makes the unique key ineffective (MySQL treats NULLs as
-- distinct), so idempotency is enforced by NOT EXISTS with the NULL-safe
-- <=> operator instead of ON DUPLICATE KEY UPDATE.
-- =====================================================================
INSERT INTO `course_allocations`
  (`faculty_id`, `course_id`, `role`, `academic_year`, `semester`, `section`)
SELECT `f`.`id`, `c`.`id`, `new`.`role`, NULL, NULL, NULL
FROM (
            SELECT 'balakrishnaraja@bitsathy.ac.in' AS `email`,
                   '19CS502'  AS `code`,
                   'handling' AS `role`
  UNION ALL SELECT 'tamilselvi@bitsathy.ac.in',  '19CS504', 'handling'
  UNION ALL SELECT 'pavithramks@bitsathy.ac.in', '19CS591', 'handling'
) AS `new`
JOIN `faculty` AS `f` ON `f`.`email` = `new`.`email`
JOIN `courses` AS `c` ON `c`.`code`  = `new`.`code`
WHERE NOT EXISTS (
  SELECT 1 FROM `course_allocations` AS `x`
  WHERE `x`.`faculty_id`    =   `f`.`id`
    AND `x`.`course_id`     =   `c`.`id`
    AND `x`.`role`          =   `new`.`role`
    AND `x`.`academic_year` <=> NULL
    AND `x`.`semester`      <=> NULL
    AND `x`.`section`       <=> NULL
);


-- =====================================================================
-- 5. student_enrolments  (36 rows = 12 students x 3 courses)
--
-- Every student is enrolled in every course. That is what mockData shows:
-- `internalMarks` carries a row for all 12 students in each of the 3 courses.
--
-- academic_year / semester are left NULL for the same reason as above (the
-- students' currentSem is a property of the student, not of the enrolment,
-- so it is not copied here), and idempotency again uses NOT EXISTS with <=>.
-- =====================================================================
INSERT INTO `student_enrolments`
  (`student_id`, `course_id`, `academic_year`, `semester`)
SELECT `s`.`id`, `c`.`id`, NULL, NULL
FROM `students` AS `s`
CROSS JOIN `courses` AS `c`
WHERE `s`.`reg_number` IN (
        '7376221CS101', '7376221CS102', '7376221CS103', '7376221CS104',
        '7376221CS105', '7376221CS106', '7376221CS107', '7376221CS108',
        '7376221CS109', '7376221CS110', '7376221CS111', '7376221CS112')
  AND `c`.`code` IN ('19CS502', '19CS504', '19CS591')
  AND NOT EXISTS (
    SELECT 1 FROM `student_enrolments` AS `x`
    WHERE `x`.`student_id`    =   `s`.`id`
      AND `x`.`course_id`     =   `c`.`id`
      AND `x`.`academic_year` <=> NULL
      AND `x`.`semester`      <=> NULL
  );


-- =====================================================================
-- 6. program_specific_outcomes  (2 rows -- mockData `psoStatements`)
--
-- Source is `psoStatements`, which carries the department and the full text.
-- mockData also exports `programSpecificOutcomes` with THREE placeholder
-- codes (PSO1..PSO3), but those have no department and no real statement, so
-- they are not seeded -- psoStatements is the authoritative export.
--
-- (department, code) is UNIQUE and both columns are NOT NULL, so ON DUPLICATE
-- KEY UPDATE makes this idempotent.
-- =====================================================================
INSERT INTO `program_specific_outcomes` (`department`, `code`, `statement`)
VALUES
  ('Computer Science and Engineering', 'PSO1',
     'Apply the principles of data structures, databases, networks and software engineering to design and implement computing systems that meet specified requirements.'),
  ('Computer Science and Engineering', 'PSO2',
     'Use current programming platforms, tools and analytical methods to develop, test and evaluate software solutions for problems in science, industry and society.')
AS `new`
ON DUPLICATE KEY UPDATE
  `statement` = `new`.`statement`;


-- =====================================================================
-- 7. course_outcomes  (5 rows -- mockData `courseOutcomes`)
--
-- mockData defines COs for courseId 1 only, i.e. course code '19CS502'.
-- course_id is resolved by joining `courses` on that code.
--
-- (course_id, co_number) is UNIQUE, so ON DUPLICATE KEY UPDATE makes this
-- idempotent.
-- =====================================================================
INSERT INTO `course_outcomes` (`course_id`, `co_number`, `statement`)
SELECT `c`.`id`, `new`.`co_number`, `new`.`statement`
FROM (
            SELECT '19CS502' AS `code`, 1 AS `co_number`,
                   'Explain the architecture of a database system and the relational data model.' AS `statement`
  UNION ALL SELECT '19CS502', 2,
                   'Construct ER models and map them to normalised relational schemas.'
  UNION ALL SELECT '19CS502', 3,
                   'Write SQL queries to define, manipulate and retrieve relational data.'
  UNION ALL SELECT '19CS502', 4,
                   'Apply transaction, concurrency control and recovery techniques.'
  UNION ALL SELECT '19CS502', 5,
                   'Analyse indexing and query processing strategies for performance.'
) AS `new`
JOIN `courses` AS `c` ON `c`.`code` = `new`.`code`
ON DUPLICATE KEY UPDATE
  `statement` = `new`.`statement`;


-- =====================================================================
-- 8. co_po_matrix  (21 rows -- mockData `coPoMatrix`)
--
-- The articulation of 19CS502's five COs. Only cells that HAVE a correlation
-- appear -- an absent cell means no correlation, not zero. That is why the
-- counts per CO are uneven (3, 4, 5, 4, 5).
--
-- (course_id, co_number, outcome_type, outcome_code) is UNIQUE, so ON
-- DUPLICATE KEY UPDATE makes this idempotent.
-- =====================================================================
INSERT INTO `co_po_matrix`
  (`course_id`, `co_number`, `outcome_type`, `outcome_code`, `value`)
SELECT `c`.`id`, `new`.`co_number`, `new`.`outcome_type`,
       `new`.`outcome_code`, `new`.`value`
FROM (
  -- CO1
              SELECT '19CS502' AS `code`, 1 AS `co_number`,
                     'PO'  AS `outcome_type`, 'PO1'  AS `outcome_code`, 3 AS `value`
    UNION ALL SELECT '19CS502', 1, 'PO',  'PO2',  2
    UNION ALL SELECT '19CS502', 1, 'PSO', 'PSO1', 2
  -- CO2
    UNION ALL SELECT '19CS502', 2, 'PO',  'PO1',  3
    UNION ALL SELECT '19CS502', 2, 'PO',  'PO2',  3
    UNION ALL SELECT '19CS502', 2, 'PO',  'PO3',  2
    UNION ALL SELECT '19CS502', 2, 'PSO', 'PSO1', 3
  -- CO3
    UNION ALL SELECT '19CS502', 3, 'PO',  'PO1',  3
    UNION ALL SELECT '19CS502', 3, 'PO',  'PO3',  2
    UNION ALL SELECT '19CS502', 3, 'PO',  'PO5',  2
    UNION ALL SELECT '19CS502', 3, 'PSO', 'PSO1', 3
    UNION ALL SELECT '19CS502', 3, 'PSO', 'PSO2', 2
  -- CO4
    UNION ALL SELECT '19CS502', 4, 'PO',  'PO1',  2
    UNION ALL SELECT '19CS502', 4, 'PO',  'PO2',  3
    UNION ALL SELECT '19CS502', 4, 'PO',  'PO4',  2
    UNION ALL SELECT '19CS502', 4, 'PSO', 'PSO1', 2
  -- CO5
    UNION ALL SELECT '19CS502', 5, 'PO',  'PO2',  3
    UNION ALL SELECT '19CS502', 5, 'PO',  'PO4',  2
    UNION ALL SELECT '19CS502', 5, 'PO',  'PO5',  2
    UNION ALL SELECT '19CS502', 5, 'PO',  'PO12', 1
    UNION ALL SELECT '19CS502', 5, 'PSO', 'PSO2', 2
) AS `new`
JOIN `courses` AS `c` ON `c`.`code` = `new`.`code`
ON DUPLICATE KEY UPDATE
  `value` = `new`.`value`;


-- =====================================================================
-- 9. assessments  (6 rows -- mockData `assessments`)
--
-- co_split_pattern_id is resolved by joining co_split_patterns ON ITS NAME,
-- never by a hardcoded id. The join is a LEFT JOIN because the three 'manual'
-- assessments have no pattern: their pattern_name is NULL, so `p`.`id`
-- resolves to NULL, which is exactly the value the column should hold.
--
-- Which assessments use which mode (straight from mockData `splitMode`):
--   PT1, PT2, OT -> 'lookup', max 50, pattern 'PT 50 (20/20/10)'
--   IP1, IP2     -> 'manual', max 10, no pattern
--   SEE          -> 'manual', max 100, no pattern
--
-- (course_id, kind) is UNIQUE, so ON DUPLICATE KEY UPDATE makes this
-- idempotent.
-- =====================================================================
INSERT INTO `assessments`
  (`course_id`, `kind`, `max_total`, `conducted_on`,
   `split_mode`, `co_split_pattern_id`)
SELECT `c`.`id`, `new`.`kind`, `new`.`max_total`, `new`.`conducted_on`,
       `new`.`split_mode`, `p`.`id`
FROM (
            SELECT '19CS502' AS `code`, 'PT1' AS `kind`,
                    50.00 AS `max_total`, DATE '2025-08-14' AS `conducted_on`,
                   'lookup' AS `split_mode`,
                   'PT 50 (20/20/10)' AS `pattern_name`
  UNION ALL SELECT '19CS502', 'PT2',  50.00, DATE '2025-10-09', 'lookup', 'PT 50 (20/20/10)'
  UNION ALL SELECT '19CS502', 'IP1',  10.00, DATE '2025-09-05', 'manual', NULL
  UNION ALL SELECT '19CS502', 'IP2',  10.00, DATE '2025-10-24', 'manual', NULL
  UNION ALL SELECT '19CS502', 'SEE', 100.00, DATE '2025-11-28', 'manual', NULL
  UNION ALL SELECT '19CS502', 'OT',   50.00, DATE '2025-11-07', 'lookup', 'PT 50 (20/20/10)'
) AS `new`
JOIN      `courses`           AS `c` ON `c`.`code` = `new`.`code`
LEFT JOIN `co_split_patterns` AS `p` ON `p`.`name` = `new`.`pattern_name`
ON DUPLICATE KEY UPDATE
  `max_total`           = `new`.`max_total`,
  `conducted_on`        = `new`.`conducted_on`,
  `split_mode`          = `new`.`split_mode`,
  `co_split_pattern_id` = `p`.`id`;


-- =====================================================================
-- 10. co_allocations  (16 rows -- mockData `coAllocations`)
--
-- assessment_id is resolved by joining `assessments` on its natural key
-- (course code + kind), never by the assessmentId numbers in mockData.
--
--   PT1 -> CO1 20, CO2 20, CO3 10   (total 50)
--   PT2 -> CO3 10, CO4 20, CO5 20   (total 50)
--   IP1 -> CO2 10                   (total 10)
--   IP2 -> CO4 10                   (total 10)
--   SEE -> CO1..CO5 20 each         (total 100)
--   OT  -> CO1 20, CO2 20, CO3 10   (total 50)
--
-- (assessment_id, co_number) is UNIQUE, so ON DUPLICATE KEY UPDATE makes this
-- idempotent.
-- =====================================================================
INSERT INTO `co_allocations` (`assessment_id`, `co_number`, `marks_allocated`)
SELECT `a`.`id`, `new`.`co_number`, `new`.`marks_allocated`
FROM (
              SELECT '19CS502' AS `code`, 'PT1' AS `kind`,
                     1 AS `co_number`, 20.00 AS `marks_allocated`
    UNION ALL SELECT '19CS502', 'PT1', 2, 20.00
    UNION ALL SELECT '19CS502', 'PT1', 3, 10.00
    UNION ALL SELECT '19CS502', 'PT2', 3, 10.00
    UNION ALL SELECT '19CS502', 'PT2', 4, 20.00
    UNION ALL SELECT '19CS502', 'PT2', 5, 20.00
    UNION ALL SELECT '19CS502', 'IP1', 2, 10.00
    UNION ALL SELECT '19CS502', 'IP2', 4, 10.00
    UNION ALL SELECT '19CS502', 'SEE', 1, 20.00
    UNION ALL SELECT '19CS502', 'SEE', 2, 20.00
    UNION ALL SELECT '19CS502', 'SEE', 3, 20.00
    UNION ALL SELECT '19CS502', 'SEE', 4, 20.00
    UNION ALL SELECT '19CS502', 'SEE', 5, 20.00
    UNION ALL SELECT '19CS502', 'OT',  1, 20.00
    UNION ALL SELECT '19CS502', 'OT',  2, 20.00
    UNION ALL SELECT '19CS502', 'OT',  3, 10.00
) AS `new`
JOIN `courses`     AS `c` ON `c`.`code` = `new`.`code`
JOIN `assessments` AS `a` ON `a`.`course_id` = `c`.`id`
                         AND `a`.`kind`      = `new`.`kind`
ON DUPLICATE KEY UPDATE
  `marks_allocated` = `new`.`marks_allocated`;


-- =====================================================================
-- 11. student_assessments  (63 rows -- mockData `studentAssessments`)
--
-- assessment_id is resolved from (course code + kind); student_id from the
-- registration number. mockData's assessmentId / studentId numbers do not
-- appear below.
--
-- Absences, exactly as mockData records them:
--   - Praveen Raj A (7376221CS107) is absent for PT1 and only PT1. He sat
--     PT2, and his optional-test mark substitutes for that single absence.
--   - Keerthana Priya G (7376221CS104) is absent for SEE and only SEE.
--   Both absent rows carry total_obtained = NULL, not 0.
--
-- OT has only 3 rows: it is an optional improvement test and only three
-- students opted in. A student who did not sit it has NO row at all, which is
-- a different state from being absent.
--
-- (assessment_id, student_id) is UNIQUE, so ON DUPLICATE KEY UPDATE makes
-- this idempotent.
-- =====================================================================
INSERT INTO `student_assessments`
  (`assessment_id`, `student_id`, `total_obtained`, `is_absent`)
SELECT `a`.`id`, `s`.`id`, `new`.`total_obtained`, `new`.`is_absent`
FROM (
  -- PT1 (lookup, max 50) -- 7376221CS107 absent
              SELECT '19CS502' AS `code`, 'PT1' AS `kind`,
                     '7376221CS101' AS `reg_number`,
                     42.00 AS `total_obtained`, 0 AS `is_absent`
    UNION ALL SELECT '19CS502', 'PT1', '7376221CS102', 47.00, 0
    UNION ALL SELECT '19CS502', 'PT1', '7376221CS103', 28.00, 0
    UNION ALL SELECT '19CS502', 'PT1', '7376221CS104', 39.00, 0
    UNION ALL SELECT '19CS502', 'PT1', '7376221CS105', 21.00, 0
    UNION ALL SELECT '19CS502', 'PT1', '7376221CS106', 45.00, 0
    UNION ALL SELECT '19CS502', 'PT1', '7376221CS107',  NULL, 1
    UNION ALL SELECT '19CS502', 'PT1', '7376221CS108', 33.00, 0
    UNION ALL SELECT '19CS502', 'PT1', '7376221CS109', 18.00, 0
    UNION ALL SELECT '19CS502', 'PT1', '7376221CS110', 50.00, 0
    UNION ALL SELECT '19CS502', 'PT1', '7376221CS111', 36.00, 0
    UNION ALL SELECT '19CS502', 'PT1', '7376221CS112', 44.00, 0

  -- PT2 (lookup, max 50) -- everyone present
    UNION ALL SELECT '19CS502', 'PT2', '7376221CS101', 44.00, 0
    UNION ALL SELECT '19CS502', 'PT2', '7376221CS102', 47.00, 0
    UNION ALL SELECT '19CS502', 'PT2', '7376221CS103', 24.00, 0
    UNION ALL SELECT '19CS502', 'PT2', '7376221CS104', 35.00, 0
    UNION ALL SELECT '19CS502', 'PT2', '7376221CS105', 21.00, 0
    UNION ALL SELECT '19CS502', 'PT2', '7376221CS106', 38.00, 0
    UNION ALL SELECT '19CS502', 'PT2', '7376221CS107', 33.00, 0
    UNION ALL SELECT '19CS502', 'PT2', '7376221CS108', 32.00, 0
    UNION ALL SELECT '19CS502', 'PT2', '7376221CS109', 18.00, 0
    UNION ALL SELECT '19CS502', 'PT2', '7376221CS110', 29.00, 0
    UNION ALL SELECT '19CS502', 'PT2', '7376221CS111', 33.00, 0
    UNION ALL SELECT '19CS502', 'PT2', '7376221CS112', 27.00, 0

  -- IP1 (manual, max 10) -- total equals the CO2 mark
    UNION ALL SELECT '19CS502', 'IP1', '7376221CS101',  9.00, 0
    UNION ALL SELECT '19CS502', 'IP1', '7376221CS102', 10.00, 0
    UNION ALL SELECT '19CS502', 'IP1', '7376221CS103',  7.00, 0
    UNION ALL SELECT '19CS502', 'IP1', '7376221CS104',  8.00, 0
    UNION ALL SELECT '19CS502', 'IP1', '7376221CS105',  5.00, 0
    UNION ALL SELECT '19CS502', 'IP1', '7376221CS106',  9.00, 0
    UNION ALL SELECT '19CS502', 'IP1', '7376221CS107',  7.00, 0
    UNION ALL SELECT '19CS502', 'IP1', '7376221CS108',  6.00, 0
    UNION ALL SELECT '19CS502', 'IP1', '7376221CS109',  4.00, 0
    UNION ALL SELECT '19CS502', 'IP1', '7376221CS110', 10.00, 0
    UNION ALL SELECT '19CS502', 'IP1', '7376221CS111',  8.00, 0
    UNION ALL SELECT '19CS502', 'IP1', '7376221CS112',  5.00, 0

  -- IP2 (manual, max 10) -- total equals the CO4 mark
    UNION ALL SELECT '19CS502', 'IP2', '7376221CS101',  8.00, 0
    UNION ALL SELECT '19CS502', 'IP2', '7376221CS102',  9.00, 0
    UNION ALL SELECT '19CS502', 'IP2', '7376221CS103',  5.00, 0
    UNION ALL SELECT '19CS502', 'IP2', '7376221CS104',  7.00, 0
    UNION ALL SELECT '19CS502', 'IP2', '7376221CS105',  4.00, 0
    UNION ALL SELECT '19CS502', 'IP2', '7376221CS106',  8.00, 0
    UNION ALL SELECT '19CS502', 'IP2', '7376221CS107',  6.00, 0
    UNION ALL SELECT '19CS502', 'IP2', '7376221CS108',  5.00, 0
    UNION ALL SELECT '19CS502', 'IP2', '7376221CS109',  3.00, 0
    UNION ALL SELECT '19CS502', 'IP2', '7376221CS110',  9.00, 0
    UNION ALL SELECT '19CS502', 'IP2', '7376221CS111',  5.00, 0
    UNION ALL SELECT '19CS502', 'IP2', '7376221CS112',  4.00, 0

  -- SEE (manual, max 100) -- totals are the sum of CO1..CO5.
  -- 7376221CS104 absent here, and only here.
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS101', 73.00, 0
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS102', 84.00, 0
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS103', 52.00, 0
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS104',  NULL, 1
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS105', 40.00, 0
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS106', 75.00, 0
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS107', 58.00, 0
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS108', 61.00, 0
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS109', 35.00, 0
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS110', 82.00, 0
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS111', 65.00, 0
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS112', 71.00, 0

  -- OT (lookup, max 50) -- only the students who opted in
    UNION ALL SELECT '19CS502', 'OT',  '7376221CS105', 34.00, 0
    UNION ALL SELECT '19CS502', 'OT',  '7376221CS109', 29.00, 0
    UNION ALL SELECT '19CS502', 'OT',  '7376221CS107', 34.00, 0
) AS `new`
JOIN `courses`     AS `c` ON `c`.`code` = `new`.`code`
JOIN `assessments` AS `a` ON `a`.`course_id` = `c`.`id`
                         AND `a`.`kind`      = `new`.`kind`
JOIN `students`    AS `s` ON `s`.`reg_number` = `new`.`reg_number`
ON DUPLICATE KEY UPDATE
  `total_obtained` = `new`.`total_obtained`,
  `is_absent`      = `new`.`is_absent`;


-- =====================================================================
-- 12. student_co_marks  (79 rows -- mockData `studentCoMarks`)
--
-- student_assessment_id is resolved by JOINING all the way down from the
-- natural keys -- course code + assessment kind gives the assessment,
-- registration number gives the student, and the two together find the
-- student_assessments row inserted in step 11. No id from mockData is used.
--
-- Only the three 'manual' assessments appear here:
--   IP1 -> CO2 only,     out of 10  (12 rows)
--   IP2 -> CO4 only,     out of 10  (12 rows)
--   SEE -> CO1..CO5,     out of 20  (11 students x 5 = 55 rows)
-- PT1, PT2 and OT are in 'lookup' mode, so they deliberately have NO rows
-- here: their per-CO breakdown is derived from co_split_values.
--
-- 7376221CS104 is absent for SEE and therefore has no SEE rows at all, which
-- is why SEE has 11 students and not 12.
--
-- (student_assessment_id, co_number) is UNIQUE, so ON DUPLICATE KEY UPDATE
-- makes this idempotent.
-- =====================================================================
INSERT INTO `student_co_marks`
  (`student_assessment_id`, `co_number`, `marks_obtained`)
SELECT `sa`.`id`, `new`.`co_number`, `new`.`marks_obtained`
FROM (
  -- IP1 -- CO2 only, out of 10
              SELECT '19CS502' AS `code`, 'IP1' AS `kind`,
                     '7376221CS101' AS `reg_number`,
                     2 AS `co_number`, 9.00 AS `marks_obtained`
    UNION ALL SELECT '19CS502', 'IP1', '7376221CS102', 2, 10.00
    UNION ALL SELECT '19CS502', 'IP1', '7376221CS103', 2,  7.00
    UNION ALL SELECT '19CS502', 'IP1', '7376221CS104', 2,  8.00
    UNION ALL SELECT '19CS502', 'IP1', '7376221CS105', 2,  5.00
    UNION ALL SELECT '19CS502', 'IP1', '7376221CS106', 2,  9.00
    UNION ALL SELECT '19CS502', 'IP1', '7376221CS107', 2,  7.00
    UNION ALL SELECT '19CS502', 'IP1', '7376221CS108', 2,  6.00
    UNION ALL SELECT '19CS502', 'IP1', '7376221CS109', 2,  4.00
    UNION ALL SELECT '19CS502', 'IP1', '7376221CS110', 2, 10.00
    UNION ALL SELECT '19CS502', 'IP1', '7376221CS111', 2,  8.00
    UNION ALL SELECT '19CS502', 'IP1', '7376221CS112', 2,  5.00

  -- IP2 -- CO4 only, out of 10
    UNION ALL SELECT '19CS502', 'IP2', '7376221CS101', 4,  8.00
    UNION ALL SELECT '19CS502', 'IP2', '7376221CS102', 4,  9.00
    UNION ALL SELECT '19CS502', 'IP2', '7376221CS103', 4,  5.00
    UNION ALL SELECT '19CS502', 'IP2', '7376221CS104', 4,  7.00
    UNION ALL SELECT '19CS502', 'IP2', '7376221CS105', 4,  4.00
    UNION ALL SELECT '19CS502', 'IP2', '7376221CS106', 4,  8.00
    UNION ALL SELECT '19CS502', 'IP2', '7376221CS107', 4,  6.00
    UNION ALL SELECT '19CS502', 'IP2', '7376221CS108', 4,  5.00
    UNION ALL SELECT '19CS502', 'IP2', '7376221CS109', 4,  3.00
    UNION ALL SELECT '19CS502', 'IP2', '7376221CS110', 4,  9.00
    UNION ALL SELECT '19CS502', 'IP2', '7376221CS111', 4,  5.00
    UNION ALL SELECT '19CS502', 'IP2', '7376221CS112', 4,  4.00

  -- SEE -- CO1..CO5, each out of 20. 7376221CS104 is absent, so has no rows.
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS101', 1, 17.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS101', 2, 15.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS101', 3, 16.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS101', 4, 13.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS101', 5, 12.00

    UNION ALL SELECT '19CS502', 'SEE', '7376221CS102', 1, 19.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS102', 2, 18.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS102', 3, 17.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS102', 4, 16.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS102', 5, 14.00

    UNION ALL SELECT '19CS502', 'SEE', '7376221CS103', 1, 13.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS103', 2, 11.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS103', 3, 11.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS103', 4,  9.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS103', 5,  8.00

    UNION ALL SELECT '19CS502', 'SEE', '7376221CS105', 1, 10.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS105', 2,  8.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS105', 3,  9.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS105', 4,  7.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS105', 5,  6.00

    UNION ALL SELECT '19CS502', 'SEE', '7376221CS106', 1, 18.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS106', 2, 16.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS106', 3, 15.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS106', 4, 14.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS106', 5, 12.00

    UNION ALL SELECT '19CS502', 'SEE', '7376221CS107', 1, 14.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS107', 2, 11.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS107', 3, 13.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS107', 4, 11.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS107', 5,  9.00

    UNION ALL SELECT '19CS502', 'SEE', '7376221CS108', 1, 15.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS108', 2, 13.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS108', 3, 11.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS108', 4, 12.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS108', 5, 10.00

    UNION ALL SELECT '19CS502', 'SEE', '7376221CS109', 1,  9.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS109', 2,  7.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS109', 3,  8.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS109', 4,  6.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS109', 5,  5.00

    UNION ALL SELECT '19CS502', 'SEE', '7376221CS110', 1, 19.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS110', 2, 17.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS110', 3, 18.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS110', 4, 15.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS110', 5, 13.00

    UNION ALL SELECT '19CS502', 'SEE', '7376221CS111', 1, 16.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS111', 2, 14.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS111', 3, 13.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS111', 4, 11.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS111', 5, 11.00

    UNION ALL SELECT '19CS502', 'SEE', '7376221CS112', 1, 17.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS112', 2, 15.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS112', 3, 14.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS112', 4, 13.00
    UNION ALL SELECT '19CS502', 'SEE', '7376221CS112', 5, 12.00
) AS `new`
JOIN `courses`             AS `c`  ON `c`.`code` = `new`.`code`
JOIN `assessments`         AS `a`  ON `a`.`course_id` = `c`.`id`
                                  AND `a`.`kind`      = `new`.`kind`
JOIN `students`            AS `s`  ON `s`.`reg_number` = `new`.`reg_number`
JOIN `student_assessments` AS `sa` ON `sa`.`assessment_id` = `a`.`id`
                                  AND `sa`.`student_id`    = `s`.`id`
ON DUPLICATE KEY UPDATE
  `marks_obtained` = `new`.`marks_obtained`;

-- =====================================================================
-- End of migration 007
-- =====================================================================
