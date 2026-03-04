# CLR Figma Plugin

Плагин для Figma, который синхронизирует дизайн-токены между JSON и Variables в файле Figma, а также генерирует документацию в виде фреймов по шаблону.

## Что делает плагин (MVP)

- Импортирует токены из JSON в структуру Variables внутри Figma.
- Импортирует `$type: "gradient"` токены в локальные Paint Styles.
- Экспортирует Variables и локальные Paint Styles обратно в тот же JSON-формат.
- Генерирует документацию токенов в Figma-файле (набор фреймов по шаблону).

## Ориентир

В качестве референса по терминологии и подходам используем документацию Tokens Studio:  
[Design Tokens Fundamentals](https://docs.tokens.studio/fundamentals/design-tokens)

## Статус

На текущем этапе оформлена проектная документация:

- `docs/PROJECT_BRIEF.md` - цели, границы и MVP.
- `docs/ARCHITECTURE.md` - рекомендуемый современный стэк и архитектура.
- `docs/JSON_FORMAT_DRAFT.md` - черновик структуры JSON для импорта/экспорта.
- `docs/DOCUMENTATION_FRAMES_SPEC.md` - шаблон фреймов для автодокументации.
- `docs/ROADMAP.md` - план этапов и критерии готовности.
- `docs/DECISIONS.md` - зафиксированные продуктовые и технические решения.
- `docs/QUESTIONS.md` - открытые вопросы для уточнения.

## Ближайшие шаги

1. Реализовать полноценный export engine.
2. Реализовать docs generator с обновлением существующего фрейма.
3. Добавить тесты для alias, mode values и sync-delete сценариев.

## Каркас проекта

Инициализирован каркас на `create-figma-plugin`:

- `src/main.ts` - entrypoint main контекста плагина (Figma Plugin API).
- `src/ui.tsx` - entrypoint UI плагина.
- `src/types.ts` - типизированные события между UI и main.
- `src/main/variables/index.ts` - import engine для Variables.
- `src/shared/schema/tokens.ts` - базовая Zod-схема токен-файла.
- `manifest.json` - генерируется автоматически командой сборки.

## Что уже работает

- Импорт JSON с валидацией схемы.
- Создание/обновление коллекций, режимов и переменных в Figma.
- Поддержка alias/reference в формате `"{token.path}"` внутри коллекции.
- Удаление переменных, отсутствующих во входном JSON (source of truth policy).
- Принята модель для градиентов: JSON source of truth -> Local Paint Styles в Figma.

## Локальный запуск

```bash
npm install
npm run build
```

После сборки загружай `manifest.json` через Figma (`Plugins -> Development -> Import plugin from manifest...`).

Для watch-режима:

```bash
npm run watch
```
