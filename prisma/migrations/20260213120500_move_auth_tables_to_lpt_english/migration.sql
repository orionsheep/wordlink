-- Ensure auth-related tables are in LPT_english schema.
-- This is safe to run multiple times.

CREATE SCHEMA IF NOT EXISTS "LPT_english";

DO $$
DECLARE
    current_table TEXT;
    tables_to_move TEXT[] := ARRAY[
        'User',
        'WordVisit',
        'QuizRecord',
        'StudyPlan',
        'word_notes',
        'note_interactions',
        'chat_sessions',
        'chat_messages'
    ];
BEGIN
    FOREACH current_table IN ARRAY tables_to_move
    LOOP
        IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = current_table
        )
        AND NOT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'LPT_english'
              AND table_name = current_table
        ) THEN
            EXECUTE format('ALTER TABLE "public".%I SET SCHEMA "LPT_english"', current_table);
        END IF;
    END LOOP;
END $$;
