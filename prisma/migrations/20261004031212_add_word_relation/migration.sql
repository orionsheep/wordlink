-- CreateTable
CREATE TABLE "LPT_english"."word_relation" (
    "id" TEXT NOT NULL,
    "wordId" TEXT,
    "word" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "targetWordId" TEXT,
    "relationType" TEXT NOT NULL,
    "partOfSpeech" TEXT NOT NULL DEFAULT '',
    "meaningNumber" TEXT NOT NULL DEFAULT '',
    "definitionText" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "source" TEXT NOT NULL DEFAULT '',
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "word_relation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "word_relation_word_idx" ON "LPT_english"."word_relation"("word");

-- CreateIndex
CREATE INDEX "word_relation_target_idx" ON "LPT_english"."word_relation"("target");

-- CreateIndex
CREATE INDEX "word_relation_relationType_idx" ON "LPT_english"."word_relation"("relationType");

-- CreateIndex
CREATE UNIQUE INDEX "word_relation_word_target_relationType_meaningNumber_key" ON "LPT_english"."word_relation"("word", "target", "relationType", "meaningNumber");

-- AddForeignKey
ALTER TABLE "LPT_english"."word_relation" ADD CONSTRAINT "word_relation_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "LPT_english"."words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

