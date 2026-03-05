# DECISIONS LOG

Фиксация принятых решений по продукту и архитектуре.

## 2026-03-04

### Формат токенов

- Плагин называется CLR, но формат токенов берём DTCG-совместимый.
- Используем ключи вида `$type`, `$value` и строковые references `"{token.path}"`.

### Alias/reference

- Alias обязательны уже в MVP.
- Базовые токены должны переиспользоваться в семантических токенах через reference.

### Нейминг

- Канонический token path в JSON: через `.` (пример: `color.brand.primary`).
- В Figma Variables используем иерархию через `/` (пример: `color/brand/primary`).

### Генерация документации

- При `Generate docs` обновляем существующий корневой фрейм.
- Если фрейма нет, создаём новый.

### Source of truth

- JSON - единственный источник истины.
- При импорте удаляем переменные, которых нет во входном JSON.
- Для градиентов source of truth также JSON: токены `$type: "gradient"` импортируются в локальные Paint Styles.

### Градиенты и ограничения Figma Variables

- Figma Variables не поддерживают тип `gradient`, поэтому градиенты храним как токены в JSON и материализуем в `Local Paint Styles`.
- При импорте:
  - токены `color/number/string/boolean` -> Variables,
  - токены `gradient` -> Local Paint Styles.
- При экспорте:
  - Variables и Local Paint Styles сериализуются обратно в единый JSON.
- Для отображения в UI переменных допускается производная (derived) коллекция строк/полей, но она не является source of truth.

### Tooling

- Базовый каркас переведён на `create-figma-plugin` для более стабильного Figma runtime/build workflow.

## 2026-03-05

### Multi-product collections

- Для систем с несколькими продуктами используем unified-коллекции:
  - `Common`
  - `Core`
  - `Product` (ветки продуктов внутри `tokens`)
  - `External` (ветки партнеров внутри `tokens`)
- Продукт не моделируется через mode; mode оставляем для тем (`Light/Dark/...`).

### Gradient style naming

- Градиенты остаются токенами `$type: "gradient"` в JSON и материализуются в Local Paint Styles.
- Нейминг styleName нормализуется по коллекции:
  - `Product.<Name>` -> `<Name> Gradients/...`
  - `External.<Name>` -> `<Name> Gradients/...`
  - `Core*` -> `Core Gradients/...`
- Legacy naming (`*.Gradients`, `product/.../gradient/...`) не поддерживается.

### Import sync cleanup

- `Apply JSON to Figma` выполняет полный sync:
  - удаляет локальные variable collections, которых нет во входном JSON;
  - удаляет локальные gradient styles, которых нет во входном JSON.
- Цель: предсказуемое состояние файла после каждого импорта без "хвостов" от старой структуры.
