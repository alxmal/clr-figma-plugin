# JSON FORMAT DRAFT

Документ фиксирует рабочий JSON-формат для операций `import/export` в плагине CLR.

## Принятая стратегия формата

- Плагин называется CLR, но формат токенов не "CLR-специфичный".
- Базируемся на DTCG-подходе и используем совместимые ключи (`$type`, `$value`, reference-строки).
- Допустимы служебные поля в `meta`, не ломающие совместимость.

## Цели формата

- Явно описывать коллекции, режимы и переменные.
- Быть обратимым: `import -> export` должен давать ту же структуру.
- Поддерживать версионирование схемы.

## Рабочий пример (с alias/reference)

```json
{
  "meta": {
    "format": "clr-tokens",
    "version": "0.1.0",
    "source": "design-system-core"
  },
  "collections": [
    {
      "name": "Primitives",
      "modes": ["Light", "Dark"],
      "tokens": {
        "color": {
          "brand": {
            "primary": {
              "$type": "color",
              "$description": "Main brand color",
              "$value": {
                "Light": "#3366FF",
                "Dark": "#82A0FF"
              }
            }
          },
          "text": {
            "primary": {
              "$type": "color",
              "$description": "Primary text color via alias",
              "$value": {
                "Light": "{color.brand.primary}",
                "Dark": "{color.brand.primary}"
              }
            }
          }
        },
        "spacing": {
          "100": {
            "$type": "number",
            "$value": {
              "Light": 4,
              "Dark": 4
            }
          }
        }
      }
    }
  ]
}
```

## Правила

- `meta.format` и `meta.version` обязательны.
- `collections[]` соответствует Figma Variable Collection.
- `modes[]` соответствует наборам mode в коллекции.
- `tokens` хранит иерархию групп; листовой узел - токен.
- У токена обязательно есть:
  - `$type` (`color`, `number`, `string`, `boolean` и т.д.),
  - `$value` (либо одно значение, либо объект по режимам).
- Alias/reference поддерживаются обязательно для MVP в формате `"{token.path}"`.
- Для градиентов используется `$type: "gradient"` со структурированным `$value` (см. раздел ниже).

## Градиенты (`$type: gradient`)

Из-за ограничений Figma Variables (нет нативного типа gradient) градиенты в JSON описываются как токены и маппятся в локальные Paint Styles.

Минимальный пример leaf-токена:

```json
{
  "$type": "gradient",
  "$value": {
    "kind": "linear",
    "angle": 135,
    "stops": [
      { "position": 0, "color": "{color.brand.primary}" },
      { "position": 40, "color": "#7A5CFA", "opacity": 0.72 },
      { "position": 100, "color": "#FFFFFF" }
    ]
  },
  "$extensions": {
    "clr": {
      "styleName": "Pay Gradients/bg/hero"
    }
  }
}
```

Допускаются два варианта `$value`:

- единый объект градиента (одно значение для всех режимов),
- объект по режимам (аналогично другим токенам): `$value[modeName] = gradientObject`.

Структура `gradientObject`:

- `kind`: `linear | radial | angular | diamond`
- `stops`: массив длиной `>= 2`
- `angle`: число (для `linear`, опционально)

Структура `stop`:

- `position`: число `0..100` (проценты)
- `color`: либо hex (`#RRGGBB`/`#RRGGBBAA`), либо alias `"{token.path}"`
- `opacity`: число `0..1`, опционально, допускается только для literal hex цвета

Правило прозрачности stop:

- если `color` — alias/reference, `opacity` для stop запрещен (используется прозрачность из целевого токена),
- если `color` — hex, `opacity` может быть задан явно.

## Маппинг в Figma (принятые правила)

- Путь токена (`color.brand.primary`) является каноническим именем токена в JSON.
- В Figma переменная создаётся как иерархия через `/` (например `color/brand/primary`).
- `$type` маппится на тип переменной Figma:
  - `color` -> `COLOR`
  - `number` -> `FLOAT`
  - `string` -> `STRING`
  - `boolean` -> `BOOLEAN`
- Для mode-specific значений используется карта `$value[modeName]`.
- Alias в `$value` преобразуется в alias/reference соответствующей переменной Figma.
- `$type: "gradient"` маппится в Local Paint Styles:
  - token path (`gradient.bg.hero`) -> имя стиля (`$extensions.clr.styleName`),
  - при отсутствии `styleName` применяется конвенция по имени коллекции:
    - `Product.Pay` -> `Pay Gradients/...`,
    - `Product.Pro` -> `Pro Gradients/...`,
    - `External.S7` -> `S7 Gradients/...`,
    - `Core*` -> `Core Gradients/...`,
  - legacy имена не поддерживаются,
  - `stop.position` (`0..100`) <-> `gradientStops[].position` (`0..1`),
  - literal stop color переносится как RGBA,
  - alias stop color разрешен в JSON и должен сохраняться при export/import без потери структуры.

## Политика синхронизации

- JSON является единственным источником истины.
- При импорте удаляются переменные и коллекции, которых нет в текущем JSON.
- При импорте удаляются локальные gradient styles, которых нет в JSON.
- Обновление должно быть идемпотентным: повторный импорт того же файла не создаёт лишних изменений.

## Рекомендованная архитектура коллекций (multi-product)

Если в одной дизайн-системе несколько продуктов (например `Pay`, `Plus`), рекомендуется:

- держать mode для тем (`Light`, `Dark`, ...), а не для продуктов;
- разделять коллекции по слоям:
  - `Core` - primitives,
  - `Common` - общая семантика,
  - `Product` - продуктовые ветки внутри `tokens`,
  - `External` - внешние/партнерские ветки внутри `tokens`;
- строить ссылки сверху вниз:
  - `Common` -> `Product` / `Core`,
  - `Product` -> `Core`;
- избегать циклических alias-цепочек между продуктами.

См. рабочий шаблон: `examples/multi-product-tokens.json`.

## Ошибки валидации (базовые)

- Неизвестный `$type`.
- Отсутствует значение для одного из объявленных режимов.
- Невалидный hex-цвет для `$type: color`.
- Дублирующиеся token path внутри коллекции.
- Reference указывает на несуществующий token path.
- Для `$type: gradient`: `stops.length < 2`.
- Для `$type: gradient`: `stop.position` вне диапазона `0..100`.
- Для `$type: gradient`: alias stop содержит поле `opacity`.
- Для `$type: gradient`: поле `gradientObject.opacity` не поддерживается.

## Открытые вопросы

- Нужны ли расширения в стиле `$extensions` как в DTCG на первом релизе?
- Нужно ли разделять raw/primitives и semantic токены на уровне схемы уже в MVP?
