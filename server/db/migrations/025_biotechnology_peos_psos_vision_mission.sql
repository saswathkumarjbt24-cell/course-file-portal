SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =====================================================================
-- Migration: 025_biotechnology_peos_psos_vision_mission
--
-- Loads the programme-level statements of the BIOTECHNOLOGY department,
-- transcribed verbatim from the 22BT009 course file:
--   1. peos                       - 3 rows, PEO1..PEO3
--   2. program_specific_outcomes  - 3 rows, PSO1..PSO3
--   3. vision_missions            - 1 row, scope 'department'
--   4. missions                   - 3 rows, seq 1..3, under that vision
--
-- These are department-wide, not course-wide. Entered once, they print on
-- every Biotechnology course file. 'Biotechnology' is the exact department
-- string already carried by `faculty` and `courses`.
--
-- WHY THE LABEL IS NOT PART OF THE STATEMENT
--   The source file writes each statement as "PEO1: To design ...". The
--   "PEO1" half is the identifier and goes in `code`; the sentence after the
--   colon goes in `statement`. That is the split 009 already uses for peos,
--   and the split the UI expects -- it renders the code itself. The mission
--   labels M1..M3 map the same way onto `missions`.`seq` 1..3. No wording
--   inside any statement is altered.
--
--
-- RE-RUNNABILITY -- AND THE NULL-IN-UNIQUE-KEY TRAP
--   `peos`.`department` and `vision_missions`.`department` are both NULLABLE
--   and both sit inside the UNIQUE key of their table. In MySQL a UNIQUE key
--   does not collapse NULLs, so two NULL-department rows count as distinct,
--   the key raises no duplicate, and ON DUPLICATE KEY UPDATE therefore never
--   fires for a NULL-scope row -- it would insert a fresh copy on every run.
--   The institution vision (department NULL) and the sample PEOs of 009
--   (department NULL) are exactly such rows.
--
--   Every row THIS migration writes carries department = 'Biotechnology', so
--   the key would in fact hold for them. The NULL-safe form is used all the
--   same, for two reasons: it is the house style 007 and 009 already set for
--   precisely these tables, and it does not quietly become wrong if a
--   NULL-department row is later added beside these.
--
--   So every insert below is INSERT ... SELECT ... WHERE NOT EXISTS, matching
--   on the natural key with <=> (NULL-safe equality) instead of =. NOT EXISTS
--   rather than ON DUPLICATE KEY UPDATE is also the stricter reading of "a
--   second run changes nothing": ODKU would overwrite a statement that a Head
--   of Department had since corrected through the portal. This file seeds
--   what is missing and never rewrites what is already there.
--
--   CAST('Biotechnology' AS CHAR(100)) on the first branch of each UNION
--   fixes the type of the derived column to match `department`, so the string
--   cannot be truncated or retyped by the UNION.
--
--
-- WHAT THIS MIGRATION DOES NOT TOUCH
--   - the institution-scope vision_missions row (department NULL) or its
--     five missions
--   - the twelve program_outcomes -- fixed NBA text, seeded by 004
--   - any department other than Biotechnology
-- =====================================================================


-- =====================================================================
-- 1. peos  (3 rows -- PEO1..PEO3, department 'Biotechnology')
--
-- department is NOT NULL here, unlike the sample PEOs of 009 which use NULL
-- to mean "applies to every department". These belong to one programme.
-- =====================================================================
INSERT INTO `peos` (`department`, `code`, `statement`)
SELECT `new`.`department`, `new`.`code`, `new`.`statement`
FROM (
            SELECT CAST('Biotechnology' AS CHAR(100)) AS `department`,
                   'PEO1' AS `code`,
                   'To design and develop biotechnological solutions by applying core knowledge in biological sciences and engineering to address challenges in healthcare, agriculture, and environmental sectors.' AS `statement`
  UNION ALL SELECT 'Biotechnology', 'PEO2',
                   'To pursue higher studies, research, or professional careers, while continuously enhancing their knowledge, skills, and competencies in biotechnology and related fields.'
  UNION ALL SELECT 'Biotechnology', 'PEO3',
                   'To evolve as responsible professionals who contribute effectively to industry and society, with awareness of sustainability, ethics, and lifelong learning.'
) AS `new`
WHERE NOT EXISTS (
  SELECT 1 FROM `peos` AS `x`
  WHERE `x`.`department` <=> `new`.`department`
    AND `x`.`code`       =   `new`.`code`
);


-- =====================================================================
-- 2. program_specific_outcomes  (3 rows -- PSO1..PSO3)
--
-- `department` is NOT NULL on this table, so its unique key (department,
-- code) never holds a NULL and ON DUPLICATE KEY UPDATE would have worked
-- here. The NOT EXISTS form is used anyway, so that a re-run of this file
-- inserts nothing and updates nothing across all four tables alike.
-- =====================================================================
INSERT INTO `program_specific_outcomes` (`department`, `code`, `statement`)
SELECT `new`.`department`, `new`.`code`, `new`.`statement`
FROM (
            SELECT CAST('Biotechnology' AS CHAR(100)) AS `department`,
                   'PSO1' AS `code`,
                   'Apply advanced analytical techniques and modern biotechnological tools to effectively separate, purify, and characterize biological molecules and systems.' AS `statement`
  UNION ALL SELECT 'Biotechnology', 'PSO2',
                   'Design and develop novel biomolecules and bioprocesses for applications in healthcare, agriculture, and allied sectors.'
  UNION ALL SELECT 'Biotechnology', 'PSO3',
                   'Conceptualize, plan, and implement sustainable, society-oriented projects utilizing bioresources for environmental protection and resource management.'
) AS `new`
WHERE NOT EXISTS (
  SELECT 1 FROM `program_specific_outcomes` AS `x`
  WHERE `x`.`department` = `new`.`department`
    AND `x`.`code`       = `new`.`code`
);


-- =====================================================================
-- 3. vision_missions  (1 row -- scope 'department', 'Biotechnology')
--
-- The institution row (scope 'institution', department NULL) is a different
-- row on the same unique key and is left exactly as it stands: the NOT
-- EXISTS below matches on BOTH scope and department, so it can neither find
-- it nor displace it.
-- =====================================================================
INSERT INTO `vision_missions` (`scope`, `department`, `vision`)
SELECT `new`.`scope`, `new`.`department`, `new`.`vision`
FROM (
  SELECT 'department' AS `scope`,
         CAST('Biotechnology' AS CHAR(100)) AS `department`,
         'To emerge as a premier centre of excellence in biotechnology, fostering highly competent professionals to address societal challenges through innovative research, sustainable solutions, and strong ethical values.' AS `vision`
) AS `new`
WHERE NOT EXISTS (
  SELECT 1 FROM `vision_missions` AS `x`
  WHERE `x`.`scope`      =   `new`.`scope`
    AND `x`.`department` <=> `new`.`department`
);


-- =====================================================================
-- 4. missions  (3 rows -- M1..M3 stored as seq 1..3)
--
-- vision_mission_id is resolved by joining vision_missions on its natural
-- key (scope, department) rather than on a literal id, because that id is
-- AUTO_INCREMENT and differs between installs. <=> is used on department for
-- the same reason as above.
--
-- Statement 3 of this file inserts the parent row, so by the time this
-- statement runs the join has something to find -- on the first run and on
-- every run after it.
--
-- The NOT EXISTS guards (vision_mission_id, seq), which is the unique key of
-- the table, so a re-run inserts nothing. The five institution missions hang
-- off a different vision_mission_id and are never seen by this statement.
-- =====================================================================
INSERT INTO `missions` (`vision_mission_id`, `seq`, `statement`)
SELECT `vm`.`id`, `new`.`seq`, `new`.`statement`
FROM (
            SELECT 'department' AS `scope`,
                   CAST('Biotechnology' AS CHAR(100)) AS `department`,
                   1 AS `seq`,
                   'To provide state-of-the-art infrastructure and a conducive academic ecosystem through best pedagogical practices, complemented by co-curricular and extra-curricular activities aligned with national and global standards, enabling graduates to build strong foundational and applied competencies in biotechnology.' AS `statement`
  UNION ALL SELECT 'department', 'Biotechnology', 2,
                   'To promote interdisciplinary research and innovation among students and faculty, focusing on sustainable and circular bioeconomy solutions addressing challenges in healthcare, agriculture, and environmental sectors.'
  UNION ALL SELECT 'department', 'Biotechnology', 3,
                   'To establish effective collaborations with biotechnology industries, startups, and research organizations to foster professional skills, leadership qualities, ethical values, and lifelong learning for career advancement and societal contribution.'
) AS `new`
JOIN `vision_missions` AS `vm`
  ON  `vm`.`scope`      =   `new`.`scope`
  AND `vm`.`department` <=> `new`.`department`
WHERE NOT EXISTS (
  SELECT 1 FROM `missions` AS `x`
  WHERE `x`.`vision_mission_id` = `vm`.`id`
    AND `x`.`seq`               = `new`.`seq`
);
