-- Prepare schema before migrating User table to LPT Auth format.
-- This migration must run before 20260213000937_migrate_to_lpt_auth.

CREATE SCHEMA IF NOT EXISTS "LPT_english";

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'User'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'LPT_english'
          AND table_name = 'User'
    ) THEN
        ALTER TABLE "public"."User" SET SCHEMA "LPT_english";
    END IF;
END $$;
