# i18n Implementation Guide

This project uses `next-intl` for internationalization (i18n) with support for Chinese (zh) and English (en).

## Configuration

- **Config file**: `src/i18n/request.ts`
- **Translation files**: `messages/zh.json` and `messages/en.json`
- **Next.js config**: `next.config.js` (wrapped with `withNextIntl`)
- **Default locale**: Chinese (zh)
- **Locale storage**: Cookie (`NEXT_LOCALE`) and database (`User.preferredLanguage`)

## Usage in Components

### Client Components

For client components, use the `useTranslations` hook:

```tsx
'use client';

import { useTranslations } from 'next-intl';

export default function MyComponent() {
  const t = useTranslations();

  return (
    <div>
      <h1>{t('common.loading')}</h1>
      <button>{t('common.save')}</button>
    </div>
  );
}
```

### Server Components

For server components, use the `getTranslations` function:

```tsx
import { getTranslations } from 'next-intl/server';

export default async function MyServerComponent() {
  const t = await getTranslations();

  return (
    <div>
      <h1>{t('common.loading')}</h1>
    </div>
  );
}
```

### Accessing Current Locale

```tsx
import { useLocale } from 'next-intl';

export default function MyComponent() {
  const locale = useLocale(); // 'zh' or 'en'

  return <div>Current language: {locale}</div>;
}
```

## Translation Keys Structure

The translation files are organized into namespaces:

- `common` - Common UI elements (buttons, labels, etc.)
- `nav` - Navigation items
- `wordList` - Word list component
- `wordDetail` - Word detail component
- `quiz` - Quiz functionality
- `dashboard` - Dashboard page
- `settings` - Settings modal
- `auth` - Authentication
- `ai` - AI chat features
- `graph` - Graph visualization
- `notes` - Notes functionality

## Language Switcher Component

The `LanguageSwitcher` component is available for use in any part of the UI:

```tsx
import LanguageSwitcher from '@/components/LanguageSwitcher';

export default function MyComponent() {
  return (
    <div>
      <LanguageSwitcher />
    </div>
  );
}
```

## Adding New Translations

1. Add the key to both `messages/zh.json` and `messages/en.json`
2. Use the key in your component with `t('namespace.key')`

Example:

```json
// messages/zh.json
{
  "myFeature": {
    "title": "我的功能",
    "description": "这是描述"
  }
}

// messages/en.json
{
  "myFeature": {
    "title": "My Feature",
    "description": "This is a description"
  }
}
```

```tsx
const t = useTranslations();
<h1>{t('myFeature.title')}</h1>
```

## Database Integration

User language preferences are stored in the `User` model:

```prisma
model User {
  // ...
  preferredLanguage String @default("zh") // 'zh' or 'en'
}
```

The language preference is:
1. Loaded from the database on login
2. Stored in a cookie (`NEXT_LOCALE`)
3. Updated via the `/api/user/language` endpoint

## Components Updated with i18n

The following components have been updated to use translations:

1. **SettingsModal** - All UI text translated
2. **LanguageSwitcher** - New component for switching languages

## Next Steps for Full i18n Implementation

To complete the i18n implementation across the entire app, update these components:

1. **WordList** - Search placeholder, buttons, labels
2. **WordDetail** - Section headers, buttons
3. **Dashboard** - Page title, filters, labels
4. **Quiz pages** - Instructions, buttons, feedback
5. **Login/Register** - Form labels, error messages
6. **AI Chat** - UI elements, placeholders

Example for WordList:

```tsx
'use client';

import { useTranslations } from 'next-intl';

export default function WordList() {
  const t = useTranslations();

  return (
    <div>
      <input placeholder={t('wordList.searchPlaceholder')} />
      <button>{t('wordList.startQuiz')}</button>
    </div>
  );
}
```

## Testing

To test the i18n implementation:

1. Open the Settings modal
2. Click on the language switcher
3. Verify that the UI updates to the selected language
4. Check that the preference persists after page reload
