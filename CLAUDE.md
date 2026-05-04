# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LPT英语单词裂变 (English Word Fission) is a Next.js-based English vocabulary learning platform that visualizes word relationships through an interactive graph interface. The application uses a "word fission" concept to show etymological connections and related words, helping users learn vocabulary through visual associations.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **UI**: React 19, Tailwind CSS 4
- **Visualization**: react-force-graph-2d, d3-force
- **Authentication**: JWT with bcryptjs
- **AI Integration**: DeepSeek API for chat features

## Development Commands

```bash
# Development server (runs on port 3000)
npm run dev

# Production build
npm run build

# Start production server (runs on port 3011)
npm start

# Linting
npm run lint

# Database operations
npx prisma generate    # Generate Prisma client
npx prisma migrate dev # Run migrations in development
npx prisma studio      # Open Prisma Studio GUI
```

## Architecture

### Directory Structure

- `src/app/` - Next.js App Router pages and API routes
  - `api/` - RESTful API endpoints organized by feature
  - `dashboard/`, `quiz/`, `history/`, `admin/` - Main application pages
- `src/components/` - React components
  - `ai/` - AI chat components (AIFloatingBall, AIChatWindow, AIProvider)
  - Core components: ThreeColumnLayout, FissionGraph, WordDetail, WordList
- `src/lib/` - Utility libraries
  - `data.ts` - Word data loading and graph generation
  - `auth.ts`, `jwt.ts` - Authentication utilities
  - `prisma.ts` - Prisma client singleton
- `src/context/` - React contexts (SettingsContext)
- `prisma/` - Database schema and migrations
- `data/` - Static data files
  - `word_text_database/word_database/` - Individual word markdown files
  - `word_library/` - Categorized word lists
  - `word_fission_data.csv` - Word relationship data
  - `ecdict_extracted.csv` - Dictionary data (phonetics, definitions)
  - `ai_prompts/` - AI system prompts

### Core Features

1. **Three-Column Layout**: Main interface with resizable panels
   - Left: Word list with search and filtering
   - Center: Interactive force-directed graph visualization
   - Right: Detailed word information with etymology and examples

2. **Word Fission Graph**: Visualizes word relationships using D3 force simulation
   - Nodes represent words (sized by importance)
   - Links show etymological connections
   - Interactive navigation through word families

3. **Quiz System**: Three quiz types
   - Spelling: Type the word from audio/definition
   - Recall: Rate familiarity (Unknown/Hard/Easy)
   - Select: Multiple choice questions

4. **User System**:
   - JWT-based authentication with httpOnly cookies
   - User progress tracking (visits, quiz records)
   - Study plans with daily goals
   - Word notes with social interactions (likes, favorites, comments)

5. **AI Chat**: Context-aware vocabulary tutoring
   - Three chat categories: single word, word group, general
   - Uses DeepSeek API with custom prompts from `data/ai_prompts/`
   - Session-based conversation history

### Data Flow

1. **Word Data Loading** (`src/lib/data.ts`):
   - Reads CSV files for word relationships and dictionary data
   - Generates graph structures with nodes and links
   - Caches data for performance

2. **API Routes**: Follow RESTful patterns
   - `/api/fission?word=X` - Get word graph data
   - `/api/words` - List all words
   - `/api/words/[word]` - Get specific word details
   - `/api/auth/*` - Authentication endpoints
   - `/api/user/*` - User data and progress
   - `/api/quiz/*` - Quiz functionality
   - `/api/ai/*` - AI chat endpoints
   - `/api/notes/*` - Word notes CRUD

3. **Authentication Flow**:
   - Middleware (`src/middleware.ts`) protects all routes except public paths
   - JWT tokens stored in httpOnly cookies
   - API routes handle their own auth checks
   - Admin routes require special admin key validation

### Database Schema

Key models:
- `User` - User accounts with secretKey for registration
- `WordVisit` - Tracks word views for analytics
- `QuizRecord` - Stores quiz results (testType: 1=Spelling, 2=Recall)
- `StudyPlan` - User daily goals
- `WordNote` - User-created word notes
- `NoteInteraction` - Social features (likes, favorites, comments)
- `ChatSession` - AI chat sessions with category (1=word, 2=word group, 3=other)
- `ChatMessage` - Chat message history

## Important Notes

- The application uses a shared PostgreSQL database for both development and production
- Environment variables are in `.env` (not committed to git)
- Word data files are in markdown format in `data/word_text_database/word_database/`
- The production server runs on port 3011 (configured in package.json)
- All user-facing pages require authentication except `/login`
- The app uses Chinese for UI text (user context is Chinese-speaking learners)
