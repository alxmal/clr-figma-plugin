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
- Полная синхронизация по source of truth: удаление переменных/коллекций, отсутствующих во входном JSON.
- Принята модель для градиентов: JSON source of truth -> Local Paint Styles в Figma.
- Полная синхронизация gradient styles: удаляются локальные gradient styles, отсутствующие во входном JSON.
- Генерация документации по коллекциям токенов в отдельных фреймах.

## Что планируется следующим шагом

- Отдельный dev-export transformer (вне plugin runtime), который конвертирует source JSON в:
  - `tokens.css` с CSS custom properties (`var(...)`),
  - `tokens.resolved.json` с раскрытыми alias,
  - frontend-friendly представление gradient-токенов.

## Рекомендованная структура для multi-product систем

Для систем с несколькими продуктами (`Pay`, `Plus`, ...) используйте unified-коллекции:

- `Common` - общая семантика (например `Fill`, `Typography`, aliases на базу).
- `Core` - базовые primitives (palette, spacing, radius, typography scale).
- `Product` - продуктовые токены в ветках (`Product.Pay`, `Product.Plus` внутри `tokens`).
- `External` - внешние/партнерские ветки (`External.S7`, `External.X5` внутри `tokens`).

Практические правила:

- Продукт не должен быть mode (mode оставляем для `Light/Dark` и подобных тем).
- Состояния (`hover/active/disabled`) задаются именами токенов, а не mode.
- `Common` ссылается на `Product`/`Core`, `Product` при необходимости ссылается на `Core`.
- Градиенты хранятся как `$type: "gradient"` и маппятся в Local Paint Styles.
- Рекомендуемый нейминг gradient styles:
  - `Product.Pay` -> `Pay Gradients/...`
  - `Product.Pro` -> `Pro Gradients/...`
  - `External.S7` -> `S7 Gradients/...`
  - `Core*` -> `Core Gradients/...`
  - Legacy naming не поддерживается.

Готовый шаблон: `examples/multi-product-tokens.json`.

Для миграции существующего JSON в эту архитектуру можно использовать утилиту:

```bash
npm run migrate:multi-product -- \
  --input examples/test-tokens.json \
  --rules examples/multi-product-migration-rules.json \
  --output examples/test-tokens.migrated.json
```

Примечание: правила в `examples/multi-product-migration-rules.json` — стартовый шаблон, его нужно адаптировать под реальные имена коллекций/префиксы в вашем проекте.

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
