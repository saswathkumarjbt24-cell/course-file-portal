SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
-- 021: remove the invented development accounts that 014 recreates on every deploy.
-- Re-runnable: deletes nothing if they are already absent.
DELETE FROM faculty WHERE email IN ('balakrishnaraja@bitsathy.ac.in','tamilselvi@bitsathy.ac.in');
