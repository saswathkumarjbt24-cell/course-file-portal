SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
-- 022: migration 014 recreates Pavithra MKS from scratch on every deploy, so her
-- admin role is lost each time. Restore it after 014 has run. Re-runnable.
UPDATE faculty SET role='admin' WHERE email='pavithramks@bitsathy.ac.in';
UPDATE faculty SET role='faculty' WHERE email='btinventory@bitsathy.ac.in';
