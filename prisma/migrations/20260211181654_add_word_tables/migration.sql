-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "secretKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordVisit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WordVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "testType" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dailyGoal" INTEGER NOT NULL DEFAULT 50,

    CONSTRAINT "StudyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "word_notes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "word_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_interactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '新对话',
    "category" INTEGER NOT NULL DEFAULT 3,
    "word" TEXT,
    "wordGroup" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "words" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "words_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "word_markdown" (
    "id" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "word_markdown_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "word_chinese" (
    "id" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "pronunciation" TEXT NOT NULL DEFAULT '',
    "conciseDefinition" TEXT NOT NULL,
    "forms" JSONB NOT NULL DEFAULT '{}',
    "definitions" JSONB NOT NULL DEFAULT '[]',
    "comparison" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "word_chinese_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "word_ecdict" (
    "id" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "phonetic" TEXT NOT NULL DEFAULT '',
    "translation" TEXT NOT NULL,
    "collins" TEXT NOT NULL DEFAULT '',
    "tag" TEXT NOT NULL DEFAULT '',
    "exchange" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "word_ecdict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "word_fission" (
    "id" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "partOfSpeech" TEXT NOT NULL,
    "meaningNumber" TEXT NOT NULL,
    "definitionText" TEXT NOT NULL,
    "synonym" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "word_fission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "WordVisit_userId_idx" ON "WordVisit"("userId");

-- CreateIndex
CREATE INDEX "WordVisit_word_idx" ON "WordVisit"("word");

-- CreateIndex
CREATE INDEX "QuizRecord_userId_idx" ON "QuizRecord"("userId");

-- CreateIndex
CREATE INDEX "QuizRecord_word_idx" ON "QuizRecord"("word");

-- CreateIndex
CREATE UNIQUE INDEX "StudyPlan_userId_key" ON "StudyPlan"("userId");

-- CreateIndex
CREATE INDEX "word_notes_userId_idx" ON "word_notes"("userId");

-- CreateIndex
CREATE INDEX "word_notes_word_idx" ON "word_notes"("word");

-- CreateIndex
CREATE INDEX "word_notes_createdAt_idx" ON "word_notes"("createdAt");

-- CreateIndex
CREATE INDEX "note_interactions_noteId_idx" ON "note_interactions"("noteId");

-- CreateIndex
CREATE INDEX "note_interactions_userId_type_idx" ON "note_interactions"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "note_interactions_userId_noteId_type_key" ON "note_interactions"("userId", "noteId", "type");

-- CreateIndex
CREATE INDEX "chat_sessions_userId_idx" ON "chat_sessions"("userId");

-- CreateIndex
CREATE INDEX "chat_sessions_category_idx" ON "chat_sessions"("category");

-- CreateIndex
CREATE INDEX "chat_messages_sessionId_idx" ON "chat_messages"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "words_word_key" ON "words"("word");

-- CreateIndex
CREATE INDEX "words_word_idx" ON "words"("word");

-- CreateIndex
CREATE UNIQUE INDEX "word_markdown_wordId_key" ON "word_markdown"("wordId");

-- CreateIndex
CREATE UNIQUE INDEX "word_markdown_word_key" ON "word_markdown"("word");

-- CreateIndex
CREATE INDEX "word_markdown_word_idx" ON "word_markdown"("word");

-- CreateIndex
CREATE UNIQUE INDEX "word_chinese_wordId_key" ON "word_chinese"("wordId");

-- CreateIndex
CREATE UNIQUE INDEX "word_chinese_word_key" ON "word_chinese"("word");

-- CreateIndex
CREATE INDEX "word_chinese_word_idx" ON "word_chinese"("word");

-- CreateIndex
CREATE UNIQUE INDEX "word_ecdict_wordId_key" ON "word_ecdict"("wordId");

-- CreateIndex
CREATE UNIQUE INDEX "word_ecdict_word_key" ON "word_ecdict"("word");

-- CreateIndex
CREATE INDEX "word_ecdict_word_idx" ON "word_ecdict"("word");

-- CreateIndex
CREATE INDEX "word_fission_word_idx" ON "word_fission"("word");

-- CreateIndex
CREATE INDEX "word_fission_synonym_idx" ON "word_fission"("synonym");

-- AddForeignKey
ALTER TABLE "WordVisit" ADD CONSTRAINT "WordVisit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizRecord" ADD CONSTRAINT "QuizRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyPlan" ADD CONSTRAINT "StudyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_notes" ADD CONSTRAINT "word_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_interactions" ADD CONSTRAINT "note_interactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_interactions" ADD CONSTRAINT "note_interactions_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "word_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_markdown" ADD CONSTRAINT "word_markdown_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_chinese" ADD CONSTRAINT "word_chinese_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_ecdict" ADD CONSTRAINT "word_ecdict_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_fission" ADD CONSTRAINT "word_fission_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;
