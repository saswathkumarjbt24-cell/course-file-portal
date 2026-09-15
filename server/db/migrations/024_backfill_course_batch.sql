SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- The SET NAMES line above is REQUIRED and must stay first.
--
-- It is load-bearing here: the join below compares `courses`.`semester`
-- against Roman-numeral string literals, and `academic_year` is matched
-- against a literal pattern. Without the pinned session collation MySQL 8
-- opens the connection as utf8mb4_0900_ai_ci and every one of those
-- comparisons raises ERROR 1267, illegal mix of collations.
-- ---------------------------------------------------------------------

-- =====================================================================
-- Migration: 024_backfill_course_batch
--
-- Fills `courses`.`batch` wherever it is still NULL.
--
-- Migration 012 added the column and deliberately seeded nothing, so a
-- cover sheet would show a visible gap rather than an invented fact.
-- Migration 014 then set exactly one row by hand -- 22BT009, to
-- '2023 - 2027'. That single value is the department's own, and it is
-- both the FORMAT this file reproduces and the CORRECTNESS CHECK on the
-- derivation: 22BT009 is semester V in academic year '2025 - 2026', and
-- the arithmetic below independently lands on '2023 - 2027' for it.
--
--
-- WHY BATCH IS DERIVED AND NOT TYPED IN
--   It is not an independent fact. A student sitting semester N during
--   academic year Y was admitted in
--
--       Y - floor((N - 1) / 2)
--
--   and the programme runs four years, so the batch is that year to that
--   year plus four. Two odd semesters share an admission year (I and II
--   are both first year, III and IV both second), which is what the
--   floor of the halved offset expresses. In academic year 2025 - 2026:
--
--       III  ->  2025 - 1  ->  2024 - 2028
--       V    ->  2025 - 2  ->  2023 - 2027
--       VII  ->  2025 - 3  ->  2022 - 2026
--
--   Typing 23 of these in by hand would be 23 chances to disagree with
--   the semester already recorded on the same row.
--
--
-- WHAT THIS FILE WILL NOT DO
--   1. It will not overwrite a batch that is already set. The WHERE
--      clause is `batch IS NULL`, so 22BT009 is not read, not rewritten
--      and not re-derived, and any batch a human corrects later survives
--      every future deploy.
--   2. It will not guess. A row whose `semester` is NULL, blank, or not
--      one of the eight Roman numerals fails the join and is skipped. A
--      row whose `academic_year` does not begin with four digits fails
--      the pattern guard and is skipped. Those rows keep NULL, which is
--      the honest answer, and the cover sheet keeps showing its gap.
--
--
-- RE-RUNNABLE
--   This file runs again on every deploy. The first run sets the NULL
--   rows; every run after it matches nothing, because those rows are no
--   longer NULL. There is no DDL here and nothing to guard with an
--   information_schema lookup -- the column has existed since 012.
--
--
-- ONE STATEMENT, NOT A LOOP
--   The Roman numerals are a derived table joined to `courses`, so the
--   whole backfill is a single UPDATE the server plans once. All eight
--   numerals are listed even though only III, V and VII occur in the
--   data today, so an even-semester offering loaded later is filled by
--   this same file rather than needing a sequel.
-- =====================================================================

UPDATE courses AS c
JOIN (
  SELECT 'I'    AS roman, 1 AS sem_no UNION ALL
  SELECT 'II',    2 UNION ALL
  SELECT 'III',   3 UNION ALL
  SELECT 'IV',    4 UNION ALL
  SELECT 'V',     5 UNION ALL
  SELECT 'VI',    6 UNION ALL
  SELECT 'VII',   7 UNION ALL
  SELECT 'VIII',  8
) AS r
  ON r.roman = TRIM(c.semester)
SET c.batch = CONCAT(
  CAST(LEFT(TRIM(c.academic_year), 4) AS UNSIGNED) - FLOOR((r.sem_no - 1) / 2),
  ' - ',
  CAST(LEFT(TRIM(c.academic_year), 4) AS UNSIGNED) - FLOOR((r.sem_no - 1) / 2) + 4
)
WHERE c.batch IS NULL
  AND c.semester IS NOT NULL
  AND c.academic_year IS NOT NULL
  AND LEFT(TRIM(c.academic_year), 4) REGEXP '^[0-9]{4}$';

-- ---------------------------------------------------------------------
-- The separator is ' - ', space hyphen space, matching the one value
-- that was already in the column and the same separator `academic_year`
-- uses. CONCAT of an integer expression yields the decimal digits with
-- no padding or sign, so the result is exactly 'YYYY - YYYY', 11
-- characters, inside the varchar(20) the column was declared with.
-- ---------------------------------------------------------------------
