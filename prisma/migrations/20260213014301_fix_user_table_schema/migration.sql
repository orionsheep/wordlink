-- Move User table to LPT_english schema
-- This fixes the issue where User table was created in public schema instead of LPT_english

-- First, check if User table exists in public schema and move it
DO $$
BEGIN
    IF EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'User'
    ) THEN
        -- Move the table to LPT_english schema
        ALTER TABLE "public"."User" SET SCHEMA "LPT_english";
    END IF;
END $$;

-- If User table doesn't exist in either schema, create it in LPT_english
CREATE TABLE IF NOT EXISTS "LPT_english"."User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'zh',
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- Create unique index on email if it doesn't exist
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "LPT_english"."User"("email");
