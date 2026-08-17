SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =====================================================================
-- Migration: 015_faculty_accounts
--
-- Adds the 29 real faculty accounts supplied by the department.
-- Every row gets role 'faculty'. Sign-in is granted purely by a row
-- existing here, so this file IS the access list.
--
-- department is left NULL: it was not supplied. It must be filled in
-- before any HOD role can work, because HOD scoping matches
-- faculty.department against courses.department exactly.
--
-- NOTE: Dr. PAVITHRA MKS already exists with the PLACEHOLDER email
-- pavithra.mks@bitsathy.ac.in and holds the 22BT009 allocation. Her real
-- address is in this list, so step 1 corrects the existing row rather
-- than creating a second one, which would orphan her course.
-- =====================================================================

START TRANSACTION;

-- 1. correct the placeholder address before inserting, so the insert
--    below matches her row on email and updates instead of duplicating
UPDATE `faculty` SET `email` = 'pavithramks@bitsathy.ac.in'
 WHERE `email` = 'pavithra.mks@bitsathy.ac.in';

-- 2. the 29 accounts
INSERT INTO `faculty` (`name`,`email`,`department`,`designation`,`role`,`is_active`) VALUES
  ('Dr Anandha Moorthy A','anandhamoorthya@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Dr Boopathiraja K P','boopathiraja@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Ashwin Raj S','ashwinraj@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Balaji S','balajisadhasivam@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Balakrishnaraja R','balakrishnarajar@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Chitra Devi T','chitradevit@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Jeyavel Karthick P','jeyavelkarthick@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Kannan K P','kannankp@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Karthick A','karthicka@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Karthih M G','karthihmg@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Kathirvelan V','kathirvelanv@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Mahima P','mahimap@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Monisha B','monishab@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Mr Kumaresan K','kumaresank@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Mr Madheswaran S','madheswaran@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Mr Ramesh R','rameshr@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Mr Rishikesh N','rishikesh@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Nandhini N','nandhinin@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Pavithra MKS','pavithramks@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Pavithra Suresh','pavithrasuresh@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Rajaseetharama S','rajaseetharama@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Sakthishobana K','sakthishobanak@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Saranya S','saranyas@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Shankari V','shankariv@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Smrithi R','smrithir@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Swathi G','swathi@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Tamilselvi S','tamilselvis@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Tna Arunasree','arunasreetna@bitsathy.ac.in',NULL,NULL,'faculty',TRUE),
  ('Vinodhini R T','vinodhinirt@bitsathy.ac.in',NULL,NULL,'faculty',TRUE)
AS `new` ON DUPLICATE KEY UPDATE
  `name` = `new`.`name`,
  `is_active` = `new`.`is_active`;

COMMIT;

-- Expected afterwards: 30 faculty rows in total
--   29 from this list + 1 admin (saswathkumarj.bt24@bitsathy.ac.in).
-- Dr. PAVITHRA MKS keeps her id and her 22BT009 allocation.

