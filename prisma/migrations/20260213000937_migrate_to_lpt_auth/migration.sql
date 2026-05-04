-- AlterTable: Migrate User table to LPT Auth system
-- WARNING: This is a breaking change. All existing users will need to re-register.

-- Add new columns
ALTER TABLE "LPT_english"."User" ADD COLUMN "email" TEXT;
ALTER TABLE "LPT_english"."User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user';

-- Set temporary email for existing users (they will need to re-register)
-- Using their old username as a placeholder email
UPDATE "LPT_english"."User" SET "email" = "username" || '@legacy.local' WHERE "email" IS NULL;

-- Drop old authentication columns
ALTER TABLE "LPT_english"."User" DROP COLUMN "username";
ALTER TABLE "LPT_english"."User" DROP COLUMN "password";
ALTER TABLE "LPT_english"."User" DROP COLUMN "secretKey";
ALTER TABLE "LPT_english"."User" DROP COLUMN "isDeleted";

-- Alter id column to remove default (Auth API will provide the id)
ALTER TABLE "LPT_english"."User" ALTER COLUMN "id" DROP DEFAULT;

-- Add unique constraint on email
ALTER TABLE "LPT_english"."User" ALTER COLUMN "email" SET NOT NULL;
CREATE UNIQUE INDEX "User_email_key" ON "LPT_english"."User"("email");

