# ARCHITECTURE AND TECH STACK

## Рекомендуемый современный стэк

### Core

- TypeScript (строгий режим) для кода плагина и UI.
- `create-figma-plugin` как основной toolkit для сборки и манифеста.
- Preact UI (`@create-figma-plugin/ui`) для нативного плагин-UI.
- Figma Plugin API + `@figma/plugin-typings` для типизации main-контекста.

### UI слой

- `@create-figma-plugin/ui` как базовый набор компонентов.
- Типизированные события через `@create-figma-plugin/utilities` (`emit/on`).
- При необходимости возможен отдельный экспериментальный UI-слой на React/shadcn, но текущий production-каркас на create-figma-plugin.

### Валидация и данные

- `zod` для схем и валидации импортируемого JSON.
- Явная нормализация данных в общий внутренний формат (`TokenGraph`).

### Качество кода

- ESLint + TypeScript ESLint.
- Prettier.
- Vitest для unit-тестов (parser/mapper/exporter).

## Почему этот стэк

- TypeScript + Zod уменьшают риск некорректного импорта токенов.
- `create-figma-plugin` снижает риск runtime-проблем и даёт проверенный build-пайплайн для Figma.
- `@create-figma-plugin/ui` ускоряет сборку UI без ручной настройки инфраструктуры.
- Подход хорошо масштабируется от MVP к более сложным сценариям.

## Архитектура плагина

Figma-плагин состоит из двух частей:

1. Main context (`main.ts`):
   - Доступ к Figma Plugin API.
   - Создание/обновление Variables и фреймов.
   - Операции чтения Variables для экспорта.
2. UI context (`ui.tsx`):
   - Формы импорта/экспорта.
   - Предпросмотр и валидация JSON.
   - Управление запуском операций.

Связь через типизированные события `emit/on`.

## Предлагаемая структура проекта

```text
clr-figma-plugin/
  README.md
  docs/
    PROJECT_BRIEF.md
    ARCHITECTURE.md
    JSON_FORMAT_DRAFT.md
    DOCUMENTATION_FRAMES_SPEC.md
    ROADMAP.md
    QUESTIONS.md
  src/
    main.ts
    ui.tsx
    main/
      variables/
      docs-generator/
    shared/
      schema/
      mappers/
    types.ts
```

## Важные технические принципы

- Единая схема данных для import и export (один источник правды).
- Идемпотентность: повторный импорт того же JSON не должен ломать структуру.
- Прозрачные ошибки: понятные сообщения в UI с указанием пути до проблемного поля.
- Версионирование JSON-формата через поле `meta.version`.
