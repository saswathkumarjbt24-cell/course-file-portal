SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- The SET NAMES line above is REQUIRED and must stay first.
--
-- Every table in this schema is declared COLLATE=utf8mb4_unicode_ci, but
-- MySQL 8 defaults a new connection to utf8mb4_0900_ai_ci. Any comparison
-- between a string literal and a column then raises ERROR 1267 (illegal mix
-- of collations). Pinning the session collation here keeps this file, and
-- every file after it, consistent with the tables.
--
-- It IS load-bearing in this file: the guard below compares COLUMN_NAME and
-- TABLE_NAME from information_schema against string literals.
-- ---------------------------------------------------------------------

-- =====================================================================
-- Migration: 018_login_tracking
--
-- Two changes, both so that "who used the portal today" has an answer:
--   1. `faculty.last_login_at` - the single most recent successful sign-in
--      for one member of staff. Cheap to read, answers "is this account
--      still in use" without touching the history table.
--   2. A new table `login_events`, one row per successful sign-in. This is
--      the history; the column above is only ever a copy of its newest row
--      for that person.
--
-- NO SEED DATA. Nothing that happened before this file ran was recorded, and
-- there is no honest way to invent it. Every existing faculty row keeps NULL
-- in last_login_at, and login_events starts empty. NULL here means "has not
-- signed in since login tracking was switched on" -- it does NOT mean the
-- person has never used the portal, and any screen or query reading the
-- column must not claim otherwise.
--
--
-- WHY BOTH A COLUMN AND A TABLE
--   They answer different questions and neither is derivable from the other
--   cheaply enough. "When did this person last sign in" is one indexed
--   lookup on the column; deriving it would be a MAX() over the history.
--   "Who signed in today", and how often, needs the rows. Keeping the column
--   as a denormalised copy of the newest event is deliberate, and the two
--   are written together in the same request by the sign-in endpoint.
--
--
-- WHY last_login_at IS NULLABLE AND HAS NO DEFAULT
--   There is a real "not recorded" state -- see NO SEED DATA above -- and it
--   must stay distinguishable from a real timestamp. A default of
--   CURRENT_TIMESTAMP would stamp every existing row with the moment the
--   migration ran and present that fabrication as a login.
--
--   DATETIME, not TIMESTAMP, matching what this file writes into
--   login_events.occurred_at. TIMESTAMP in MySQL is converted to and from
--   the session time zone on every read and write, so the same instant reads
--   back differently depending on who connects; DATETIME stores what was
--   written. It also has no 2038 limit. The trade is that DATETIME carries
--   no zone of its own, so both columns hold the DATABASE server's local
--   time and a reader must know that -- see the note on occurred_at.
--
--
-- WHY login_events IS A TABLE AND NOT A COUNTER ON faculty
--   A counter answers "how many times" and nothing else. The question this
--   migration exists for is "who, and when, and from where", which is one
--   row per event by definition. Rows are also append-only, so nothing here
--   ever has to update history it has already written.
--
--
-- WHAT login_events DELIBERATELY DOES NOT HOLD
--   No token, no part of a token, no Google ID token, no email. The token is
--   never logged anywhere in this app, and the email is already reachable
--   through faculty_id -- storing a second copy would leave a personal
--   identifier behind after the faculty row it belongs to was deleted, which
--   is exactly what the ON DELETE CASCADE below exists to prevent.
--
--   `ip` is NULLable and is expected to BE null on some deployments. The
--   site sits behind Cloudflare, so the address the API's socket sees is a
--   proxy's, not the visitor's. The endpoint only stores an address it can
--   show came from a forwarded-client header; when it cannot, it writes NULL
--   rather than recording a proxy's address as though it were a person's.
--   A reader must treat NULL as "not known", never as "same as the server".
--
--   `user_agent` is VARCHAR(255) and the endpoint truncates to fit. It is a
--   self-reported string from the browser, kept for telling a phone apart
--   from a lab machine, and it is not evidence of anything.
--
--
-- WHY ON DELETE CASCADE
--   A login event is a fact about one member of staff and means nothing
--   without them. Deleting a faculty row must not leave their sign-in
--   history, and the addresses in it, orphaned in the database. Note this
--   differs from how the app normally retires somebody: is_active = FALSE
--   hides them and keeps everything, and that is still the usual route --
--   006 says their name must continue to appear on the files they signed.
--   CASCADE only governs the case where the row is genuinely deleted.
--
--
-- WHY THE ALTER IS GUARDED
--   MySQL has no ADD COLUMN IF NOT EXISTS. Re-running an unguarded ALTER
--   raises ERROR 1060 (duplicate column name) and aborts the rest of the
--   file, so a half-applied migration could not be finished by simply
--   running it again. The ALTER below is therefore built as a string, and
--   replaced by the no-op `DO 0` when information_schema says the column is
--   already there. The whole file is safe to run any number of times, and
--   re-running it does NOT clear a last_login_at that has since been
--   written: the guard skips the ALTER entirely rather than re-adding the
--   column.
--
--   The guard reads DATABASE(), so it only ever sees the schema the file is
--   being applied to.
--
--
-- Depends on: 006_faculty_and_allocations.sql (faculty)
--
-- This file is safely re-runnable.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. faculty.last_login_at
--
-- Placed AFTER `is_active` so it sits with the account-state columns and
-- ahead of the created_at / updated_at block, matching the order the table
-- was declared in.
--
-- Note for whoever writes to it: `faculty.updated_at` is ON UPDATE
-- CURRENT_TIMESTAMP, so a bare UPDATE of this column also bumps updated_at.
-- A sign-in is not an edit of the staff record, so the endpoint assigns
-- `updated_at = updated_at` alongside to hold it still. Anything else that
-- writes last_login_at later should do the same.
-- ---------------------------------------------------------------------
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME   = 'faculty'
                   AND COLUMN_NAME  = 'last_login_at');
SET @ddl := IF(@exists = 0,
  'ALTER TABLE `faculty` ADD COLUMN `last_login_at` DATETIME NULL AFTER `is_active`',
  'DO 0');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- ---------------------------------------------------------------------
-- 2. Table: login_events
--
-- One row per SUCCESSFUL sign-in. Append-only.
--
-- Nothing is written here for a failed sign-in. A row therefore always
-- refers to a real, verified member of staff, which is why faculty_id can be
-- NOT NULL and carry a foreign key at all -- a rejected attempt has no
-- faculty row to point at.
--
-- `occurred_at` DEFAULT CURRENT_TIMESTAMP is a safety net, not the normal
-- path: the endpoint writes the value explicitly so that the timestamp and
-- faculty.last_login_at agree. It is the DATABASE server's local time, in
-- whatever zone that server is set to -- the "today" in "who logged in
-- today" is the database's today, and a query run from another zone must
-- account for that.
--
-- idx_login_events_occurred_at carries the reporting query: the whole point
-- of the table is a date range ("today", "this week"), and without the index
-- that is a full scan of a table which only ever grows. The foreign key on
-- faculty_id gives InnoDB its own index for free, so joining back to the
-- person is already covered.
--
-- No unique key, deliberately. The same person signing in twice in one
-- second from two devices is two events, and both must be recorded.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `login_events` (
  `id`          INT          NOT NULL AUTO_INCREMENT,
  `faculty_id`  INT          NOT NULL,
  `occurred_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ip`          VARCHAR(64)  NULL,
  `user_agent`  VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_login_events_occurred_at` (`occurred_at`),
  CONSTRAINT `fk_login_events_faculty`
    FOREIGN KEY (`faculty_id`) REFERENCES `faculty` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- End of migration 018
-- =====================================================================
