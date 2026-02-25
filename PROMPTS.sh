#!/usr/bin/env bash
set -euo pipefail

OUT_FILE="PROMPTS.md"
: > "$OUT_FILE"

cat << EOF >> "$OUT_FILE"
==== user ====
нужно написать библиотеку для **автоматической генерации CRUD-эндпоинтов** над таблицами PostgreSQL в экосистеме \`the-api\`. Одной строкой \`router.crud({ table: 'users' })\` создаётся полный набор REST-маршрутов.
- bun, typescript
- Hono

==== assistant ====


## Архитектура (3 модуля)

### 1. \`Routings\` — маршрутизатор
- Обёртка над Hono: методы \`get\`, \`post\`, \`put\`, \`patch\`, \`delete\`, \`use\`, \`all\`
- Метод **\`crud()\`** — автогенерация 6 маршрутов:
  \`\`\`
  GET    /{table}       — список
  POST   /{table}       — создание
  GET    /{table}/:id   — по ID
  PUT    /{table}/:id   — замена
  PATCH  /{table}/:id   — обновление
  DELETE /{table}/:id   — удаление
  \`\`\`
- Регистрация **ошибок** и **email-шаблонов**
- Поддержка **миграций** через \`migrationDirs\`

### 2. \`CrudBuilder\` — ядро бизнес-логики
Основной и самый крупный файл (~550 строк). Функциональность:

| Возможность | Реализация |
|---|---|
| **Фильтрация** | \`where\`, \`whereNot\` (\`!\`), \`ilike\` (\`~\`), \`_null_\`, \`_not_null_\`, \`_in_\`, \`_not_in_\`, \`_from_\`/\`_to_\` |
| **Пагинация** | \`_page\`, \`_limit\`, \`_skip\`, \`_unlimited\`, курсорная (\`_after\`) |
| **Сортировка** | \`_sort=-created,name,random()\` |
| **Выбор полей** | \`_fields=id,name\` |
| **JOIN-ы** | \`join\`, \`leftJoin\`, \`joinOnDemand\` (по запросу через \`_join\`) |
| **Мультиязычность** | \`_lang=de\`, COALESCE-подстановка из таблицы \`langs\` |
| **Полнотекстовый поиск** | \`_search\` через триграммы PostgreSQL (\`%\`, \`<->\`) |
| **Soft delete** | \`isDeleted\` + \`deletedReplacements\` |
| **Права доступа** | \`tokenRequired\`, \`ownerRequired\`, \`rootRequired\`, \`accessByStatuses\`, permission-based скрытие полей |
| **Скрытые/readonly поля** | \`hiddenFields\`, \`readOnlyFields\` (с учётом owner/roles) |
| **Связи** | \`relations\` — вложенные CRUD-конфигурации |

### 3. \`types.ts\` — типизация
~120 строк типов: \`CrudBuilderOptionsType\`, \`CrudBuilderPermissionsType\`, \`metaType\`, \`getResultType\` и др.

## Зависимости

\`\`\`
hono       — HTTP-фреймворк
flattening — развёртка вложенных объектов (для whereBindings)
knex       — SQL-конструктор (peer/dev)
\`\`\`

## Ключевые особенности

- **PostgreSQL-ориентирован**: \`json_build_object\`, \`jsonb_agg\`, \`COALESCE\`-подзапросы, триграммный поиск, \`RANDOM()\`
- **Мета-данные пагинации**: \`total\`, \`pages\`, \`nextPage\`, \`isFirstPage\`, \`isLastPage\`, \`nextAfter\` (курсор)
- **Self-documenting**: метод \`optionsGet()\` возвращает описание всех доступных query-параметров для OpenAPI/клиентов
- **Тестов нет** — директория \`test\` пуста

## Схема работы

\`\`\`
Запрос → Hono → Routings.crud() → CrudBuilder
  → fields() + where() + sort() + pagination()
  → Knex → PostgreSQL
  → deleteHiddenFields → response { result, meta }
\`\`\`

---

EOF

write_user() {
  local text="$1"
  {
    echo "==== user ===="
    echo "$text"
    echo ""
  } >> "$OUT_FILE"
}

write_assistant_header() {
  {
    echo "==== assistant ===="
    echo ""
  } >> "$OUT_FILE"
}

append_file() {
  local file="$1"
  local lang="$2"

  if [[ ! -f "$file" ]]; then
    return
  fi

  {
    echo "### $file"
    echo "\`\`\`$lang"
    cat "$file"
    echo "\`\`\`"
    echo ""
  } >> "$OUT_FILE"
}

write_user "Покажи структуру проекта и ключевые файлы."
write_assistant_header
{
  echo "## Project Structure"
  echo ""

  if command -v tree >/dev/null 2>&1; then
    tree -a -L 3 src test 2>/dev/null || true
  else
    find src test -maxdepth 3 -print 2>/dev/null | sort || true
  fi

  echo ""
  echo "## Key Files"
  echo ""
} >> "$OUT_FILE"

append_file "README.md" "markdown"
append_file "package.json" "json"
append_file "tsconfig.json" "json"
append_file ".gitignore" "gitignore"

write_user "Теперь приложи исходники из src и test."
write_assistant_header
{
  echo "## Source Code"
  echo ""
} >> "$OUT_FILE"

while IFS= read -r file; do
  append_file "$file" "ts"
done < <(find src -type f -name "*.ts" | sort)

while IFS= read -r file; do
  append_file "$file" "ts"
done < <(find test -type f -name "*.sh" | sort)

wc -l "$OUT_FILE"
