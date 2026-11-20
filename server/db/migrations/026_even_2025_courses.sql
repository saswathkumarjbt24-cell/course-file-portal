SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- MySQL Workbench refuses a DELETE whose WHERE has no indexed column.
-- This is session-scoped and harmless on the command line.
SET SQL_SAFE_UPDATES = 0;

-- =====================================================================
-- Migration: 026_even_2025_courses
--
-- Replaces the ODD 2025-2026 Biotechnology courses with the 22 EVEN
-- 2025-2026 courses from the department's allocation sheet
-- (BT_Coursewise_Allocation_-_2025-26_EVEN).
--
-- THIS DELETES 22BT009 AND ALL ITS REAL DATA. 35 students, PT1/PT2
-- marks, attainment, remedial lists and question papers go with it,
-- by cascade. JSK decided this on 20 Nov 2026. TAKE A MYSQLDUMP FIRST.
--
-- Runs AFTER 014 and 020, so the delete sticks even though those two
-- re-insert the ODD rows on every deploy. Re-runnable: the delete is
-- idempotent and every insert is guarded by NOT EXISTS.
--
-- Nature comes from the sheet's Course Nature column. Where a course
-- listed more than one (22BT402, 22BT404, 22BT602) its credits were
-- identical on every row at 3-0-2, so it is Theory & Lab.
--
-- MINI PROJECT II and PROJECT WORK II are filed under nature
-- 'Mini Project I' because the portal has no other project nature.
-- Same workaround 020 used for PROJECT WORK I. The department must
-- supply real mark thresholds before these two mean anything.
--
-- Faculty named in the sheet with no portal account are NOT allocated
-- and NO accounts are created (JSK, 20 Nov): Suresh Chaluvadi,
-- Kirupa Sankar M, Dhivya Dharshini U, Sandhyarani R, Kumaresan G,
-- Dinesh D, Prakash K B, Sivarahini K, Pidathala Sahitya.
-- Consequence: 22BT402, 22BT010, 22BT036, 22BT004, 22BT607 and
-- 22BT801 have no handling faculty and are admin-visible only.
--
-- Saranya S is saranya@bitsathy.ac.in in the sheet but
-- saranyas@bitsathy.ac.in in the portal. Allocated to the existing
-- account. If the portal address is the wrong one she cannot sign in.
-- =====================================================================

START TRANSACTION;

-- 1. Remove the ODD 2025-2026 courses. Cascade clears every child row.
DELETE FROM courses
 WHERE academic_year = '2025 - 2026'
   AND semester IN ('III','V','VII');

-- 2. The 22 EVEN 2025-2026 courses.
INSERT INTO courses (code, title, nature_id, department, programme, batch,
                     academic_year, year_of_study, semester, co_target_percent)
SELECT '22BT401', 'BIOORGANIC CHEMISTRY', n.id, 'Biotechnology', 'B.Tech. Biotechnology',
       '2024 - 2028', '2025 - 2026', 'II', 'IV', 60.00
  FROM course_natures n WHERE n.name = 'Theory & Lab'
   AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.code = '22BT401');
INSERT INTO courses (code, title, nature_id, department, programme, batch,
                     academic_year, year_of_study, semester, co_target_percent)
SELECT '22BT402', 'HEAT AND MASS TRANSFER', n.id, 'Biotechnology', 'B.Tech. Biotechnology',
       '2024 - 2028', '2025 - 2026', 'II', 'IV', 60.00
  FROM course_natures n WHERE n.name = 'Theory & Lab'
   AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.code = '22BT402');
INSERT INTO courses (code, title, nature_id, department, programme, batch,
                     academic_year, year_of_study, semester, co_target_percent)
SELECT '22BT403', 'CELL AND MOLECULAR BIOLOGY', n.id, 'Biotechnology', 'B.Tech. Biotechnology',
       '2024 - 2028', '2025 - 2026', 'II', 'IV', 60.00
  FROM course_natures n WHERE n.name = 'Theory & Lab'
   AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.code = '22BT403');
INSERT INTO courses (code, title, nature_id, department, programme, batch,
                     academic_year, year_of_study, semester, co_target_percent)
SELECT '22BT404', 'INSTRUMENTAL METHODS OF ANALYSIS', n.id, 'Biotechnology', 'B.Tech. Biotechnology',
       '2024 - 2028', '2025 - 2026', 'II', 'IV', 60.00
  FROM course_natures n WHERE n.name = 'Theory & Lab'
   AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.code = '22BT404');
INSERT INTO courses (code, title, nature_id, department, programme, batch,
                     academic_year, year_of_study, semester, co_target_percent)
SELECT '22BT405', 'PLANT TISSUE CULTURE', n.id, 'Biotechnology', 'B.Tech. Biotechnology',
       '2024 - 2028', '2025 - 2026', 'II', 'IV', 60.00
  FROM course_natures n WHERE n.name = 'Theory & Lab'
   AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.code = '22BT405');
INSERT INTO courses (code, title, nature_id, department, programme, batch,
                     academic_year, year_of_study, semester, co_target_percent)
SELECT '22BT012', 'BIODIVERSITY AND AGROFORESTRY', n.id, 'Biotechnology', 'B.Tech. Biotechnology',
       '2024 - 2028', '2025 - 2026', 'II', 'IV', 60.00
  FROM course_natures n WHERE n.name = 'Theory'
   AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.code = '22BT012');
INSERT INTO courses (code, title, nature_id, department, programme, batch,
                     academic_year, year_of_study, semester, co_target_percent)
SELECT '22BT003', 'ENVIRONMENTAL BIOTECHNOLOGY', n.id, 'Biotechnology', 'B.Tech. Biotechnology',
       '2024 - 2028', '2025 - 2026', 'II', 'IV', 60.00
  FROM course_natures n WHERE n.name = 'Theory'
   AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.code = '22BT003');
INSERT INTO courses (code, title, nature_id, department, programme, batch,
                     academic_year, year_of_study, semester, co_target_percent)
SELECT '22BT601', 'DOWNSTREAM PROCESSING', n.id, 'Biotechnology', 'B.Tech. Biotechnology',
       '2023 - 2027', '2025 - 2026', 'III', 'VI', 60.00
  FROM course_natures n WHERE n.name = 'Theory & Lab'
   AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.code = '22BT601');
INSERT INTO courses (code, title, nature_id, department, programme, batch,
                     academic_year, year_of_study, semester, co_target_percent)
SELECT '22BT602', 'IMMUNOLOGY', n.id, 'Biotechnology', 'B.Tech. Biotechnology',
       '2023 - 2027', '2025 - 2026', 'III', 'VI', 60.00
  FROM course_natures n WHERE n.name = 'Theory & Lab'
   AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.code = '22BT602');
INSERT INTO courses (code, title, nature_id, department, programme, batch,
                     academic_year, year_of_study, semester, co_target_percent)
SELECT '22BT603', 'ENZYME AND PROTEIN ENGINEERING', n.id, 'Biotechnology', 'B.Tech. Biotechnology',
       '2023 - 2027', '2025 - 2026', 'III', 'VI', 60.00
  FROM course_natures n WHERE n.name = 'Theory & Lab'
   AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.code = '22BT603');
INSERT INTO courses (code, title, nature_id, department, programme, batch,
                     academic_year, year_of_study, semester, co_target_percent)
SELECT '22BT036', 'MOLECULAR THERAPEUTICS AND DIAGNOSTICS', n.id, 'Biotechnology', 'B.Tech. Biotechnology',
       '2023 - 2027', '2025 - 2026', 'III', 'VI', 60.00
  FROM course_natures n WHERE n.name = 'Theory'
   AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.code = '22BT036');
INSERT INTO courses (code, title, nature_id, department, programme, batch,
                     academic_year, year_of_study, semester, co_target_percent)
SELECT '22BT042', 'CLINICAL TRIALS AND HEALTHCARE POLICIES IN BIOTECHNOLOGY', n.id, 'Biotechnology', 'B.Tech. Biotechnology',
       '2023 - 2027', '2025 - 2026', 'III', 'VI', 60.00
  FROM course_natures n WHERE n.name = 'Theory'
   AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.code = '22BT042');
INSERT INTO courses (code, title, nature_id, department, programme, batch,
                     academic_year, year_of_study, semester, co_target_percent)
SELECT '22BT046', 'BIOSAFETY AND HAZARD MANAGEMENT', n.id, 'Biotechnology', 'B.Tech. Biotechnology',
       '2023 - 2027', '2025 - 2026', 'III', 'VI', 60.00
  FROM course_natures n WHERE n.name = 'Theory'
   AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.code = '22BT046');
INSERT INTO courses (code, title, nature_id, department, programme, batch,
                     academic_year, year_of_study, semester, co_target_percent)
SELECT '22BT004', 'BIOENERGY AND BIOFUELS', n.id, 'Biotechnology', 'B.Tech. Biotechnology',
       '2023 - 2027', '2025 - 2026', 'III', 'VI', 60.00
  FROM course_natures n WHERE n.name = 'Theory'
   AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.code = '22BT004');
INSERT INTO courses (code, title, nature_id, department, programme, batch,
                     academic_year, year_of_study, semester, co_target_percent)
SELECT '22BT040', 'VACCINE TECHNOLOGY', n.id, 'Biotechnology', 'B.Tech. Biotechnology',
       '2023 - 2027', '2025 - 2026', 'III', 'VI', 60.00
  FROM course_natures n WHERE n.name = 'Theory'
   AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.code = '22BT040');
INSERT INTO courses (code, title, nature_id, department, programme, batch,
                     academic_year, year_of_study, semester, co_target_percent)
SELECT '22BT010', 'FOOD PROCESS AND TECHNOLOGY', n.id, 'Biotechnology', 'B.Tech. Biotechnology',
       '2023 - 2027', '2025 - 2026', 'III', 'VI', 60.00
  FROM course_natures n WHERE n.name = 'Theory'
   AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.code = '22BT010');
INSERT INTO courses (code, title, nature_id, department, programme, batch,
                     academic_year, year_of_study, semester, co_target_percent)
SELECT '22BT013', 'BIOSENSORS', n.id, 'Biotechnology', 'B.Tech. Biotechnology',
       '2023 - 2027', '2025 - 2026', 'III', 'VI', 60.00
  FROM course_natures n WHERE n.name = 'Theory'
   AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.code = '22BT013');
INSERT INTO courses (code, title, nature_id, department, programme, batch,
                     academic_year, year_of_study, semester, co_target_percent)
SELECT '22OBT01', 'BIOFUELS', n.id, 'Biotechnology', 'B.Tech. Biotechnology',
       '2023 - 2027', '2025 - 2026', 'III', 'VI', 60.00
  FROM course_natures n WHERE n.name = 'Theory'
   AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.code = '22OBT01');
INSERT INTO courses (code, title, nature_id, department, programme, batch,
                     academic_year, year_of_study, semester, co_target_percent)
SELECT '22BTH30', 'ANIMAL CELL CULTURE TECHNIQUES', n.id, 'Biotechnology', 'B.Tech. Biotechnology',
       '2023 - 2027', '2025 - 2026', 'III', 'VI', 60.00
  FROM course_natures n WHERE n.name = 'Theory'
   AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.code = '22BTH30');
INSERT INTO courses (code, title, nature_id, department, programme, batch,
                     academic_year, year_of_study, semester, co_target_percent)
SELECT '22BTH31', 'BIOTECHNIQUES IN ANIMAL BREEDING', n.id, 'Biotechnology', 'B.Tech. Biotechnology',
       '2023 - 2027', '2025 - 2026', 'III', 'VI', 60.00
  FROM course_natures n WHERE n.name = 'Theory'
   AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.code = '22BTH31');
INSERT INTO courses (code, title, nature_id, department, programme, batch,
                     academic_year, year_of_study, semester, co_target_percent)
SELECT '22BT607', 'MINI PROJECT II', n.id, 'Biotechnology', 'B.Tech. Biotechnology',
       '2023 - 2027', '2025 - 2026', 'III', 'VI', 60.00
  FROM course_natures n WHERE n.name = 'Mini Project I'
   AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.code = '22BT607');
INSERT INTO courses (code, title, nature_id, department, programme, batch,
                     academic_year, year_of_study, semester, co_target_percent)
SELECT '22BT801', 'PROJECT WORK II', n.id, 'Biotechnology', 'B.Tech. Biotechnology',
       '2022 - 2026', '2025 - 2026', 'IV', 'VIII', 60.00
  FROM course_natures n WHERE n.name = 'Mini Project I'
   AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.code = '22BT801');

-- 3. Handling allocations (who teaches it; this is what makes a course
--    reachable by that faculty member).
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'handling', '2025 - 2026', 'IV', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT401'
 WHERE f.email = 'tamilselvis@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'handling'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'IV' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'handling', '2025 - 2026', 'IV', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT403'
 WHERE f.email = 'vinodhinirt@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'handling'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'IV' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'handling', '2025 - 2026', 'IV', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT403'
 WHERE f.email = 'mahimap@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'handling'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'IV' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'handling', '2025 - 2026', 'IV', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT404'
 WHERE f.email = 'shankariv@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'handling'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'IV' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'handling', '2025 - 2026', 'IV', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT404'
 WHERE f.email = 'rajaseetharama@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'handling'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'IV' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'handling', '2025 - 2026', 'IV', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT404'
 WHERE f.email = 'nandhinin@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'handling'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'IV' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'handling', '2025 - 2026', 'IV', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT405'
 WHERE f.email = 'kannankp@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'handling'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'IV' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'handling', '2025 - 2026', 'IV', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT405'
 WHERE f.email = 'pavithramks@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'handling'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'IV' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'handling', '2025 - 2026', 'IV', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT012'
 WHERE f.email = 'sakthishobanak@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'handling'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'IV' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'handling', '2025 - 2026', 'IV', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT003'
 WHERE f.email = 'ashwinraj@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'handling'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'IV' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'handling', '2025 - 2026', 'VI', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT601'
 WHERE f.email = 'ashwinraj@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'handling'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'VI' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'handling', '2025 - 2026', 'VI', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT602'
 WHERE f.email = 'jeyavelkarthick@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'handling'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'VI' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'handling', '2025 - 2026', 'VI', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT602'
 WHERE f.email = 'balajisadhasivam@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'handling'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'VI' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'handling', '2025 - 2026', 'VI', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT603'
 WHERE f.email = 'saranyas@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'handling'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'VI' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'handling', '2025 - 2026', 'VI', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT603'
 WHERE f.email = 'sakthishobanak@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'handling'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'VI' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'handling', '2025 - 2026', 'VI', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT042'
 WHERE f.email = 'vinodhinirt@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'handling'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'VI' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'handling', '2025 - 2026', 'VI', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT042'
 WHERE f.email = 'nandhinin@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'handling'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'VI' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'handling', '2025 - 2026', 'VI', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT046'
 WHERE f.email = 'swathi@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'handling'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'VI' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'handling', '2025 - 2026', 'VI', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT040'
 WHERE f.email = 'pavithramks@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'handling'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'VI' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'handling', '2025 - 2026', 'VI', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT013'
 WHERE f.email = 'balakrishnarajar@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'handling'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'VI' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'handling', '2025 - 2026', 'VI', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT013'
 WHERE f.email = 'jeyavelkarthick@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'handling'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'VI' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'handling', '2025 - 2026', 'VI', NULL
  FROM faculty f JOIN courses c ON c.code = '22OBT01'
 WHERE f.email = 'nandhinin@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'handling'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'VI' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'handling', '2025 - 2026', 'VI', NULL
  FROM faculty f JOIN courses c ON c.code = '22BTH30'
 WHERE f.email = 'mahimap@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'handling'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'VI' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'handling', '2025 - 2026', 'VI', NULL
  FROM faculty f JOIN courses c ON c.code = '22BTH31'
 WHERE f.email = 'swathi@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'handling'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'VI' AND a.section <=> NULL);

-- 4. Incharge allocations (who owns the course file).
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'incharge', '2025 - 2026', 'IV', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT401'
 WHERE f.email = 'pavithrasuresh@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'incharge'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'IV' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'incharge', '2025 - 2026', 'IV', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT403'
 WHERE f.email = 'vinodhinirt@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'incharge'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'IV' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'incharge', '2025 - 2026', 'IV', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT404'
 WHERE f.email = 'shankariv@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'incharge'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'IV' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'incharge', '2025 - 2026', 'IV', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT405'
 WHERE f.email = 'kathirvelanv@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'incharge'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'IV' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'incharge', '2025 - 2026', 'IV', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT012'
 WHERE f.email = 'sakthishobanak@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'incharge'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'IV' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'incharge', '2025 - 2026', 'IV', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT003'
 WHERE f.email = 'ashwinraj@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'incharge'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'IV' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'incharge', '2025 - 2026', 'VI', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT601'
 WHERE f.email = 'chitradevit@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'incharge'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'VI' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'incharge', '2025 - 2026', 'VI', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT602'
 WHERE f.email = 'jeyavelkarthick@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'incharge'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'VI' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'incharge', '2025 - 2026', 'VI', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT603'
 WHERE f.email = 'saranyas@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'incharge'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'VI' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'incharge', '2025 - 2026', 'VI', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT036'
 WHERE f.email = 'monishab@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'incharge'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'VI' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'incharge', '2025 - 2026', 'VI', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT042'
 WHERE f.email = 'nandhinin@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'incharge'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'VI' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'incharge', '2025 - 2026', 'VI', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT046'
 WHERE f.email = 'swathi@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'incharge'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'VI' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'incharge', '2025 - 2026', 'VI', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT040'
 WHERE f.email = 'pavithramks@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'incharge'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'VI' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'incharge', '2025 - 2026', 'VI', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT013'
 WHERE f.email = 'deepikam@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'incharge'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'VI' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'incharge', '2025 - 2026', 'VI', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT013'
 WHERE f.email = 'karthihmg@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'incharge'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'VI' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'incharge', '2025 - 2026', 'VI', NULL
  FROM faculty f JOIN courses c ON c.code = '22BTH30'
 WHERE f.email = 'mahimap@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'incharge'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'VI' AND a.section <=> NULL);
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'incharge', '2025 - 2026', 'VI', NULL
  FROM faculty f JOIN courses c ON c.code = '22BTH31'
 WHERE f.email = 'smrithir@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'incharge'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'VI' AND a.section <=> NULL);

-- 5. OPTIONAL, delete this block if you disagree.
--    22BT036's only teacher (Sandhyarani R) has no account, so without
--    this its own incharge Monisha B cannot open the course at all.
INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, 'handling', '2025 - 2026', 'VI', NULL
  FROM faculty f JOIN courses c ON c.code = '22BT036'
 WHERE f.email = 'monishab@bitsathy.ac.in'
   AND NOT EXISTS (SELECT 1 FROM course_allocations a
                    WHERE a.faculty_id = f.id AND a.course_id = c.id
                      AND a.role = 'handling'
                      AND a.academic_year <=> '2025 - 2026'
                      AND a.semester <=> 'VI' AND a.section <=> NULL);

COMMIT;

-- Verify after running:
--   SELECT COUNT(*) FROM courses WHERE academic_year='2025 - 2026';   -- expect 22
--   SELECT COUNT(*) FROM course_allocations WHERE academic_year='2025 - 2026';  -- expect 42
--   SELECT c.code, c.semester, n.name nature,
--          SUM(a.role='handling') handling, SUM(a.role='incharge') incharge
--     FROM courses c JOIN course_natures n ON n.id=c.nature_id
--     LEFT JOIN course_allocations a ON a.course_id=c.id
--    GROUP BY c.id ORDER BY c.semester, c.code;
