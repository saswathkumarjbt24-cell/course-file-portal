-- =====================================================================
-- Migration: 001_course_natures_and_bands
--
-- Creates two reference (lookup) tables:
--   1. course_natures    - per course-nature mark scale rules
--                          (PT1 / PT2 / IP maxima, INT + SEE totals and the
--                          low-internal-mark threshold used for IM analysis)
--   2. attainment_bands  - CO attainment level bands (percentage -> level 0..3)
--
-- Source of values:
--   - BIT Sathy internal mark conversion document
--   - S6-IM analysis workbooks
--
-- This file is safely re-runnable: tables use CREATE TABLE IF NOT EXISTS and
-- every seed row is idempotent (no duplicates, no errors on a second run).
-- =====================================================================


-- ---------------------------------------------------------------------
-- Table: course_natures
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `course_natures` (
  `id`                INT             NOT NULL AUTO_INCREMENT,
  `name`              VARCHAR(50)     NOT NULL,
  `pt1_max`           DECIMAL(5,2)    NULL,
  `pt2_max`           DECIMAL(5,2)    NULL,
  `ip_max`            DECIMAL(5,2)    NULL,
  `int_total`         DECIMAL(5,2)    NULL,
  `see_total`         DECIMAL(5,2)    NULL,
  `low_im_threshold`  DECIMAL(5,2)    NOT NULL,
  `notes`             VARCHAR(255)    NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_course_natures_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- Seed: course_natures
-- `name` is UNIQUE, so ON DUPLICATE KEY UPDATE makes this idempotent.
-- NOTE: the three name strings below are matched against source data --
--       keep them character-for-character identical.
-- ---------------------------------------------------------------------
INSERT INTO `course_natures`
  (`name`, `pt1_max`, `pt2_max`, `ip_max`, `int_total`, `see_total`, `low_im_threshold`, `notes`)
VALUES
  ('Theory',         12.00, 12.00, 16.00, 40.00, 60.00, 23.00, NULL),
  ('Theory & Lab',   15.00, 15.00, 20.00, 50.00, 50.00, 27.50, NULL),
  ('Mini Project I',  NULL,  NULL,  NULL,  NULL,  NULL, 32.00,
     'INT total not stated in source documents - confirm with client')
AS `new`
ON DUPLICATE KEY UPDATE
  `pt1_max`          = `new`.`pt1_max`,
  `pt2_max`          = `new`.`pt2_max`,
  `ip_max`           = `new`.`ip_max`,
  `int_total`        = `new`.`int_total`,
  `see_total`        = `new`.`see_total`,
  `low_im_threshold` = `new`.`low_im_threshold`,
  `notes`            = `new`.`notes`;


-- ---------------------------------------------------------------------
-- Table: attainment_bands
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `attainment_bands` (
  `id`           INT          NOT NULL AUTO_INCREMENT,
  `min_percent`  DECIMAL(5,2) NOT NULL,
  `level`        TINYINT      NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_attainment_bands_min_percent` (`min_percent`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- Seed: attainment_bands
-- `min_percent` is UNIQUE, so a single multi-row INSERT with
-- ON DUPLICATE KEY UPDATE is idempotent: re-running the file re-asserts each
-- band's level instead of inserting duplicates.
-- ---------------------------------------------------------------------
INSERT INTO `attainment_bands` (`min_percent`, `level`)
VALUES
  (70.00, 3),
  (60.00, 2),
  (50.00, 1),
  ( 0.00, 0)
AS `new`
ON DUPLICATE KEY UPDATE
  `level` = `new`.`level`;

-- =====================================================================
-- End of migration 001
-- =====================================================================
