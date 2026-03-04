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

## Политика синхронизации

- JSON является единственным источником истины.
- При импорте удаляются переменные в целевой коллекции, которых нет в текущем JSON.
- Обновление должно быть идемпотентным: повторный импорт того же файла не создаёт лишних изменений.

## Ошибки валидации (базовые)

- Неизвестный `$type`.
- Отсутствует значение для одного из объявленных режимов.
- Невалидный hex-цвет для `$type: color`.
- Дублирующиеся token path внутри коллекции.
- Reference указывает на несуществующий token path.

## Открытые вопросы

- Нужны ли расширения в стиле `$extensions` как в DTCG на первом релизе?
- Нужно ли разделять raw/primitives и semantic токены на уровне схемы уже в MVP?
