SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =====================================================================
-- Migration: 017_demo_allocate_all
--
-- FOR THE PRESENTATION. Allocates 22BT009 to every active faculty
-- member, so that anyone who signs in sees the same real course file
-- and the same real data.
--
-- This is a presentation convenience, not the real allocation. In
-- normal use a faculty member should only see the courses they
-- actually teach. Undo it afterwards with the statement at the bottom.
--
-- Dr. Pavithra keeps her existing 'handling' and 'incharge' rows; the
-- guard below skips anyone who already has a matching allocation, so
-- re-running this file changes nothing.
-- =====================================================================

START TRANSACTION;

INSERT INTO `course_allocations`
  (`faculty_id`,`course_id`,`role`,`academic_year`,`semester`,`section`)
SELECT `f`.`id`, `c`.`id`, 'handling', '2025 - 2026', 'V', NULL
  FROM `faculty` `f`
  JOIN `courses` `c` ON `c`.`code` = '22BT009'
 WHERE `f`.`is_active` = TRUE
   AND NOT EXISTS (
     SELECT 1 FROM `course_allocations` `x`
      WHERE `x`.`faculty_id` = `f`.`id`
        AND `x`.`course_id`  = `c`.`id`
        AND `x`.`role`       = 'handling'
        AND `x`.`academic_year` <=> '2025 - 2026'
        AND `x`.`semester`      <=> 'V'
        AND `x`.`section`       <=> NULL);

COMMIT;

-- Check: every active faculty member should now have a 'handling' row.
--   SELECT COUNT(*) FROM course_allocations ca
--     JOIN courses c ON c.id = ca.course_id
--    WHERE c.code = '22BT009' AND ca.role = 'handling';
--
-- TO UNDO after the presentation, leaving only Dr. Pavithra:
--   DELETE ca FROM course_allocations ca
--     JOIN courses c ON c.id = ca.course_id
--     JOIN faculty f ON f.id = ca.faculty_id
--    WHERE c.code = '22BT009'
--      AND f.email <> 'pavithramks@bitsathy.ac.in';
