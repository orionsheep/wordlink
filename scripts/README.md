# Migration Scripts

This directory contains scripts for migrating word data from file-based storage to PostgreSQL database.

## Prerequisites

1. Install dependencies (including tsx):
```bash
npm install
```

2. Ensure PostgreSQL is running and DATABASE_URL is configured in `.env`

3. Run Prisma migrations:
```bash
npx prisma migrate dev
```

## Scripts

### migrate-to-database.ts

Migrates all word data files to PostgreSQL database.

**What it migrates:**
- 23,478 markdown files from `data/word_text_database/word_database/` → `WordMarkdown` table
- 25,314 JSON files from `data/word_chinese/` → `WordChinese` table
- CSV data from `data/ecdict_extracted.csv` (42MB) → `WordEcdict` table
- CSV data from `data/word_fission_data.csv` (5.9MB) → `WordFission` table

**Features:**
- Batch processing (1000 records per transaction) for performance
- Progress logging with timestamps
- Automatic creation of Word entries with foreign key relationships
- Clears existing data before migration (can be commented out)
- Summary statistics at completion

**Usage:**
```bash
npm run migrate
```

**Expected output:**
```
[timestamp] === Starting Data Migration ===
[timestamp] Clearing existing word data...
[timestamp] Starting markdown files migration...
[timestamp] Found 23478 markdown files
[timestamp] Markdown files: Processed 1000/23478 (4.3%)
...
[timestamp] === Migration Completed Successfully in XXXs ===

=== Migration Summary ===
Total Words: XXXXX
Markdown Entries: 23478
Chinese Entries: 25314
ECDICT Entries: XXXXX
Fission Relations: XXXXX
```

### verify-migration.ts

Validates data integrity after migration.

**What it checks:**
- Count verification for all data sources
- Sample content verification (10 random files per source)
- Data integrity checks (orphaned records, complete words)
- Foreign key relationships
- Word fission relationship statistics

**Usage:**
```bash
npm run verify
```

**Expected output:**
```
=== Starting Migration Verification ===

=== Verifying Markdown Files ===
✓ Markdown Files: Expected 23478, Got 23478
✓ Markdown Content Sample: Expected 10, Got 10

=== Verifying Chinese JSON Files ===
✓ Chinese JSON Files: Expected 25314, Got 25314
✓ Chinese Content Sample: Expected 10, Got 10

...

=== Verification Summary ===
Total checks: X
Passed: X
Failed: 0

✓ All verification checks passed!
```

## Migration Process

1. **Run migration:**
```bash
npm run migrate
```

2. **Verify migration:**
```bash
npm run verify
```

3. **Check database:**
```bash
npx prisma studio
```

## Performance Notes

- Migration uses batch processing (1000 records per transaction)
- Expected migration time: 5-15 minutes depending on system
- Database size after migration: ~500MB-1GB
- Indexes are created automatically via Prisma schema

## Troubleshooting

**Error: "Connection refused"**
- Ensure PostgreSQL is running
- Check DATABASE_URL in `.env`

**Error: "Out of memory"**
- Reduce BATCH_SIZE in migration script
- Increase Node.js memory: `NODE_OPTIONS=--max-old-space-size=4096 npm run migrate`

**Error: "Unique constraint violation"**
- Clear existing data first (uncomment clear section in main())
- Or run: `npx prisma migrate reset`

**Verification fails:**
- Check file counts match expected numbers
- Review failed checks in output
- Inspect sample records in Prisma Studio
