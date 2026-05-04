# User-Defined Word Libraries - Implementation Summary

## Completed Features

### Phase 1: Database Schema ✅
- Added `UserLibrary` table with fields: id, userId, name, description, wordCount, createdAt, updatedAt
- Added `UserLibraryWord` table with fields: id, libraryId, word, sequence, createdAt
- Created migration and applied to database successfully
- Added proper indexes and foreign key constraints with CASCADE delete

### Phase 2: Backend API ✅
Created complete REST API for user libraries:

1. **`/api/user/libraries`** (route.ts)
   - GET: List all user libraries
   - POST: Upload CSV and create new library
   - Validates file type (.csv), size (5MB max), word format
   - Supports both Chinese (序号,单词) and English (number,word) column names
   - Automatic deduplication and word normalization

2. **`/api/user/libraries/[id]`** (route.ts)
   - GET: Get library details
   - PATCH: Update library name/description
   - DELETE: Delete library (cascade deletes all words)
   - All endpoints verify ownership

3. **`/api/user/libraries/[id]/words`** (route.ts)
   - GET: Get words with pagination (groupIndex, groupSize)
   - Supports includeDefinitions parameter for enriched data
   - POST: Add new word to library
   - DELETE: Batch delete words

4. **`/api/user/libraries/[id]/words/[wordId]`** (route.ts)
   - PATCH: Update individual word
   - DELETE: Delete individual word

5. **`/api/user/libraries/[id]/groups`** (route.ts)
   - GET: Get library groups for quiz selection

6. **Extended `src/lib/data.ts`**
   - `getUserLibraryWords()` - Get word list from user library
   - `getUserLibraryWordsEnriched()` - Get words with dictionary data
   - `getUserLibraryGroups()` - Get group information

### Phase 3: Frontend UI ✅

1. **`/my-libraries` page** (page.tsx)
   - Upload form with drag-and-drop support
   - Library list with search functionality
   - Card-based layout showing name, description, word count, created date
   - Actions: Edit, Delete, Start Quiz
   - Visual feedback for upload progress
   - Error handling and validation

2. **`/my-libraries/[id]/edit` page** (page.tsx)
   - Edit library name and description
   - View all words with sequence numbers
   - Add new words individually
   - Delete words (single or batch)
   - Select all / deselect all functionality
   - Real-time word count updates

### Phase 4: Integration ✅

1. **Modified `/api/libraries`** (route.ts)
   - Now returns both system and user libraries
   - User libraries marked with `source: 'user'` and `libraryId`

2. **Modified `WordList` component** (WordList.tsx)
   - Detects user libraries (path starts with "user:")
   - Fetches words from appropriate API (system or user)
   - Fetches groups from appropriate API
   - Visual indicator: Purple badge "My Library" for user libraries
   - Shows word count for each library

3. **Quiz Integration**
   - User libraries work seamlessly with existing quiz system
   - Words from user libraries are enriched with dictionary data
   - Quiz records are saved normally (by word name, not library)

### Phase 5: Security ✅

All implemented:
- Authentication required for all user library endpoints
- Ownership verification on every request
- File type validation (.csv only)
- File size limit (5MB)
- Word format validation (English letters, hyphens, apostrophes only)
- Word count limit (10,000 per library)
- Library count limit (50 per user)
- SQL injection protection (Prisma ORM)
- Cascade delete to prevent orphaned records

## How to Use

### 1. Upload a CSV File

1. Navigate to `/my-libraries`
2. Click "Upload CSV" button
3. Select a CSV file with format:
   ```csv
   序号,单词
   1,hello
   2,world
   3,example
   ```
4. Enter library name and optional description
5. Click "Upload"

### 2. View and Edit Library

1. Click on a library card to view details
2. Click "Edit" button to modify
3. Add new words using the input field
4. Delete words individually or in batch
5. Click "Save" to update library info

### 3. Study with Custom Library

1. Go to main dashboard (/)
2. In the WordList sidebar, scroll to find your library
3. It will have a purple "My Library" badge
4. Click to view words
5. Select words and click "Start Quiz" or use the quiz page

### 4. Quiz with Custom Library

1. Go to `/quiz` page
2. Your custom libraries appear in the library dropdown
3. Select a library and group
4. Start quiz as normal

## Test CSV File

A test CSV file has been created at `/test-library.csv` with 10 sample words.

## API Endpoints Summary

```
GET    /api/user/libraries                          - List libraries
POST   /api/user/libraries                          - Upload CSV
GET    /api/user/libraries/:id                      - Get library details
PATCH  /api/user/libraries/:id                      - Update library
DELETE /api/user/libraries/:id                      - Delete library
GET    /api/user/libraries/:id/words                - Get words
POST   /api/user/libraries/:id/words                - Add word
DELETE /api/user/libraries/:id/words                - Batch delete
PATCH  /api/user/libraries/:id/words/:wordId        - Update word
DELETE /api/user/libraries/:id/words/:wordId        - Delete word
GET    /api/user/libraries/:id/groups               - Get groups
```

## Database Tables

```sql
UserLibrary (
  id, userId, name, description, wordCount,
  createdAt, updatedAt
)

UserLibraryWord (
  id, libraryId, word, sequence, createdAt
)
```

## Files Created

### Backend
- `src/app/api/user/libraries/route.ts`
- `src/app/api/user/libraries/[id]/route.ts`
- `src/app/api/user/libraries/[id]/words/route.ts`
- `src/app/api/user/libraries/[id]/words/[wordId]/route.ts`
- `src/app/api/user/libraries/[id]/groups/route.ts`

### Frontend
- `src/app/my-libraries/page.tsx`
- `src/app/my-libraries/[id]/edit/page.tsx`

### Database
- `prisma/migrations/20260215202156_add_user_libraries/migration.sql`

### Test
- `test-library.csv`

## Files Modified

- `prisma/schema.prisma` - Added UserLibrary and UserLibraryWord models
- `src/lib/data.ts` - Added user library support functions
- `src/app/api/libraries/route.ts` - Merged system and user libraries
- `src/components/WordList.tsx` - Integrated user library display and fetching

## Next Steps (Optional Enhancements)

1. Add library sharing functionality
2. Add library export (download as CSV)
3. Add library templates
4. Add bulk import from multiple files
5. Add word pronunciation audio for custom words
6. Add library statistics and analytics
7. Add library tags and categories
8. Add collaborative libraries (multiple users)

## Notes

- User libraries are stored in PostgreSQL, not as CSV files
- Words are automatically enriched with dictionary data (phonetics, definitions) from the system dictionary
- If a word doesn't exist in the system dictionary, it can still be learned but won't have phonetics/definitions
- User progress (visits, quiz records) is tracked by word name, independent of which library it came from
- Deleting a library doesn't affect user progress for those words
