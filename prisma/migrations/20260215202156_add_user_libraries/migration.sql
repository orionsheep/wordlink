-- CreateTable
CREATE TABLE "LPT_english"."UserLibrary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LPT_english"."UserLibraryWord" (
    "id" TEXT NOT NULL,
    "libraryId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserLibraryWord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserLibrary_userId_idx" ON "LPT_english"."UserLibrary"("userId");

-- CreateIndex
CREATE INDEX "UserLibraryWord_libraryId_idx" ON "LPT_english"."UserLibraryWord"("libraryId");

-- CreateIndex
CREATE INDEX "UserLibraryWord_word_idx" ON "LPT_english"."UserLibraryWord"("word");

-- CreateIndex
CREATE UNIQUE INDEX "UserLibraryWord_libraryId_sequence_key" ON "LPT_english"."UserLibraryWord"("libraryId", "sequence");

-- AddForeignKey
ALTER TABLE "LPT_english"."UserLibrary" ADD CONSTRAINT "UserLibrary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "LPT_english"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LPT_english"."UserLibraryWord" ADD CONSTRAINT "UserLibraryWord_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "LPT_english"."UserLibrary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
