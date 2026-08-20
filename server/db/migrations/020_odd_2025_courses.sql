SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
-- 020: Biotechnology courses for ODD 2025-2026 and their faculty allocations.
-- Re-runnable: both inserts are guarded by NOT EXISTS.
-- nature Theory for all except the two project rows; co_target_percent 60.

INSERT INTO courses (code, title, department, nature_id, co_target_percent, academic_year, semester, section)
SELECT t.code, t.title, 'Biotechnology', n.id, 60.00, '2025 - 2026', t.sem, NULL
FROM (
  SELECT '22BT302' code,'BIOCHEMISTRY' title,'III' sem,'Theory' nat UNION ALL
  SELECT '22BT303','ENGINEERING THERMODYNAMICS','III','Theory' UNION ALL
  SELECT '22BT304','MICROBIOLOGY','III','Theory' UNION ALL
  SELECT '22BT305','PROCESS CALCULATIONS AND UNIT OPERATIONS','III','Theory' UNION ALL
  SELECT '22HS004','HUMAN VALUES AND ETHICS','III','Theory' UNION ALL
  SELECT '22BT501','GENETIC ENGINEERING','V','Theory' UNION ALL
  SELECT '22BT502','BIOPROCESS ENGINEERING','V','Theory' UNION ALL
  SELECT '22BT503','ANIMAL TISSUE CULTURE','V','Theory' UNION ALL
  SELECT '22BT504','BIOINFORMATICS','V','Theory' UNION ALL
  SELECT '22BT002','INDUSTRIAL MICROBIOLOGY','V','Theory' UNION ALL
  SELECT '22OBT01','BIOFUELS','V','Theory' UNION ALL
  SELECT '22BTH28','ANIMAL PHYSIOLOGY AND METABOLISM','V','Theory' UNION ALL
  SELECT '22BTH29','ANIMAL HEALTH AND NUTRITION','V','Theory' UNION ALL
  SELECT '22BT701','GENOMICS AND PROTEOMICS','VII','Theory' UNION ALL
  SELECT '22BT702','BIOPHARMACEUTICAL TECHNOLOGY','VII','Theory' UNION ALL
  SELECT '22BT014','BIOMATERIALS','VII','Theory' UNION ALL
  SELECT '22BT018','COMPUTER AIDED DRUG DESIGN','VII','Theory' UNION ALL
  SELECT '22BT045','PATENT DESIGN, IPR IN BIOTECHNOLOGY AND BIOENTREPRENEURSHIP','VII','Theory' UNION ALL
  SELECT '22BT046','BIOSAFETY AND HAZARD MANAGEMENT','VII','Theory' UNION ALL
  SELECT '22BTH32','FUNDAMENTALS OF ANIMAL TRANSGENICS','VII','Theory' UNION ALL
  SELECT '22BTH33','STEM CELL TECHNOLOGY','VII','Theory' UNION ALL
  SELECT '22BT507','MINI PROJECT I','V','Mini Project I' UNION ALL
  SELECT '22BT707','PROJECT WORK I','VII','Mini Project I'
) t
JOIN course_natures n ON n.name = t.nat
WHERE NOT EXISTS (SELECT 1 FROM courses c WHERE c.code = t.code);

INSERT INTO course_allocations (faculty_id, course_id, role, academic_year, semester, section)
SELECT f.id, c.id, r.role, '2025 - 2026', c.semester, NULL
FROM (
  SELECT '22BT302' code,'tamilselvis@bitsathy.ac.in' em UNION ALL
  SELECT '22BT303','arunasreetna@bitsathy.ac.in' UNION ALL
  SELECT '22BT304','kannankp@bitsathy.ac.in' UNION ALL
  SELECT '22BT305','ashwinraj@bitsathy.ac.in' UNION ALL
  SELECT '22HS004','saranyas@bitsathy.ac.in' UNION ALL
  SELECT '22BT501','sakthishobanak@bitsathy.ac.in' UNION ALL
  SELECT '22BT502','deepikam@bitsathy.ac.in' UNION ALL
  SELECT '22BT503','shankariv@bitsathy.ac.in' UNION ALL
  SELECT '22BT504','rajaseetharama@bitsathy.ac.in' UNION ALL
  SELECT '22BT002','smrithir@bitsathy.ac.in' UNION ALL
  SELECT '22OBT01','jeyavelkarthick@bitsathy.ac.in' UNION ALL
  SELECT '22BTH28','rajaseetharama@bitsathy.ac.in' UNION ALL
  SELECT '22BTH29','nandhinin@bitsathy.ac.in' UNION ALL
  SELECT '22BT507','pavithrasuresh@bitsathy.ac.in' UNION ALL
  SELECT '22BT701','vinodhinirt@bitsathy.ac.in' UNION ALL
  SELECT '22BT702','deepikam@bitsathy.ac.in' UNION ALL
  SELECT '22BT014','mahimap@bitsathy.ac.in' UNION ALL
  SELECT '22BT018','balajisadhasivam@bitsathy.ac.in' UNION ALL
  SELECT '22BT045','balakrishnarajar@bitsathy.ac.in' UNION ALL
  SELECT '22BT046','karthicka@bitsathy.ac.in' UNION ALL
  SELECT '22BTH32','karthihmg@bitsathy.ac.in' UNION ALL
  SELECT '22BTH33','smrithir@bitsathy.ac.in' UNION ALL
  SELECT '22BT707','kathirvelanv@bitsathy.ac.in'
) t
JOIN courses c ON c.code = t.code
JOIN faculty f ON f.email = t.em
JOIN (SELECT 'handling' role UNION ALL SELECT 'incharge') r
WHERE NOT EXISTS (
  SELECT 1 FROM course_allocations x
  WHERE x.faculty_id = f.id AND x.course_id = c.id AND x.role = r.role
);