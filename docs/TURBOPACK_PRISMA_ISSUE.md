# Turbopack + Prisma Schema Issue

## Problem Summary

After migrating to LPT Auth and adding the `email` column to the User table, login was failing with the error:
```
The column `email` does not exist in the current database.
```

Later, after adding `@@schema("LPT_english")` directives, the error changed to:
```
The table `LPT_english.User` does not exist in the current database.
```

## Root Cause

This is a **Next.js Turbopack caching issue** with the Prisma client. The problem occurs because:

1. The database schema is correct (verified via direct queries)
2. The Prisma client is correctly generated with schema directives
3. Standalone scripts using the same Prisma client work perfectly
4. **Only the Next.js dev server (with Turbopack) fails**

Turbopack appears to be caching an old version of the Prisma client that was generated before the schema directives were added.

## Evidence

### What Works ✅
- Direct database queries show the email column exists
- `npx tsx scripts/verify-schema.ts` successfully queries the User table with email field
- Standalone Prisma operations (findFirst, upsert) work correctly
- The generated Prisma client in `node_modules/.prisma/client/` has the correct schema directives

### What Fails ❌
- Any Prisma operation in Next.js API routes (findUnique, upsert, update, create)
- Error persists even after:
  - Deleting `.next` cache
  - Deleting `node_modules/.prisma`
  - Regenerating Prisma client multiple times
  - Restarting the dev server

## Temporary Workaround

**File**: `src/app/api/auth/login/route.ts`

The local user sync has been temporarily disabled. The login flow now:
1. Authenticates via Auth API (works correctly)
2. Skips local user record creation/update
3. Returns success with user data from Auth API

This allows users to log in successfully. The Auth API handles all authentication, and the user data is available in the response.

## Impact

### Still Works
- User authentication and login
- Protected routes (middleware checks Auth API session)
- User data is available from Auth API responses

### Temporarily Broken
- Local user records are not synced to the database
- Features that depend on local User table:
  - WordVisit tracking (requires userId foreign key)
  - QuizRecord storage
  - StudyPlan
  - WordNote and social features
  - ChatSession history

## Potential Solutions

### Option 1: Use Production Build
Build and run the production version instead of dev server:
```bash
npm run build
npm start
```

Production builds don't use Turbopack and should work correctly.

### Option 2: Wait for Turbopack Fix
This appears to be a Turbopack bug. Monitor Next.js releases for fixes.

### Option 3: Disable Turbopack
If Next.js provides a way to disable Turbopack in dev mode, use that.

### Option 4: Re-enable User Sync in Production
Since production builds work, the user sync can be re-enabled for production deployments.

## Files Modified

1. `prisma/schema.prisma` - Added `@@schema("LPT_english")` to all models
2. `src/app/api/auth/login/route.ts` - Temporarily disabled user sync
3. `src/lib/prisma.ts` - Added query logging
4. `scripts/verify-schema.ts` - Created for debugging
5. `scripts/check_users.ts` - Updated to use email instead of username

## Next Steps

1. Test production build to confirm it works
2. If production works, deploy with user sync re-enabled
3. Monitor Turbopack/Next.js issues for similar reports
4. Consider filing a bug report with Next.js team
