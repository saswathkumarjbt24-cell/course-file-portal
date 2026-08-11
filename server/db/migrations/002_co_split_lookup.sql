-- =====================================================================
-- Migration: 002_co_split_lookup
--
-- Creates the CO mark-split lookup, which converts a student's total
-- periodical-test mark into three per-question marks:
--   1. co_split_patterns - one row per split pattern (its total and the
--                          maximum mark of each of the three questions)
--   2. co_split_values   - the full lookup: for every possible total mark of
--                          a pattern, the exact q1 / q2 / q3 split to use
--
-- Source of values:
--   - BIT Sathy "random mark split up PT" workbook
--
-- !! WARNING !!
--   The 51 split rows seeded below are HAND-AUTHORED values taken verbatim
--   from that workbook. They are NOT derived by any formula: several rows do
--   not follow a monotonic or proportional pattern. DO NOT regenerate,
--   interpolate, round or otherwise "correct" them. If a value looks wrong,
--   confirm against the source workbook -- do not compute a replacement.
--
-- This file is safely re-runnable: tables use CREATE TABLE IF NOT EXISTS and
-- every seed row is idempotent (no duplicates, no errors on a second run).
-- =====================================================================


-- ---------------------------------------------------------------------
-- Table: co_split_patterns
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `co_split_patterns` (
  `id`         INT          NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(80)  NOT NULL,
  `total_max`  INT          NOT NULL,
  `q1_max`     INT          NOT NULL,
  `q2_max`     INT          NOT NULL,
  `q3_max`     INT          NOT NULL,
  `notes`      VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_co_split_patterns_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- Seed: co_split_patterns
-- `name` is UNIQUE, so ON DUPLICATE KEY UPDATE makes this idempotent.
-- ---------------------------------------------------------------------
INSERT INTO `co_split_patterns`
  (`name`, `total_max`, `q1_max`, `q2_max`, `q3_max`, `notes`)
VALUES
  ('PT 50 (20/20/10)', 50, 20, 20, 10,
     'Source: BIT Sathy random mark split up PT workbook. PT1 maps Q1->CO1, Q2->CO2, Q3->CO3. PT2 maps Q3->CO3, Q2->CO4, Q1->CO5.')
AS `new`
ON DUPLICATE KEY UPDATE
  `total_max` = `new`.`total_max`,
  `q1_max`    = `new`.`q1_max`,
  `q2_max`    = `new`.`q2_max`,
  `q3_max`    = `new`.`q3_max`,
  `notes`     = `new`.`notes`;


-- ---------------------------------------------------------------------
-- Table: co_split_values
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `co_split_values` (
  `id`          INT NOT NULL AUTO_INCREMENT,
  `pattern_id`  INT NOT NULL,
  `total_mark`  INT NOT NULL,
  `q1`          INT NOT NULL,
  `q2`          INT NOT NULL,
  `q3`          INT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_co_split_values` (`pattern_id`, `total_mark`),
  CONSTRAINT `fk_co_split_values_pattern`
    FOREIGN KEY (`pattern_id`) REFERENCES `co_split_patterns` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- Seed: co_split_values  (51 rows: total_mark 0 through 50)
--
-- `pattern_id` is resolved by joining co_split_patterns on its name rather
-- than hardcoding 1, so this runs correctly on a database where the pattern
-- was inserted with a different id.
--
-- (`pattern_id`, `total_mark`) is UNIQUE, so ON DUPLICATE KEY UPDATE makes
-- this idempotent: a re-run re-asserts each split instead of duplicating it.
--
-- REMINDER: values copied verbatim from the source workbook. Do not alter.
-- ---------------------------------------------------------------------
INSERT INTO `co_split_values` (`pattern_id`, `total_mark`, `q1`, `q2`, `q3`)
SELECT `p`.`id`, `new`.`total_mark`, `new`.`q1`, `new`.`q2`, `new`.`q3`
FROM `co_split_patterns` AS `p`
CROSS JOIN (
              SELECT  0 AS `total_mark`,  0 AS `q1`,  0 AS `q2`,  0 AS `q3`
    UNION ALL SELECT  1,  0,  1,  0
    UNION ALL SELECT  2,  1,  1,  0
    UNION ALL SELECT  3,  1,  2,  0
    UNION ALL SELECT  4,  2,  2,  0
    UNION ALL SELECT  5,  3,  2,  0
    UNION ALL SELECT  6,  2,  3,  1
    UNION ALL SELECT  7,  2,  3,  2
    UNION ALL SELECT  8,  3,  3,  2
    UNION ALL SELECT  9,  3,  4,  2
    UNION ALL SELECT 10,  4,  3,  3
    UNION ALL SELECT 11,  4,  4,  3
    UNION ALL SELECT 12,  4,  5,  3
    UNION ALL SELECT 13,  5,  5,  3
    UNION ALL SELECT 14,  6,  5,  3
    UNION ALL SELECT 15,  6,  6,  3
    UNION ALL SELECT 16,  6,  7,  3
    UNION ALL SELECT 17,  6,  7,  4
    UNION ALL SELECT 18,  7,  7,  4
    UNION ALL SELECT 19,  8,  7,  4
    UNION ALL SELECT 20,  9,  7,  4
    UNION ALL SELECT 21,  9,  9,  3
    UNION ALL SELECT 22, 11,  8,  3
    UNION ALL SELECT 23,  9,  9,  5
    UNION ALL SELECT 24,  9,  9,  6
    UNION ALL SELECT 25,  9, 10,  6
    UNION ALL SELECT 26, 11, 10,  5
    UNION ALL SELECT 27, 11, 11,  5
    UNION ALL SELECT 28, 11, 11,  6
    UNION ALL SELECT 29, 12, 11,  6
    UNION ALL SELECT 30, 12, 13,  5
    UNION ALL SELECT 31, 13, 12,  6
    UNION ALL SELECT 32, 13, 13,  6
    UNION ALL SELECT 33, 13, 13,  7
    UNION ALL SELECT 34, 14, 14,  6
    UNION ALL SELECT 35, 14, 14,  7
    UNION ALL SELECT 36, 15, 14,  7
    UNION ALL SELECT 37, 16, 15,  6
    UNION ALL SELECT 38, 15, 15,  8
    UNION ALL SELECT 39, 15, 16,  8
    UNION ALL SELECT 40, 15, 16,  9
    UNION ALL SELECT 41, 16, 16,  9
    UNION ALL SELECT 42, 17, 16,  9
    UNION ALL SELECT 43, 18, 18,  7
    UNION ALL SELECT 44, 18, 17,  9
    UNION ALL SELECT 45, 18, 19,  8
    UNION ALL SELECT 46, 18, 18, 10
    UNION ALL SELECT 47, 19, 18, 10
    UNION ALL SELECT 48, 19, 20,  9
    UNION ALL SELECT 49, 20, 20,  9
    UNION ALL SELECT 50, 20, 20, 10
) AS `new`
WHERE `p`.`name` = 'PT 50 (20/20/10)'
ON DUPLICATE KEY UPDATE
  `q1` = `new`.`q1`,
  `q2` = `new`.`q2`,
  `q3` = `new`.`q3`;

-- =====================================================================
-- End of migration 002
-- =====================================================================
