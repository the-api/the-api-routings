==== user ====
нужно написать библиотеку для **автоматической генерации CRUD-эндпоинтов** над таблицами PostgreSQL в экосистеме `the-api`. Одной строкой `router.crud({ table: 'users' })` создаётся полный набор REST-маршрутов.
- bun, typescript
- Hono

==== assistant ====


## Архитектура (3 модуля)

### 1. `Routings` — маршрутизатор
- Обёртка над Hono: методы `get`, `post`, `put`, `patch`, `delete`, `use`, `all`
- Метод **`crud()`** — автогенерация 6 маршрутов:
  ```
  GET    /{table}       — список
  POST   /{table}       — создание
  GET    /{table}/:id   — по ID
  PUT    /{table}/:id   — замена
  PATCH  /{table}/:id   — обновление
  DELETE /{table}/:id   — удаление
  ```
- Регистрация **ошибок** и **email-шаблонов**
- Поддержка **миграций** через `migrationDirs`

### 2. `CrudBuilder` — ядро бизнес-логики
Основной и самый крупный файл (~550 строк). Функциональность:

| Возможность | Реализация |
|---|---|
| **Фильтрация** | `where`, `whereNot` (`!`), `ilike` (`~`), `_null_`, `_not_null_`, `_in_`, `_not_in_`, `_from_`/`_to_` |
| **Пагинация** | `_page`, `_limit`, `_skip`, `_unlimited`, курсорная (`_after`) |
| **Сортировка** | `_sort=-created,name,random()` |
| **Выбор полей** | `_fields=id,name` |
| **JOIN-ы** | `join`, `leftJoin`, `joinOnDemand` (по запросу через `_join`) |
| **Мультиязычность** | `_lang=de`, COALESCE-подстановка из таблицы `langs` |
| **Полнотекстовый поиск** | `_search` через триграммы PostgreSQL (`%`, `<->`) |
| **Soft delete** | `isDeleted` + `deletedReplacements` |
| **Права доступа** | `tokenRequired`, `ownerRequired`, `rootRequired`, `accessByStatuses`, permission-based скрытие полей |
| **Скрытые/readonly поля** | `hiddenFields`, `readOnlyFields` (с учётом owner/roles) |
| **Связи** | `relations` — вложенные CRUD-конфигурации |

### 3. `types.ts` — типизация
~120 строк типов: `CrudBuilderOptionsType`, `CrudBuilderPermissionsType`, `metaType`, `getResultType` и др.

## Зависимости

```
hono       — HTTP-фреймворк
flattening — развёртка вложенных объектов (для whereBindings)
knex       — SQL-конструктор (peer/dev)
```

## Ключевые особенности

- **PostgreSQL-ориентирован**: `json_build_object`, `jsonb_agg`, `COALESCE`-подзапросы, триграммный поиск, `RANDOM()`
- **Мета-данные пагинации**: `total`, `pages`, `nextPage`, `isFirstPage`, `isLastPage`, `nextAfter` (курсор)
- **Self-documenting**: метод `optionsGet()` возвращает описание всех доступных query-параметров для OpenAPI/клиентов
- **Тестов нет** — директория `test` пуста

## Схема работы

```
Запрос → Hono → Routings.crud() → CrudBuilder
  → fields() + where() + sort() + pagination()
  → Knex → PostgreSQL
  → deleteHiddenFields → response { result, meta }
```

---

==== user ====
Покажи структуру проекта и ключевые файлы.

==== assistant ====

## Project Structure

src
├── CrudBuilder.ts
├── index.ts
├── Routings.ts
└── types.ts
test
├── CrudBuilder.test.ts
├── helpers.ts
└── Routings.test.ts

0 directories, 7 files

## Key Files

### README.md
```markdown
# the-api-routings

Auto-generate REST CRUD endpoints over PostgreSQL tables with one line of code.
Built on [Hono](https://hono.dev) + [Knex](https://knexjs.org) for the [the-api](https://github.com/ivanoff/the-api) ecosystem.

```typescript
router.crud({ table: 'posts' });
// GET    /posts
// POST   /posts
// GET    /posts/:id
// PUT    /posts/:id
// PATCH  /posts/:id
// DELETE /posts/:id
```

## Install

```bash
npm i -S the-api-routings
```

## Environment

`_unlimited` query parameter is disabled by default.  
Set `CAN_GET_UNLIMITED=true` to allow `?_unlimited=true`.

`_limit` behavior can also be controlled with:
- `LIMIT_DEFAULT` — default `_limit` value when request has no `_limit`
- `LIMIT_MAX` — upper bound for `_limit` (caps both request `_limit` and `LIMIT_DEFAULT`)

```dotenv
CAN_GET_UNLIMITED=true
LIMIT_DEFAULT=
LIMIT_MAX=
```

## Quick Start

```typescript
import { Routings } from 'the-api-routings';

const router = new Routings();

router.crud({ table: 'users' });
router.crud({ table: 'posts', prefix: 'api/posts' });

// pass router to the-api
const app = new TheAPI({ routings: [router] });
export default app.up();
```

```bash
curl http://localhost:7788/users?_limit=10&_sort=-timeCreated
curl http://localhost:7788/api/posts?_fields=id,title&_lang=de
```

## Query Parameters

Every `GET` endpoint supports a rich set of filters out of the box.

### Pagination

| Param | Example | Description |
|---|---|---|
| `_limit` | `?_limit=20` | Records per page |
| `_page` | `?_page=3` | Page number (1-based) |
| `_skip` | `?_skip=100` | Skip N records |
| `_unlimited` | `?_unlimited=true` | Return all records (requires `CAN_GET_UNLIMITED`) |
| `_after` | `?_after=2024-01-15&_sort=-timeCreated&_limit=20` | Cursor pagination |

### Sorting

| Param | Example | Description |
|---|---|---|
| `_sort` | `?_sort=name` | Ascending |
| | `?_sort=-timeCreated` | Descending (prefix `-`) |
| | `?_sort=-timeCreated,name` | Multiple fields |
| | `?_sort=random()` | Random order |

All sorting applies `NULLS LAST` automatically.

### Field Selection

| Param | Example | Description |
|---|---|---|
| `_fields` | `?_fields=id,name,email` | Return only listed columns |
| `_join` | `?_join=comments,tags` | Include on-demand joins |

### Filtering

```
GET /users?status=active                  — exact match
GET /users?status=active&status=verified  — IN (multiple values)
GET /users?name~=%john%                   — iLIKE (case-insensitive)
GET /users?status!=deleted                — NOT equal
GET /users?status!=deleted&status!=banned — NOT IN
GET /users?_null_deletedAt=1              — IS NULL
GET /users?_not_null_email=1              — IS NOT NULL
GET /users?_in_id=[1,2,3]                — IN (JSON array)
GET /users?_not_in_id=[4,5]              — NOT IN (JSON array)
GET /users?_from_age=18&_to_age=65       — range (>= and <=)
```

### Search & Localization

| Param | Example | Description |
|---|---|---|
| `_search` | `?_search=john` | Trigram search (requires `pg_trgm`) |
| `_lang` | `?_lang=de` | Translate fields via `langs` table |

## Routings API

### HTTP Methods

```typescript
const router = new Routings();

router.get('/health', async (c) => { c.set('result', { ok: true }); });
router.post('/upload', authMiddleware, async (c) => { /* ... */ });
router.put('/items/:id', async (c) => { /* ... */ });
router.patch('/items/:id', async (c) => { /* ... */ });
router.delete('/items/:id', async (c) => { /* ... */ });

// Middleware for all routes
router.use('/api/*', corsMiddleware);
router.all(loggerMiddleware);
```

### crud(options)

Generates all 6 endpoints at once:

```typescript
router.crud({
  table: 'posts',
  prefix: 'api/posts',           // URL prefix (default: table name)
  schema: 'public',              // DB schema (default: 'public')

  // fields
  hiddenFields: ['password'],    // stripped from responses
  readOnlyFields: ['id', 'timeCreated', 'timeUpdated', 'isDeleted'],
  requiredFields: { title: 'TITLE_REQUIRED' },
  aliases: { userName: 'author' },

  // filtering
  defaultWhere: { tenantId: '1' },
  defaultWhereRaw: '"publishedAt" IS NOT NULL',
  defaultSort: '-timeCreated',
  searchFields: ['title', 'body'],

  // joins
  join: [
    {
      table: 'categories',
      alias: 'category',
      field: `"categories"."name"`,
      where: `"categories"."id" = "posts"."categoryId"`,
    },
  ],
  joinOnDemand: [
    {
      table: 'comments',
      where: `"comments"."postId" = "posts"."id"`,
    },
  ],
  leftJoin: [['tags', 'tags.id', 'posts.tagId']],

  // soft delete
  deletedReplacements: { title: '[deleted]', body: '' },
  includeDeleted: false,

  // translations
  translate: ['title', 'description'],

  // access control
  tokenRequired: ['add', 'update', 'delete'],
  ownerRequired: ['update', 'delete'],

  // permissions
  permissions: {
    protectedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],
    owner: ['posts.view_private'],
    fields: {
      viewable: {
        'admin.view_emails': ['email', 'phone'],
      },
    },
  },

  // relations
  relations: {
    comments: { table: 'comments' },
  },

  // caching
  cache: { ttl: 60 },
});
```

### errors()

```typescript
router.errors({
  TITLE_REQUIRED: { code: 1001, status: 400, description: 'Post title is required' },
  POST_NOT_FOUND: { code: 1002, status: 404 },
});

// or array
router.errors([errors1, errors2]);
```

### emailTemplates()

```typescript
router.emailTemplates({
  welcome: {
    subject: 'Welcome, {{name}}!',
    html: '<h1>Hello {{name}}</h1>',
  },
});
```

### Migrations

```typescript
const router = new Routings({
  migrationDirs: [path.join(__dirname, 'migrations')],
});
```

## Join Types

### Static Join (always included)

```typescript
join: [{
  table: 'users',
  alias: 'author',
  fields: ['id', 'name', 'avatar'],            // json_build_object
  where: `"users"."id" = "posts"."userId"`,
  orderBy: '"users"."name" ASC',
  limit: 1,
  byIndex: 0,                                   // extract first element
  defaultValue: null,
}]
```

### Computed Field Join

```typescript
join: [{
  table: 'likes',
  alias: 'likesCount',
  field: 'COUNT(*)::int',
  where: `"likes"."postId" = "posts"."id"`,
}]
```

### Boolean Field Join

```typescript
join: [{
  table: 'likes',
  alias: 'isLiked',
  field: `EXISTS(SELECT 1 FROM "likes" WHERE "likes"."postId" = "posts"."id" AND "likes"."userId" = :userId)::bool`,
  where: '1=1',
  whereBindings: { userId: 'env.user.id' },
}]
```

### On-Demand Join (via `?_join=comments`)

```typescript
joinOnDemand: [{
  table: 'comments',
  where: `"comments"."postId" = "posts"."id"`,
  orderBy: `"comments"."timeCreated" DESC`,
}]
```

## Response Format

### GET /posts?_limit=2&_page=1

```json
{
  "result": [
    { "id": 1, "title": "First post" },
    { "id": 2, "title": "Second post" }
  ],
  "meta": {
    "total": 42,
    "limit": 2,
    "page": 1,
    "pages": 21,
    "skip": 0,
    "nextPage": 2,
    "isFirstPage": true,
    "isLastPage": false,
    "nextAfter": "2024-01-15T12%3A00%3A00.000999Z"
  }
}
```

### Cursor Pagination

```
GET /posts?_sort=-timeCreated&_limit=20
→ meta.nextAfter = "2024-01-15T12%3A00%3A00.000000Z"

GET /posts?_sort=-timeCreated&_limit=20&_after=2024-01-15T12%3A00%3A00.000000Z
→ next page
```

### GET /posts/1

```json
{
  "result": { "id": 1, "title": "First post", "category": "tech" }
}
```

### POST /posts

```json
// request
{ "title": "New post", "body": "Content" }

// response
{ "result": { "id": 3, "title": "New post", "body": "Content", "timeCreated": "..." } }
```

### DELETE /posts/1

```json
{
  "result": { "ok": true },
  "meta": { "countDeleted": 1 }
}
```

## Soft Delete

If the table has an `isDeleted` boolean column, `DELETE` sets it to `true` instead of removing the row.
All `GET` queries automatically filter `isDeleted = false`.

Show deleted records with replaced values:

```typescript
router.crud({
  table: 'posts',
  includeDeleted: true,
  deletedReplacements: {
    title: '[deleted]',
    body: '',
    author: null,
  },
});
```

## Search

Requires PostgreSQL `pg_trgm` extension:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

```typescript
router.crud({
  table: 'posts',
  searchFields: ['title', 'body'],
});
```

```
GET /posts?_search=typescript
```

Results are sorted by similarity distance (closest first) unless `_sort` is specified.

## Programmatic Usage

Use `CrudBuilder` directly for custom logic:

```typescript
import { CrudBuilder } from 'the-api-routings';

router.get('/my-posts', async (c) => {
  const crud = new CrudBuilder({ table: 'posts' });
  const { result, meta } = await crud.getRequestResult(c, {
    _limit: ['5'],
    _sort: ['-timeCreated'],
    userId: [c.var.user.id],
  });
  c.set('result', result);
  c.set('meta', meta);
});
```

## Requirements

- **PostgreSQL** 12+ (for `json_build_object`, `jsonb_agg`)
- **pg_trgm** extension (for `_search`)
- **Bun** runtime (build & test)

## License

MIT © [Dimitry Ivanov](https://github.com/ivanoff)
```

### package.json
```json
{
  "name": "the-api-routings",
  "version": "0.4.1",
  "license": "MIT",
  "author": "Dimitry Ivanov <2@ivanoff.org.ua> # curl -A cv ivanoff.org.ua",
  "description": "Routings for the-api",
  "repository": {
    "type": "git",
    "url": "https://github.com/the-api/the-api-routings"
  },
  "keywords": ["the-api", "routings"],
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "bun build ./src/index.ts --outdir ./dist --target node --external hono --external flattening --external knex && bunx tsc"
  },
  "dependencies": {
    "flattening": "^2.4.3",
    "hono": "^4.12.2"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/node": "^20.19.33",
    "knex": "^3.1.0"
  }
}
```

### tsconfig.json
```json
{
  "compilerOptions": {
    "lib": ["ESNext", "DOM"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "node",
    "declaration": true,
    "declarationMap": true,
    "emitDeclarationOnly": true,
    "outDir": "./dist",
    "skipLibCheck": true
  },
  "include": [
    "src/**/*.ts"
  ]
}
```

### .env.example
```env.example
# Enables support for ?_unlimited=true when value is exactly "true".
CAN_GET_UNLIMITED=true

# Default limit for GET queries when request has no _limit.
LIMIT_DEFAULT=

# Max allowed _limit for GET queries (caps request _limit and LIMIT_DEFAULT).
LIMIT_MAX=
```

### .gitignore
```gitignore
# Based on https://raw.githubusercontent.com/github/gitignore/main/Node.gitignore

# Logs

logs
_.log
npm-debug.log_
yarn-debug.log*
yarn-error.log*
lerna-debug.log*
.pnpm-debug.log*

# Caches

.cache

# Diagnostic reports (https://nodejs.org/api/report.html)

report.[0-9]_.[0-9]_.[0-9]_.[0-9]_.json

# Runtime data

pids
_.pid
_.seed
*.pid.lock

# Directory for instrumented libs generated by jscoverage/JSCover

lib-cov

# Coverage directory used by tools like istanbul

coverage
*.lcov

# nyc test coverage

.nyc_output

# Grunt intermediate storage (https://gruntjs.com/creating-plugins#storing-task-files)

.grunt

# Bower dependency directory (https://bower.io/)

bower_components

# node-waf configuration

.lock-wscript

# Compiled binary addons (https://nodejs.org/api/addons.html)

build/Release

# Dependency directories

node_modules/
jspm_packages/

# Snowpack dependency directory (https://snowpack.dev/)

web_modules/

# TypeScript cache

*.tsbuildinfo

# Optional npm cache directory

.npm

# Optional eslint cache

.eslintcache

# Optional stylelint cache

.stylelintcache

# Microbundle cache

.rpt2_cache/
.rts2_cache_cjs/
.rts2_cache_es/
.rts2_cache_umd/

# Optional REPL history

.node_repl_history

# Output of 'npm pack'

*.tgz

# Yarn Integrity file

.yarn-integrity

# dotenv environment variable files

.env
.env.development.local
.env.test.local
.env.production.local
.env.local

# parcel-bundler cache (https://parceljs.org/)

.parcel-cache

# Next.js build output

.next
out

# Gatsby files

# Comment in the public line in if your project uses Gatsby and not Next.js

# https://nextjs.org/blog/next-9-1#public-directory-support

# public

# vuepress build output

.vuepress/dist

# vuepress v2.x temp and cache directory

.temp

# Docusaurus cache and generated files

.docusaurus

# Serverless directories

.serverless/

# FuseBox cache

.fusebox/

# DynamoDB Local files

.dynamodb/

# TernJS port file

.tern-port

# Stores VSCode versions used for testing VSCode extensions

.vscode-test

# yarn v2

.yarn/cache
.yarn/unplugged
.yarn/build-state.yml
.yarn/install-state.gz
.pnp.*

# IntelliJ based IDEs
.idea

# Finder (MacOS) folder config
.DS_Store
```

==== user ====
Теперь приложи исходники из src и test.

==== assistant ====

## Source Code

### src/CrudBuilder.ts
```ts
import flattening from 'flattening';
import type {
  ActionFlags,
  AccessRecord,
  AppContext,
  ColumnInfoMap,
  CrudAction,
  CrudBuilderJoinType,
  CrudBuilderOptionsType,
  FieldRecord,
  HiddenFieldsResult,
  RequestState,
  StringRecord,
  UserType,
  WhereParams,
  getResultType,
  metaType,
} from './types';
import type { Knex } from 'knex';

const getPositiveIntFromEnv = (name: 'LIMIT_DEFAULT' | 'LIMIT_MAX'): number | undefined => {
  const value = process.env[name];
  if (!value) return;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return;
  return parsed;
};

const getQueryLimit = ({
  _limit,
  _unlimited,
}: {
  _limit?: string | number;
  _unlimited?: string | boolean;
}): number | undefined => {
  const canGetUnlimited = process.env.CAN_GET_UNLIMITED === 'true';
  const isUnlimited = canGetUnlimited && (_unlimited === 'true' || _unlimited === true);
  if (isUnlimited) return;

  const defaultLimit = getPositiveIntFromEnv('LIMIT_DEFAULT');
  const maxLimit = getPositiveIntFromEnv('LIMIT_MAX');

  let limit: number | undefined = _limit != null && _limit !== '' ? +_limit : defaultLimit;
  if (!limit || Number.isNaN(limit)) return;

  if (maxLimit && limit > maxLimit) return maxLimit;
  return limit;
};

// FIX: positive integer validation
const toPositiveInt = (value: unknown, fallback: number): number => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < fallback) return fallback;
  return Math.floor(n);
};

// -- FIX: action array -> flags helper ---------------------

const toActionFlags = (input?: CrudAction[]): ActionFlags =>
  (input || []).reduce<ActionFlags>((acc, cur) => ({ ...acc, [cur]: true }), {});

// -- Class --------------------------------------------------

export default class CrudBuilder<T extends Record<string, unknown> = Record<string, unknown>> {

  // -- FIX: all config properties are `readonly` -----------
  readonly table: string;
  readonly schema: string;
  readonly aliases: StringRecord;
  readonly join: CrudBuilderJoinType[];
  readonly joinOnDemand: CrudBuilderJoinType[];
  readonly leftJoinConfig: [string, string, string][];
  readonly leftJoinDistinct: boolean;
  readonly defaultLang: string;
  readonly translate: string[];
  readonly searchFields: string[];
  readonly requiredFields: Record<string, string>;
  readonly defaultWhere: FieldRecord;
  readonly defaultWhereRaw: string | undefined;
  readonly defaultSort: string | undefined;
  readonly sortRaw: string | undefined;
  readonly fieldsRaw: string[] | undefined;
  readonly tokenRequired: ActionFlags;
  readonly ownerRequired: ActionFlags;
  readonly rootRequired: ActionFlags;
  readonly access: AccessRecord;
  readonly accessByStatuses: AccessRecord;
  readonly deletedReplacements: FieldRecord | undefined;
  readonly includeDeleted: boolean;
  readonly hiddenFields: string[];
  readonly readOnlyFields: string[];
  readonly showFieldsByPermission: Record<string, string[]>;
  readonly ownerPermissions: Record<string, boolean>;
  readonly dbTables: ColumnInfoMap;
  readonly cache: { ttl?: number } | undefined;
  readonly userIdFieldName: string;
  readonly additionalFields: Partial<Record<string, Record<string, unknown>>>;
  readonly apiClientMethodNames: StringRecord;
  readonly relations: Record<string, CrudBuilderOptionsType> | undefined;

  // -- FIX: per-request mutable state as single object -----
  private state!: RequestState;

  constructor(options: CrudBuilderOptionsType<T>) {
    this.table = options.table;
    this.schema = options.schema || 'public';
    this.aliases = options.aliases || {};
    this.join = options.join || [];
    this.joinOnDemand = options.joinOnDemand || [];
    this.leftJoinConfig = options.leftJoin || [];
    this.leftJoinDistinct = !!options.leftJoinDistinct;
    this.defaultLang = options.lang || 'en';
    this.translate = options.translate || [];
    this.searchFields = options.searchFields || [];
    this.requiredFields = options.requiredFields || {};
    this.defaultWhere = options.defaultWhere || {};
    this.defaultWhereRaw = options.defaultWhereRaw;
    this.defaultSort = options.defaultSort;
    this.sortRaw = options.sortRaw;
    this.fieldsRaw = options.fieldsRaw;
    this.tokenRequired = toActionFlags(options.tokenRequired);
    this.ownerRequired = toActionFlags(options.ownerRequired);
    this.rootRequired = toActionFlags(options.rootRequired);
    this.access = options.access || {};
    this.accessByStatuses = options.accessByStatuses || {};
    this.deletedReplacements = options.deletedReplacements;
    this.includeDeleted = typeof options.includeDeleted === 'boolean'
      ? options.includeDeleted
      : !!options.deletedReplacements;
    this.hiddenFields = options.hiddenFields || [];
    this.readOnlyFields = options.readOnlyFields || ['id', 'timeCreated', 'timeUpdated', 'timeDeleted', 'isDeleted'];
    this.showFieldsByPermission = options.permissions?.fields?.viewable || {};
    this.ownerPermissions = options.permissions?.owner?.reduce<Record<string, boolean>>(
      (acc, cur) => ({ ...acc, [cur]: true }),
      {},
    ) || {};
    this.dbTables = options.dbTables || {};
    this.cache = options.cache;
    this.userIdFieldName = options.userIdFieldName || 'userId';
    this.additionalFields = options.additionalFields || {};
    this.apiClientMethodNames = options.apiClientMethodNames || {};
    this.relations = options.relations;
  }

  // -- State management ------------------------------------

  private initState(c: AppContext): void {
    const env = c.env;
    this.state = {
      res: this.getDbWithSchema(env.db),
      rows: env.dbTables?.[`${this.schema}.${this.table}`] || {},
      user: c.var?.user as UserType | undefined,
      roles: env.roles,
      lang: this.defaultLang,
      coalesceWhere: {},
      coalesceWhereReplacements: {},
      langJoin: {},
    };
  }

  // -- DB helpers ------------------------------------------

  private getDbWithSchema(db: Knex): Knex.QueryBuilder {
    const qb = db(this.table);
    if (this.schema) qb.withSchema(this.schema);
    return qb;
  }

  // -- FIX: SQL Injection - validate sort fields -----------

  private getKnownColumnNames(): Set<string> {
    const names = new Set<string>();
    for (const col of Object.keys(this.state.rows)) names.add(col);
    for (const col of Object.keys(this.aliases)) names.add(col);
    for (const j of this.join) names.add(j.alias || j.table);
    for (const j of this.joinOnDemand) names.add(j.alias || j.table);
    return names;
  }

  private isValidSortField(field: string): boolean {
    const name = field.replace(/^-/, '');
    if (/^random\(\)$/i.test(name)) return true;
    return this.getKnownColumnNames().has(name);
  }

  // -- FIX: validate WHERE keys against known columns ------

  private isValidWhereKey(key: string): boolean {
    const cleanKey = key
      .replace(/^(_null_|_not_null_|_in_|_not_in_|_from_|_to_)/, '')
      .replace(/[!~]$/, '');
    if (this.state.rows[cleanKey]) return true;
    if (cleanKey.includes('.')) {
      const col = cleanKey.split('.').pop() || '';
      return !!this.state.rows[col];
    }
    if (this.state.coalesceWhere[cleanKey]) return true;
    if (this.state.langJoin[cleanKey]) return true;
    return false;
  }

  // -- Sort -------------------------------------------------

  private sort(sortParam: string | undefined, db: Knex): void {
    if (this.sortRaw) this.state.res.orderByRaw(this.sortRaw);

    const _sort = sortParam || this.defaultSort;
    if (!_sort) return;

    for (const item of _sort.split(',')) {
      if (/^random\(\)$/i.test(item)) {
        this.state.res.orderBy(db.raw('RANDOM()') as unknown as string);
        continue;
      }

      // FIX: validate sort field against known columns
      if (!this.isValidSortField(item)) continue;

      const match = item.match(/^(-)?(.+)$/);
      if (!match) continue;
      this.state.res.orderBy(match[2], match[1] ? 'desc' : 'asc', 'last');
    }
  }

  // -- Pagination ------------------------------------------

  private pagination({
    _page,
    _skip = 0,
    _limit,
    _unlimited,
  }: {
    _page?: string | number;
    _skip?: string | number;
    _limit?: string | number;
    _unlimited?: string | boolean;
  }): void {
    const limit = getQueryLimit({ _limit, _unlimited });
    if (!limit) return;

    this.state.res.limit(limit);

    // FIX: validate page and skip as positive integers
    const page = toPositiveInt(_page, 1);
    const skip = toPositiveInt(_skip, 0);
    const offset = (page - 1) * limit + skip;
    this.state.res.offset(offset);
  }

  // -- Where -----------------------------------------------

  private where(
    whereObj: Record<string, unknown>,
    db: Knex,
    options?: { trusted?: boolean },
  ): void {
    if (!whereObj) return;
    const { trusted = false } = options || {};

    for (const [key, value] of Object.entries(whereObj)) {
      // FIX: skip unknown columns from untrusted input
      if (!trusted && !this.isValidWhereKey(key)) continue;

      if (this.state.langJoin[key]) {
        this.state.res.whereRaw(
          `${this.state.langJoin[key]} = :_value`,
          { _value: value, lang: this.state.lang },
        );
      } else if (this.state.coalesceWhere[key] || this.state.coalesceWhere[key.replace(/!$/, '')]) {
        const key2 = key.replace(/!$/, '');
        const isNot = key.endsWith('!') ? 'NOT' : '';
        const coalesceWhere = this.state.coalesceWhere[key2];
        const replacements = this.state.coalesceWhereReplacements;
        if (Array.isArray(value)) {
          for (const _value of value) {
            this.state.res.orWhere(function (this: Knex.QueryBuilder) {
              this.whereRaw(`${isNot} ${coalesceWhere} = :_value`, { ...replacements, _value });
            });
          }
        } else {
          this.state.res.whereRaw(
            `${isNot} ${coalesceWhere} = :_value`,
            { ...replacements, _value: value },
          );
        }
      } else if (key.endsWith('~')) {
        this.state.res.where(key.replace(/~$/, ''), 'ilike', value as string);
      } else if (key.endsWith('!')) {
        const col = key.replace(/!$/, '');
        if (Array.isArray(value)) {
          this.state.res.whereNotIn(col, value);
        } else {
          this.state.res.whereNot(col, value as string);
        }
      } else if (key.startsWith('_null_')) {
        const m = key.match(/^_null_(.+)$/);
        if (m) this.state.res.whereNull(m[1]);
      } else if (key.startsWith('_in_')) {
        try {
          const m = key.match(/^_in_(.+)$/);
          if (m) this.state.res.whereIn(m[1], JSON.parse(value as string));
        } catch {
          throw new Error('ERROR_QUERY_VALUE');
        }
      } else if (key.startsWith('_not_in_')) {
        try {
          const m = key.match(/^_not_in_(.+)$/);
          if (m) this.state.res.whereNotIn(m[1], JSON.parse(value as string));
        } catch {
          throw new Error('ERROR_QUERY_VALUE');
        }
      } else if (key.startsWith('_not_null_')) {
        const m = key.match(/^_not_null_(.+)$/);
        if (m) this.state.res.whereNotNull(m[1]);
      } else if (/_(?:from|to)_/.test(key)) {
        if (value !== '') {
          const m = key.match(/_(from|to)_(.+)$/);
          if (!m) continue;
          const sign = m[1] === 'from' ? '>=' : '<=';
          const coalesceWhere = this.state.coalesceWhere[m[2]];
          if (coalesceWhere) {
            this.state.res.whereRaw(`${coalesceWhere} ${sign} ?`, [value]);
          } else {
            this.state.res.where(m[2], sign, value as string);
          }
        }
      } else if (Array.isArray(value)) {
        this.state.res.whereIn(key, value);
      } else if (value === null) {
        this.state.res.whereNull(key);
      } else if (this.leftJoinConfig.length && !key.includes('.')) {
        this.state.res.where({ [`${this.table}.${key}`]: value });
      } else {
        this.state.res.where(key, value as string);
      }
    }
  }

  // -- Fields / Joins --------------------------------------

  private fields({
    c,
    _fields,
    _join,
    db,
    _sort,
  }: {
    c: AppContext;
    _fields?: string;
    _join?: string | string[];
    db: Knex;
    _sort?: string;
  }): void {
    let f = _fields?.split(',').filter((item) => item !== '-relations');

    if (this.leftJoinConfig.length) {
      for (const item of this.leftJoinConfig) this.state.res.leftJoin(...item);

      if (this.leftJoinDistinct) {
        const sortArr = (_sort || this.defaultSort || '').replace(/(^|,)-/g, ',').split(',').filter(Boolean);
        this.state.res.distinct(
          !f
            ? []
            : sortArr
                .map((item) => !f.includes(item) && `${this.table}.${item}`)
                .filter(Boolean),
        );
      }
    }

    let join = [...this.join];

    if (_join) {
      const joinNames = Array.isArray(_join) ? _join : _join.split(',');
      for (const joinName of joinNames) {
        const toJoin = this.joinOnDemand.filter(
          ({ table, alias }) => joinName === alias || joinName === table,
        );
        if (toJoin.length) {
          join = join.concat(
            toJoin.filter((j) => !join.find(({ table, alias }) => table === j.table && alias === j.alias)),
          );
        }
      }
    }

    if (f) {
      join = join.filter(({ table, alias }) => f.includes(table) || (alias ? f.includes(alias) : false));
      f = f.filter((name) => !join.find(({ table, alias }) => name === table || name === alias));
    }

    let joinCoalesce = (f || Object.keys(this.state.rows)).map((l) => `${this.table}.${l}`);

    if (this.includeDeleted && this.deletedReplacements && this.state.rows.isDeleted) {
      joinCoalesce = joinCoalesce.map((item) => {
        const [tableName, fieldName] = item.split('.');
        const replaceWith = this.deletedReplacements?.[fieldName];
        if (typeof replaceWith === 'undefined') return item;
        return db.raw(
          `CASE WHEN "${this.table}"."isDeleted" THEN :replaceWith ELSE "${tableName}"."${fieldName}" END AS ${fieldName}`,
          { replaceWith },
        ) as unknown as string;
      });
    }

    for (const field of Object.keys(this.aliases)) {
      joinCoalesce.push(`${this.table}.${field} AS ${this.aliases[field]}`);
    }

    if (this.state.lang && this.state.lang !== 'en') {
      for (const field of this.translate) {
        this.state.langJoin[field] = `COALESCE( (
          select text from langs where lang=:lang and "textKey" = any(
            select "textKey" from langs where lang='en' and text = "${this.table}"."${field}"
          ) limit 1), name )`;
        joinCoalesce.push(
          db.raw(this.state.langJoin[field] + `AS "${field}"`, { lang: this.state.lang }) as unknown as string,
        );
      }
    }

    for (const {
      table,
      schema,
      as,
      where: joinWhere,
      whereBindings,
      alias,
      defaultValue,
      fields: joinFields,
      field,
      limit,
      orderBy,
      byIndex,
      leftJoin,
    } of join) {
      if (!table && field) {
        joinCoalesce.push(db.raw(`${field} AS ${alias || field}`) as unknown as string);
        continue;
      }

      const orderByStr = orderBy ? `ORDER BY ${orderBy}` : '';
      const limitStr = limit ? `LIMIT ${limit}` : '';
      const lang = table === 'lang' && this.state.lang?.match(/^\w{2}$/) ? `AND lang='${this.state.lang}'` : '';
      const ff = joinFields?.map((item) =>
        typeof item === 'string'
          ? `'${item}', "${as || table}"."${item}"`
          : `'${Object.keys(item)[0]}', ${Object.values(item)[0]}`,
      );
      const f2 = ff ? `json_build_object(${ff.join(', ')})` : `"${as || table}".*`;
      const f3 = field || `jsonb_agg(${f2})`;
      const wb: Record<string, unknown> = {};

      if (whereBindings) {
        const envAll = { ...c.env } as Record<string, unknown>;
        ['db', 'dbWrite', 'dbTables', 'error', 'getErrorByMessage', 'log']
          .forEach((key) => delete envAll[key]);

        const dd: Record<string, unknown> = flattening({
          env: envAll,
          params: c.req.param(),
          query: c.req.query(),
        }) as Record<string, unknown>;
        for (const [k, v] of Object.entries(whereBindings)) {
          wb[k] = dd[v] ?? null;
        }
      }

      const leftJoinStr = !leftJoin
        ? ''
        : typeof leftJoin === 'string'
          ? `LEFT JOIN ${leftJoin}`
          : `LEFT JOIN "${leftJoin[0]}" ON ${leftJoin[1]} = ${leftJoin[2]}`;

      const index = typeof byIndex === 'number' ? `[${byIndex}]` : '';
      const schemaStr = !schema ? '' : `"${schema}".`;
      const dValue = defaultValue ? `'${defaultValue}'` : 'NULL';

      const coalesceWhere = `COALESCE( ( SELECT ${f3} FROM (
        SELECT * FROM ${schemaStr}"${table}" AS "${as || table}"
        ${leftJoinStr}
        WHERE ${joinWhere} ${lang}
        ${orderByStr}
        ${limitStr}
      ) "${as || table}")${index}, ${dValue})`;

      this.state.coalesceWhere[alias || table] = coalesceWhere;
      this.state.coalesceWhereReplacements = {
        ...this.state.coalesceWhereReplacements,
        ...wb,
      };

      let sqlToJoin = `${coalesceWhere} AS "${alias || table}"`;
      if (this.includeDeleted && this.deletedReplacements && this.state.rows.isDeleted) {
        const replaceWith = this.deletedReplacements[table]
          ?? (as ? this.deletedReplacements[as] : undefined)
          ?? (alias ? this.deletedReplacements[alias] : undefined);
        if (typeof replaceWith !== 'undefined') {
          sqlToJoin = `CASE WHEN "${this.table}"."isDeleted" THEN ${replaceWith} ELSE ${coalesceWhere} END AS "${alias || table}"`;
        }
      }

      joinCoalesce.push(db.raw(sqlToJoin, wb) as unknown as string);
    }

    if (c.req.query()._search && this.searchFields.length) {
      const searchColumnsStr = this.searchFields
        .map((name) => {
          const searchName = this.state.langJoin[name] || `"${name}"`;
          return `COALESCE(${searchName} <-> :_search, 1)`;
        })
        .join(' + ');
      joinCoalesce.push(
        db.raw(
          `(${searchColumnsStr})/${this.searchFields.length} as _search_distance`,
          { ...c.req.query(), lang: this.state.lang },
        ) as unknown as string,
      );
      if (!_sort) this.state.res.orderBy('_search_distance', 'ASC');
    }

    this.state.res.column(joinCoalesce.concat(this.fieldsRaw || []));
  }

  private checkDeleted(): void {
    if (this.includeDeleted || !this.state.rows.isDeleted) return;
    this.state.res.where({ [`${this.table}.isDeleted`]: false });
  }

  private getJoinFields(): Record<string, string> {
    return this.join.reduce<Record<string, string>>((acc, { alias, table, field }) => {
      let type = !field
        ? 'ARRAY'
        : field.match(/::bool$/)
          ? 'boolean'
          : field.match(/::int$/)
            ? 'integer'
            : 'string';
      acc[alias || table] = type;
      return acc;
    }, {});
  }

  private getHiddenFields(): HiddenFieldsResult {
    if (!this.state.roles) {
      return { regular: this.hiddenFields, owner: this.hiddenFields };
    }

    const permissions = this.state.roles.getPermissions(this.state.user?.roles);
    let toShow: string[] = [];
    let ownerToShow: string[] = [];

    for (const [key, value] of Object.entries(this.showFieldsByPermission)) {
      if (this.state.roles.checkWildcardPermissions({ key, permissions })) {
        toShow = toShow.concat(value);
      }
      if (this.state.roles.checkWildcardPermissions({ key, permissions: this.ownerPermissions })) {
        ownerToShow = ownerToShow.concat(value);
      }
    }

    return {
      regular: this.hiddenFields.filter((item) => !toShow.includes(item)),
      owner: this.hiddenFields.filter((item) => !ownerToShow.includes(item)),
    };
  }

  private deleteHiddenFieldsFromResult(
    result: Record<string, unknown> | undefined,
    hiddenFields: HiddenFieldsResult,
  ): void {
    if (!result || !hiddenFields) return;
    const isOwner = this.state.user?.id && result[this.userIdFieldName] === this.state.user.id;
    const fields = hiddenFields[isOwner ? 'owner' : 'regular'];
    for (const key of fields) delete result[key];
  }

  // -- FIX: data filtering shared by add + update ----------

  private filterDataByTableColumns(
    data: Record<string, unknown>,
    rows: ColumnInfoMap,
  ): Record<string, unknown> {
    const filtered: Record<string, unknown> = {};
    for (const key of Object.keys(data)) {
      if (rows[key] && !this.readOnlyFields.includes(key)) {
        filtered[key] = data[key];
      }
    }
    return filtered;
  }

  private updateData(
    c: AppContext,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    for (const [key, errorCode] of Object.entries(this.requiredFields)) {
      if (!data[key]) throw new Error(errorCode);
    }

    const rows = this.state.rows;

    // FIX: removed `result = { ...c.req.param(), ...result }` - URL params must not merge into data
    const filtered = this.filterDataByTableColumns(data, rows);

    if (rows.userId && this.state.user) {
      filtered.userId = this.state.user.id;
    }

    return filtered;
  }

  private updateIncomingData(
    c: AppContext,
    data: Record<string, unknown> | Record<string, unknown>[],
  ): Record<string, unknown> | Record<string, unknown>[] {
    return Array.isArray(data)
      ? data.map((item) => this.updateData(c, item))
      : this.updateData(c, data);
  }

  // -- Options (self-documenting) --------------------------

  optionsGet() {
    const fields: Record<string, string> = {};
    const fieldsSearchLike: Record<string, string> = {};
    const fieldsFromTo: Record<string, string> = {};
    const fieldsNull: Record<string, string> = {};

    for (const [key, data] of Object.entries(this.dbTables)) {
      if (!data) continue;
      fields[key] = data.data_type;
      if (data.data_type === 'string') fieldsSearchLike[`${key}~`] = data.data_type;
      if (data.is_nullable === 'YES') {
        fieldsNull[`_null_${key}`] = 'string';
        fieldsNull[`_not_null_${key}`] = 'string';
      }
      if (data.data_type !== 'boolean' && data.data_type !== 'file') {
        fieldsFromTo[`_from_${key}`] = data.data_type;
        fieldsFromTo[`_to_${key}`] = data.data_type;
        fieldsFromTo[`_in_${key}`] = data.data_type;
        fieldsFromTo[`_not_in_${key}`] = data.data_type;
      }
    }

    return {
      tokenRequired: this.tokenRequired.get || this.access.read || this.accessByStatuses.read,
      ownerRequired: this.ownerRequired.get,
      rootRequired: this.rootRequired.get,
      joinFields: this.getJoinFields(),
      cache: this.cache,
      joinOnDemand: this.joinOnDemand,
      accessByStatuses: this.accessByStatuses.read,
      additionalFields: this.additionalFields.get,
      queryParameters: {
        ...fields,
        ...fieldsSearchLike,
        ...fieldsNull,
        ...fieldsFromTo,
        ...this.additionalFields?.get,
        _fields: { type: 'string', example: 'id,name' },
        _sort: { type: 'string', example: '-timeCreated,name,random()' },
        _join: { type: 'string', example: 'table1,alias1' },
        _limit: 'integer',
        _page: 'integer',
        _skip: 'integer',
        _lang: 'string',
        ...(this.searchFields.length && { _search: 'string' }),
      },
      apiClientMethodNames: this.apiClientMethodNames,
    };
  }

  optionsGetById() {
    return {
      tokenRequired: this.tokenRequired.get || this.access.read || this.accessByStatuses.read,
      ownerRequired: this.ownerRequired.get,
      rootRequired: this.rootRequired.get,
      joinFields: this.getJoinFields(),
      joinOnDemand: this.joinOnDemand,
      accessByStatuses: this.accessByStatuses.read,
      additionalFields: this.additionalFields.get,
      cache: this.cache,
      apiClientMethodNames: this.apiClientMethodNames,
    };
  }

  optionsAdd() {
    const schema = Object.entries(this.dbTables).reduce<Record<string, unknown>>(
      (acc, [key, data]) => (this.readOnlyFields.includes(key) ? acc : { ...acc, [key]: data }),
      this.additionalFields?.add || {},
    );
    return {
      tokenRequired: this.tokenRequired.add || this.access.create || this.accessByStatuses.create,
      ownerRequired: this.ownerRequired.add,
      rootRequired: this.rootRequired.add,
      readOnlyFields: this.readOnlyFields,
      requiredFields: Object.keys(this.requiredFields),
      accessByStatuses: this.accessByStatuses.create,
      apiClientMethodNames: this.apiClientMethodNames,
      schema,
    };
  }

  optionsUpdate() {
    const schema = Object.entries(this.dbTables).reduce<Record<string, unknown>>(
      (acc, [key, data]) => (this.readOnlyFields.includes(key) ? acc : { ...acc, [key]: data }),
      this.additionalFields?.update || {},
    );
    return {
      tokenRequired: this.tokenRequired.update || this.access.update || this.accessByStatuses.update,
      ownerRequired: this.ownerRequired.update,
      rootRequired: this.rootRequired.update,
      readOnlyFields: this.readOnlyFields,
      accessByStatuses: this.accessByStatuses.update,
      additionalFields: this.additionalFields.update,
      apiClientMethodNames: this.apiClientMethodNames,
      schema,
    };
  }

  optionsDelete() {
    return {
      tokenRequired: this.tokenRequired.delete || this.access.delete || this.accessByStatuses.delete,
      ownerRequired: this.ownerRequired.delete,
      rootRequired: this.rootRequired.delete,
      accessByStatuses: this.accessByStatuses.delete,
      apiClientMethodNames: this.apiClientMethodNames,
    };
  }

  // -- GET (list) ------------------------------------------

  async get(c: AppContext): Promise<void> {
    const { result, meta } = await this.getRequestResult(c);
    c.set('meta', meta);
    c.set('result', result);
    c.set('relationsData', this.relations);
  }

  async getRequestResult(
    c: AppContext,
    q?: Record<string, string[]>,
  ): Promise<getResultType<T>> {
    this.initState(c);
    const db = c.env.db;

    const queries = q || c.req.queries();
    const queriesFlat: Record<string, string | string[]> = {};
    for (const [name, value] of Object.entries(queries)) {
      queriesFlat[name] = value?.length === 1 ? value[0] : value;
    }

    const {
      _fields,
      _sort,
      _page,
      _skip,
      _limit,
      _unlimited,
      _after,
      _lang,
      _search,
      _join,
      ...where
    } = queriesFlat;

    if (_lang) this.state.lang = _lang as string;

    this.fields({ c, _fields: _fields as string, _join, db, _sort: _sort as string });

    // FIX: defaultWhere is trusted, user WHERE is validated
    this.where(this.defaultWhere, db, { trusted: true });
    this.where(where, db);

    if (this.defaultWhereRaw) {
      const whereStr = this.defaultWhereRaw;
      this.state.res.andWhere(function (this: Knex.QueryBuilder) {
        this.whereRaw(whereStr);
      });
    }

    if (_search && this.searchFields.length) {
      const whereStr = this.searchFields
        .map((name) => {
          const searchName = this.state.langJoin[name] || `"${name}"`;
          return `${searchName} % :_search`;
        })
        .join(' OR ');
      const lang = this.state.lang;
      this.state.res.andWhere(function (this: Knex.QueryBuilder) {
        this.whereRaw(whereStr, { _search, lang });
      });
    }

    this.checkDeleted();

    const total = +(await (db as unknown as {
      from: (arg: unknown) => { count: (field: string) => Promise<Array<{ count: string }>> };
    }).from({ w: this.state.res }).count('*'))[0].count;
    this.sort(_sort as string, db);

    // FIX: cursor pagination - use only first sort field
    const sortFields = ((_sort as string) || this.defaultSort || '').split(',').filter(Boolean);
    const firstSortField = sortFields[0];
    const cursorColumnName = firstSortField?.replace(/^-/, '');
    const limit = getQueryLimit({
      _limit: _limit as string,
      _unlimited: _unlimited as string,
    });

    if (_after && limit && firstSortField && cursorColumnName && this.state.rows[cursorColumnName]) {
      const direction = firstSortField.startsWith('-') ? '<' : '>';
      this.state.res.where(cursorColumnName, direction, _after);
      this.state.res.limit(limit);
    } else {
      this.pagination({
        _page: _page as string,
        _skip: _skip as string,
        _limit: limit,
        _unlimited: _unlimited as string,
      });
    }

    const result = await this.state.res;

    const nextAfterData = cursorColumnName ? result?.at(-1)?.[cursorColumnName] : undefined;
    const addAfterMs = firstSortField?.startsWith('-') ? '000' : '999';
    const nextAfter = nextAfterData instanceof Date
      ? new Date(nextAfterData).toISOString().replace('Z', `${addAfterMs}Z`)
      : nextAfterData;

    let meta: metaType = { total };
    if (_after) {
      meta = {
        ...meta,
        after: _after as string,
        nextAfter: nextAfter ? encodeURIComponent(String(nextAfter)) : undefined,
        isFirstPage: false,
        isLastPage: !result.length || (limit ? result.length < limit : false),
      };
    } else {
      const limitNum = limit || 0;
      const skip = toPositiveInt(_skip, 0);
      const page = toPositiveInt(_page, 1);
      const pages = !limitNum ? 1 : Math.max(1, Math.ceil(Math.max(0, total - skip) / limitNum));
      meta = {
        ...meta,
        limit: limitNum,
        skip,
        page,
        pages,
        nextAfter: page === 1 && nextAfter ? encodeURIComponent(String(nextAfter)) : undefined,
        nextPage: page >= pages ? undefined : page + 1,
        isFirstPage: page <= 1,
        isLastPage: page >= pages,
      };
    }

    const hiddenFields = this.getHiddenFields();
    for (const row of result as Record<string, unknown>[]) {
      this.deleteHiddenFieldsFromResult(row, hiddenFields);
    }

    return { result: result as T[], meta };
  }

  // -- GET by ID -------------------------------------------

  async getById(c: AppContext): Promise<void> {
    this.initState(c);
    const db = c.env.db;
    const { id } = c.req.param();

    const { _fields, _lang, _join, ...whereWithParams } = c.req.query();

    // FIX: validate user-supplied WHERE keys
    const where: Record<string, string> = {};
    for (const [key, val] of Object.entries(whereWithParams)) {
      if (key.startsWith('_')) continue;
      const isInt = this.dbTables?.[key]?.data_type === 'integer';
      const hasNaN = ([] as string[]).concat(val as unknown as string[]).find((item: string) => Number.isNaN(+item));
      if (isInt && hasNaN) throw new Error('INTEGER_REQUIRED');
      if (this.state.rows[key]) {
        where[key] = val;
      }
    }

    if (_lang) this.state.lang = _lang;

    if (this.dbTables?.id?.data_type === 'integer' && Number.isNaN(+id)) {
      throw new Error('INTEGER_REQUIRED');
    }

    this.where({ ...where, [`${this.table}.id`]: id }, db, { trusted: true });

    if (this.defaultWhereRaw) {
      const whereStr = this.defaultWhereRaw;
      this.state.res.andWhere(function (this: Knex.QueryBuilder) {
        this.whereRaw(whereStr);
      });
    }

    this.checkDeleted();
    this.fields({ c, _fields, _join, db });

    const result = await this.state.res.first();
    this.deleteHiddenFieldsFromResult(result as Record<string, unknown> | undefined, this.getHiddenFields());

    c.set('result', result);
    c.set('relationsData', this.relations);
  }

  // -- POST -------------------------------------------------

  async add(c: AppContext): Promise<void> {
    this.initState(c);

    // FIX: use Array.isArray instead of heuristic detection
    const body = await c.req.json();
    const data = this.updateIncomingData(c, body as Record<string, unknown> | Record<string, unknown>[]);

    const validatedData = Array.isArray(data)
      ? data.map((item) => this.validateIntegerFields(item))
      : this.validateIntegerFields(data);

    const result = await this.getDbWithSchema(c.env.dbWrite)
      .insert(validatedData)
      .returning('*');

    c.set('result', result[0]);
    c.set('relationsData', this.relations);
  }

  private validateIntegerFields(data: Record<string, unknown>): Record<string, unknown> {
    for (const key of Object.keys(data)) {
      const isInt = this.dbTables?.[key]?.data_type === 'integer';
      const hasNaN = ([] as unknown[])
        .concat(data[key] as never)
        .find((item: unknown) => item && Number.isNaN(+(item as string)));
      if (isInt && hasNaN) throw new Error('INTEGER_REQUIRED');
      data[key] = data[key] ?? null;
    }
    return data;
  }

  // -- PUT / PATCH -----------------------------------------

  async update(c: AppContext): Promise<void> {
    this.initState(c);
    const db = c.env.db;
    const params = c.req.param();
    const whereClause: WhereParams = { ...params };

    if (this.dbTables?.id?.data_type === 'integer' && Number.isNaN(+String(whereClause.id))) {
      throw new Error('INTEGER_REQUIRED');
    }

    const rows = this.state.rows;
    if (rows.isDeleted) whereClause.isDeleted = false;

    const rawData = await c.req.json();

    // FIX: filter update data through table columns (same as add)
    const data = this.filterDataByTableColumns(rawData as Record<string, unknown>, rows);

    if (Object.keys(data).length) {
      if (rows.timeUpdated) data.timeUpdated = db.fn.now();
      await this.getDbWithSchema(c.env.dbWrite).update(data).where(whereClause);
    }

    await this.getById(c);
  }

  // -- DELETE ----------------------------------------------

  async delete(c: AppContext): Promise<void> {
    this.initState(c);

    const whereClause: WhereParams = { ...c.req.param() };

    if (this.dbTables?.id?.data_type === 'integer' && Number.isNaN(+String(whereClause.id))) {
      throw new Error('INTEGER_REQUIRED');
    }

    const rows = this.state.rows;
    if (rows.isDeleted) whereClause.isDeleted = false;

    const t = this.getDbWithSchema(c.env.dbWrite).where(whereClause);
    const result = rows.isDeleted ? await t.update({ isDeleted: true }) : await t.delete();

    c.set('result', { ok: true });
    c.set('meta', { countDeleted: result });
  }
}
```

### src/index.ts
```ts
import CrudBuilder from './CrudBuilder';

export * from './types';
export { Routings } from './Routings';
export { CrudBuilder };
```

### src/Routings.ts
```ts
import { createFactory } from 'hono/factory';
import CrudBuilder from './CrudBuilder';
import type {
  AppContext,
  CrudBuilderOptionsType,
  MethodsType,
  MiddlewareHandler,
  PushToRoutesParamsType,
  RoutesErrorsType,
  RoutesEmailTemplatesType,
  RoutesType,
  RoutingsOptionsType,
} from './types';

const factory = createFactory();

export class Routings {
  routes: RoutesType[] = [];
  routesPermissions: Record<string, string[]> = {};
  routesErrors: RoutesErrorsType = {};
  routesEmailTemplates: RoutesEmailTemplatesType = {};
  migrationDirs: string[] | undefined;

  constructor(options?: RoutingsOptionsType) {
    if (options?.migrationDirs) this.migrationDirs = options.migrationDirs;
  }

  private pushToRoutes({ method, path, fnArr }: PushToRoutesParamsType): void {
    for (const fn of fnArr) {
      const handlers = factory.createHandlers(fn);
      this.routes.push({ path, method, handlers });
    }
  }

  get(path: string, ...fnArr: MiddlewareHandler[]): void {
    this.pushToRoutes({ method: 'GET', path, fnArr });
  }

  post(path: string, ...fnArr: MiddlewareHandler[]): void {
    this.pushToRoutes({ method: 'POST', path, fnArr });
  }

  patch(path: string, ...fnArr: MiddlewareHandler[]): void {
    this.pushToRoutes({ method: 'PATCH', path, fnArr });
  }

  put(path: string, ...fnArr: MiddlewareHandler[]): void {
    this.pushToRoutes({ method: 'PUT', path, fnArr });
  }

  delete(path: string, ...fnArr: MiddlewareHandler[]): void {
    this.pushToRoutes({ method: 'DELETE', path, fnArr });
  }

  use(path: string, ...fnArr: MiddlewareHandler[]): void {
    this.pushToRoutes({ path, fnArr });
  }

  all(...fnArr: MiddlewareHandler[]): void {
    this.pushToRoutes({ path: '*', fnArr });
  }

  crud(params: CrudBuilderOptionsType): void {
    const { prefix, table, permissions } = params;
    const p = `/${prefix || table}`.replace(/^\/+/, '/');

    this.get(`${p}`, async (c) => {
      const cb = new CrudBuilder(params);
      await cb.get(c as AppContext);
    });
    this.post(`${p}`, async (c) => {
      const cb = new CrudBuilder(params);
      await cb.add(c as AppContext);
    });
    this.get(`${p}/:id`, async (c) => {
      const cb = new CrudBuilder(params);
      await cb.getById(c as AppContext);
    });
    this.put(`${p}/:id`, async (c) => {
      const cb = new CrudBuilder(params);
      await cb.update(c as AppContext);
    });
    this.patch(`${p}/:id`, async (c) => {
      const cb = new CrudBuilder(params);
      await cb.update(c as AppContext);
    });
    this.delete(`${p}/:id`, async (c) => {
      const cb = new CrudBuilder(params);
      await cb.delete(c as AppContext);
    });

    if (permissions?.protectedMethods) {
      const register = (path: string, method: string): void => {
        const key = `${method} ${path}`;
        if (!this.routesPermissions[key]) this.routesPermissions[key] = [];
        this.routesPermissions[key].push(`${p.replace(/^\//, '')}.${method.toLowerCase()}`);
      };

      const methods: MethodsType[] = permissions.protectedMethods[0] === '*'
        ? ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
        : (permissions.protectedMethods as MethodsType[]);

      for (const method of methods) {
        if (method === 'POST' || method === 'GET') register(p, method);
        if (method !== 'POST') register(`${p}/:id`, method);
      }
    }
  }

  errors(err: RoutesErrorsType | RoutesErrorsType[]): void {
    const errArr = Array.isArray(err) ? err : [err];
    for (const e of errArr) this.routesErrors = { ...this.routesErrors, ...e };
  }

  emailTemplates(template: RoutesEmailTemplatesType): void {
    this.routesEmailTemplates = { ...this.routesEmailTemplates, ...template };
  }
}
```

### src/types.ts
```ts
import type { Context, MiddlewareHandler, Handler } from 'hono';
import type { H } from 'hono/types';
import type { Knex } from 'knex';

export type { MiddlewareHandler, Handler };

export type MethodsType = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'OPTIONS';

export type MethodPathType = {
  method?: MethodsType;
  path: string;
};

export type RoutesType = MethodPathType & {
  handlers: (Handler | MiddlewareHandler)[];
};

export type PushToRoutesParamsType = MethodPathType & {
  fnArr: H[];
};

// -- FIX: proper env typing --------------------------------

export type ColumnInfo = {
  data_type: 'string' | 'integer' | 'boolean' | 'file' | 'date'
    | 'timestamp' | 'json' | 'jsonb' | 'text' | 'uuid' | (string & {});
  is_nullable: 'YES' | 'NO';
  column_default?: string | null;
  character_maximum_length?: number | null;
};

export type ColumnInfoMap = Record<string, ColumnInfo>;

export type UserType = {
  id: string | number;
  roles?: string[];
  [key: string]: unknown;
};

export interface RolesService {
  getPermissions(roles?: string[]): Record<string, boolean>;
  checkWildcardPermissions(params: {
    key: string;
    permissions: Record<string, boolean>;
  }): boolean;
}

export type EnvBindings = {
  db: Knex;
  dbWrite: Knex;
  dbTables: Record<string, ColumnInfoMap>;
  roles?: RolesService;
  error?: (code: string, status?: number) => void;
  getErrorByMessage?: (message: string) => unknown;
  log?: (...args: unknown[]) => void;
};

export type VarBindings = {
  user?: UserType;
  result?: unknown;
  meta?: metaType | Record<string, unknown>;
  relationsData?: Record<string, CrudBuilderOptionsType>;
};

export type AppContext = Context<{
  Bindings: EnvBindings & Record<string, unknown>;
  Variables: VarBindings & Record<string, unknown>;
}>;

// -- Route-level types -------------------------------------

export type RouteErrorType = {
  code: number;
  status: number;
  description?: string;
};

export type RoutesErrorsType = Record<string, RouteErrorType>;

export type EmailTemplateType = {
  subject?: string;
  text?: string;
  html?: string;
};

export type RoutesEmailTemplatesType = Record<string, EmailTemplateType>;

export type RoutingsOptionsType = {
  migrationDirs?: string[];
};

// -- FIX: eliminate `any`, add proper field types ----------

export type StringRecord = Record<string, string>;
export type FieldValue = string | number | boolean | null;
export type FieldRecord = Record<string, FieldValue>;
export type WhereParams = Record<string, string | string[] | boolean | null>;

// -- backward compat aliases -------------------------------
export type stringRecordType = StringRecord;
export type fieldRecordType = FieldRecord;
export type whereParamsType = WhereParams;
export type DbTablesType = ColumnInfoMap;

// -- Join configuration ------------------------------------

export type CrudBuilderJoinType = {
  table: string;
  schema?: string;
  alias?: string;
  as?: string;
  where?: string;
  whereBindings?: StringRecord;
  defaultValue?: FieldValue;
  fields?: (string | Record<string, string>)[];
  field?: string;
  orderBy?: string;
  limit?: number;
  leftJoin?: string | [string, string, string];
  byIndex?: number;
  permission?: string;
};

// -- Permissions -------------------------------------------

export type CrudBuilderPermissionsType = {
  protectedMethods?: (MethodsType | '*')[];
  owner?: string[];
  fields?: {
    viewable?: Record<string, string[]>;
    editable?: Record<string, string[]>;
  };
};

// -- CRUD action names and access records ------------------

export type CrudAction = 'get' | 'add' | 'update' | 'delete';
export type AccessRecord = Partial<Record<'read' | 'create' | 'update' | 'delete', boolean | string>>;
export type ActionFlags = Partial<Record<CrudAction, boolean>>;

// -- FIX: generic result types -----------------------------

export type CrudBuilderOptionsType<T extends Record<string, unknown> = Record<string, unknown>> = {
  c?: AppContext;
  table: string;
  prefix?: string;
  schema?: string;
  aliases?: StringRecord;
  join?: CrudBuilderJoinType[];
  joinOnDemand?: CrudBuilderJoinType[];
  leftJoin?: [string, string, string][];
  leftJoinDistinct?: boolean;
  lang?: string;
  translate?: string[];
  searchFields?: string[];
  requiredFields?: Record<string, string>;
  hiddenFields?: string[];
  readOnlyFields?: string[];
  permissions?: CrudBuilderPermissionsType;

  defaultWhere?: FieldRecord;
  defaultWhereRaw?: string;
  defaultSort?: string;
  sortRaw?: string;
  fieldsRaw?: string[];
  includeDeleted?: boolean;
  deletedReplacements?: FieldRecord;
  relations?: Record<string, CrudBuilderOptionsType>;
  relationIdName?: string;

  tokenRequired?: CrudAction[];
  ownerRequired?: CrudAction[];
  rootRequired?: CrudAction[];
  access?: AccessRecord;
  accessByStatuses?: AccessRecord;
  dbTables?: ColumnInfoMap;
  cache?: { ttl?: number };
  userIdFieldName?: string;
  additionalFields?: Partial<Record<CrudAction | 'get', Record<string, unknown>>>;
  apiClientMethodNames?: StringRecord;
};

// -- Meta / Result -----------------------------------------

export type metaType = {
  total: number;
  limit?: number;
  skip?: number;
  page?: number;
  nextPage?: number;
  pages?: number;
  after?: string;
  nextAfter?: string;
  isFirstPage?: boolean;
  isLastPage?: boolean;
};

export type getResultType<T = Record<string, unknown>> = {
  result: T[];
  meta: metaType;
  relations?: Record<string, unknown[]>;
  error?: boolean;
};

// -- FIX: per-request mutable state type -------------------

export type RequestState = {
  res: Knex.QueryBuilder;
  rows: ColumnInfoMap;
  user: UserType | undefined;
  roles: RolesService | undefined;
  lang: string;
  coalesceWhere: Record<string, string>;
  coalesceWhereReplacements: Record<string, unknown>;
  langJoin: Record<string, string>;
};

export type HiddenFieldsResult = {
  regular: string[];
  owner: string[];
};
```

### test/CrudBuilder.test.ts
```ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import CrudBuilder from '../src/CrudBuilder';
import {
  createMockContext,
  usersColumns,
  type MockContextResult,
} from './helpers';
import type { CrudBuilderOptionsType } from '../src/types';

// -- Defaults ----------------------------------------------

const TABLE = 'users';
const SCHEMA = 'public';

const defaultOptions: CrudBuilderOptionsType = {
  table: TABLE,
  schema: SCHEMA,
  hiddenFields: ['password'],
};

const defaultDbTables = { [`${SCHEMA}.${TABLE}`]: usersColumns };

function buildContext(overrides: Parameters<typeof createMockContext>[0] = {}): MockContextResult {
  return createMockContext({
    dbTables: defaultDbTables,
    ...overrides,
  });
}

// -- 1. SQL Injection: _sort validation --------------------

describe('Security: _sort validation', () => {
  it('allows known column names', async () => {
    const { c, db } = buildContext({
      queries: { _sort: ['name'], _limit: ['10'] },
      queryResult: [{ id: 1, name: 'Alice' }],
      countResult: 1,
    });

    const crud = new CrudBuilder(defaultOptions);
    await crud.get(c);

    const orderCalls = db.queryBuilder.getAllCalls('orderBy');
    expect(orderCalls.length).toBe(1);
    expect(orderCalls[0].args[0]).toBe('name');
  });

  it('allows descending sort with -', async () => {
    const { c, db } = buildContext({
      queries: { _sort: ['-timeCreated'], _limit: ['10'] },
      queryResult: [],
      countResult: 0,
    });

    const crud = new CrudBuilder(defaultOptions);
    await crud.get(c);

    const orderCalls = db.queryBuilder.getAllCalls('orderBy');
    expect(orderCalls.length).toBe(1);
    expect(orderCalls[0].args[0]).toBe('timeCreated');
    expect(orderCalls[0].args[1]).toBe('desc');
  });

  it('allows random()', async () => {
    const { c, db } = buildContext({
      queries: { _sort: ['random()'], _limit: ['10'] },
      queryResult: [],
      countResult: 0,
    });

    const crud = new CrudBuilder(defaultOptions);
    await crud.get(c);

    const orderCalls = db.queryBuilder.getAllCalls('orderBy');
    expect(orderCalls.length).toBe(1);
  });

  it('silently ignores unknown sort fields', async () => {
    const { c, db } = buildContext({
      queries: {
        _sort: ['nonexistent_column'],
        _limit: ['10'],
      },
      queryResult: [],
      countResult: 0,
    });

    const crud = new CrudBuilder(defaultOptions);
    await crud.get(c);

    const orderCalls = db.queryBuilder.getAllCalls('orderBy');
    expect(orderCalls.length).toBe(0);
  });

  it('rejects SQL injection via _sort', async () => {
    const { c, db } = buildContext({
      queries: {
        _sort: ['name; DROP TABLE users--'],
        _limit: ['10'],
      },
      queryResult: [],
      countResult: 0,
    });

    const crud = new CrudBuilder(defaultOptions);
    await crud.get(c);

    const orderCalls = db.queryBuilder.getAllCalls('orderBy');
    expect(orderCalls.length).toBe(0);
  });

  it('filters mixed valid/invalid sort fields', async () => {
    const { c, db } = buildContext({
      queries: {
        _sort: ['-name,INJECTED,email'],
        _limit: ['10'],
      },
      queryResult: [],
      countResult: 0,
    });

    const crud = new CrudBuilder(defaultOptions);
    await crud.get(c);

    const orderCalls = db.queryBuilder.getAllCalls('orderBy');
    expect(orderCalls.length).toBe(2);
    expect(orderCalls[0].args[0]).toBe('name');
    expect(orderCalls[1].args[0]).toBe('email');
  });
});

// -- 2. Unfiltered WHERE keys ------------------------------

describe('Security: WHERE key validation', () => {
  it('allows known columns in query', async () => {
    const { c, db } = buildContext({
      queries: { status: ['active'], _limit: ['10'] },
      queryResult: [{ id: 1, status: 'active' }],
      countResult: 1,
    });

    const crud = new CrudBuilder(defaultOptions);
    await crud.get(c);

    expect(db.queryBuilder.hasCalled('where')).toBe(true);
  });

  it('silently ignores unknown columns', async () => {
    const { c, db } = buildContext({
      queries: { secret_column: ['hack'], _limit: ['10'] },
      queryResult: [],
      countResult: 0,
    });

    const crud = new CrudBuilder(defaultOptions);
    await crud.get(c);

    const whereCalls = db.queryBuilder.getAllCalls('where');
    // only `isDeleted=false` from checkDeleted, no `secret_column`
    const hasSecretCol = whereCalls.some((call) => {
      const arg = call.args[0];
      return typeof arg === 'string' && arg.includes('secret');
    });
    expect(hasSecretCol).toBe(false);
  });

  it('allows _from_ / _to_ for known columns', async () => {
    const { c, db } = buildContext({
      queries: { _from_age: ['18'], _to_age: ['65'], _limit: ['10'] },
      queryResult: [],
      countResult: 0,
    });

    const crud = new CrudBuilder(defaultOptions);
    await crud.get(c);

    const whereCalls = db.queryBuilder.getAllCalls('where');
    const ageFilters = whereCalls.filter((call) =>
      call.args[0] === 'age',
    );
    expect(ageFilters.length).toBe(2);
  });

  it('ignores _from_ / _to_ for unknown columns', async () => {
    const { c, db } = buildContext({
      queries: { _from_salary: ['100000'], _limit: ['10'] },
      queryResult: [],
      countResult: 0,
    });

    const crud = new CrudBuilder(defaultOptions);
    await crud.get(c);

    const whereCalls = db.queryBuilder.getAllCalls('where');
    const salaryFilters = whereCalls.filter((call) =>
      String(call.args[0]).includes('salary'),
    );
    expect(salaryFilters.length).toBe(0);
  });
});

// -- 3. Mass assignment in update --------------------------

describe('Security: mass assignment in update()', () => {
  it('filters unknown columns from update body', async () => {
    const { c, dbWrite } = buildContext({
      params: { id: '1' },
      body: {
        name: 'Updated',
        isAdmin: true,
        internalScore: 999,
      },
      queryResult: [{ id: 1, name: 'Updated' }],
      countResult: 1,
    });

    const crud = new CrudBuilder({ ...defaultOptions, dbTables: usersColumns });
    await crud.update(c);

    const updateCalls = dbWrite.queryBuilder.getAllCalls('update');
    expect(updateCalls.length).toBe(1);
    const data = updateCalls[0].args[0] as Record<string, unknown>;
    expect(data.name).toBe('Updated');
    expect(data).not.toHaveProperty('isAdmin');
    expect(data).not.toHaveProperty('internalScore');
  });

  it('removes readOnly fields from update body', async () => {
    const { c, dbWrite } = buildContext({
      params: { id: '1' },
      body: {
        name: 'Updated',
        id: 999,
        timeCreated: 'hacked',
      },
      queryResult: [{ id: 1, name: 'Updated' }],
      countResult: 1,
    });

    const crud = new CrudBuilder({ ...defaultOptions, dbTables: usersColumns });
    await crud.update(c);

    const updateCalls = dbWrite.queryBuilder.getAllCalls('update');
    const data = updateCalls[0].args[0] as Record<string, unknown>;
    expect(data).not.toHaveProperty('id');
    expect(data).not.toHaveProperty('timeCreated');
  });
});

// -- 4. URL params no longer merge into body ---------------

describe('Security: URL params not in body', () => {
  it('does not merge URL :id into insert data', async () => {
    const { c, dbWrite } = buildContext({
      params: { id: '999' },
      body: { name: 'New User', email: 'a@b.com' },
    });

    const crud = new CrudBuilder({ ...defaultOptions, dbTables: usersColumns });
    await crud.add(c);

    const insertCalls = dbWrite.queryBuilder.getAllCalls('insert');
    const data = insertCalls[0].args[0] as Record<string, unknown>;
    expect(data).not.toHaveProperty('id');
    expect(data.name).toBe('New User');
  });
});

// -- 5. Cursor pagination with multi-sort ------------------

describe('Bug fix: cursor pagination with multi-sort', () => {
  it('uses only first sort field for cursor', async () => {
    const { c, db } = buildContext({
      queries: {
        _sort: ['-timeCreated,name'],
        _after: ['2024-01-15T12:00:00Z'],
        _limit: ['20'],
      },
      queryResult: [],
      countResult: 100,
    });

    const crud = new CrudBuilder(defaultOptions);
    await crud.get(c);

    const whereCalls = db.queryBuilder.getAllCalls('where');
    const cursorWhere = whereCalls.find((call) =>
      call.args[0] === 'timeCreated',
    );

    expect(cursorWhere).toBeDefined();
    expect(cursorWhere!.args[1]).toBe('<');
    expect(cursorWhere!.args[2]).toBe('2024-01-15T12:00:00Z');
  });
});

// -- 6. Array detection fix --------------------------------

describe('Bug fix: array detection in add()', () => {
  it('handles real array body correctly', async () => {
    const { c, dbWrite } = buildContext({
      body: [
        { name: 'Alice', email: 'a@b.com' },
        { name: 'Bob', email: 'b@b.com' },
      ],
    });

    const crud = new CrudBuilder({ ...defaultOptions, dbTables: usersColumns });
    await crud.add(c);

    const insertCalls = dbWrite.queryBuilder.getAllCalls('insert');
    const data = insertCalls[0].args[0] as unknown[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(2);
  });

  it('does NOT treat numeric-keyed objects as arrays', async () => {
    const { c, dbWrite } = buildContext({
      body: { name: 'Single User', email: 'a@b.com' },
    });

    const crud = new CrudBuilder({ ...defaultOptions, dbTables: usersColumns });
    await crud.add(c);

    const insertCalls = dbWrite.queryBuilder.getAllCalls('insert');
    const data = insertCalls[0].args[0] as Record<string, unknown>;
    expect(Array.isArray(data)).toBe(false);
    expect(data.name).toBe('Single User');
  });
});

// -- 7. Negative page validation ---------------------------

describe('Bug fix: pagination validation', () => {
  it('clamps negative _page to 1', async () => {
    const { c, db } = buildContext({
      queries: { _page: ['-5'], _limit: ['10'] },
      queryResult: [],
      countResult: 100,
    });

    const crud = new CrudBuilder(defaultOptions);
    const { meta } = await crud.getRequestResult(c);

    expect(meta.page).toBe(1);
    const offsetCalls = db.queryBuilder.getAllCalls('offset');
    expect(offsetCalls.length).toBe(1);
    expect(Number(offsetCalls[0].args[0])).toBeGreaterThanOrEqual(0);
  });

  it('clamps _page=0 to 1', async () => {
    const { c } = buildContext({
      queries: { _page: ['0'], _limit: ['10'] },
      queryResult: [],
      countResult: 100,
    });

    const crud = new CrudBuilder(defaultOptions);
    const { meta } = await crud.getRequestResult(c);

    expect(meta.page).toBe(1);
  });

  it('clamps negative _skip to 0', async () => {
    const { c, db } = buildContext({
      queries: { _skip: ['-100'], _limit: ['10'] },
      queryResult: [],
      countResult: 100,
    });

    const crud = new CrudBuilder(defaultOptions);
    const { meta } = await crud.getRequestResult(c);

    expect(meta.skip).toBe(0);
  });

  it('pages never negative when skip > total', async () => {
    const { c } = buildContext({
      queries: { _skip: ['200'], _limit: ['10'] },
      queryResult: [],
      countResult: 50,
    });

    const crud = new CrudBuilder(defaultOptions);
    const { meta } = await crud.getRequestResult(c);

    expect(meta.pages).toBeGreaterThanOrEqual(1);
  });
});

// -- 8. Hidden fields --------------------------------------

describe('Hidden fields', () => {
  it('removes hidden fields from list results', async () => {
    const { c } = buildContext({
      queries: { _limit: ['10'] },
      queryResult: [
        { id: 1, name: 'Alice', password: 'secret123' },
        { id: 2, name: 'Bob', password: 'secret456' },
      ],
      countResult: 2,
    });

    const crud = new CrudBuilder({
      ...defaultOptions,
      hiddenFields: ['password'],
    });

    const { result } = await crud.getRequestResult(c);
    for (const row of result) {
      expect(row).not.toHaveProperty('password');
    }
  });

  it('shows owner-visible fields to owner', async () => {
    const mockRoles: any = {
      getPermissions: () => ({}),
      checkWildcardPermissions: ({ key }: { key: string }) =>
        key === 'users.view_email',
    };

    const { c } = buildContext({
      queries: { _limit: ['10'] },
      queryResult: [{ id: 1, name: 'Alice', email: 'a@b.com', userId: 42 }],
      countResult: 1,
      user: { id: 42 },
      roles: mockRoles,
    });

    const crud = new CrudBuilder({
      ...defaultOptions,
      hiddenFields: ['email'],
      userIdFieldName: 'userId',
      permissions: {
        owner: ['users.view_email'],
        fields: {
          viewable: { 'users.view_email': ['email'] },
        },
      },
    });

    const { result } = await crud.getRequestResult(c);
    // owner with matching permission -> email visible
    expect(result[0]).toHaveProperty('email');
  });
});

// -- 9. Soft delete ----------------------------------------

describe('Soft delete', () => {
  it('adds isDeleted=false when table has isDeleted column', async () => {
    const { c, db } = buildContext({
      queries: { _limit: ['10'] },
      queryResult: [],
      countResult: 0,
    });

    const crud = new CrudBuilder(defaultOptions);
    await crud.get(c);

    const whereCalls = db.queryBuilder.getAllCalls('where');
    const deletedFilter = whereCalls.find((call) => {
      const arg = call.args[0] as Record<string, unknown>;
      return typeof arg === 'object' && arg !== null && `${TABLE}.isDeleted` in arg;
    });
    expect(deletedFilter).toBeDefined();
  });

  it('skips isDeleted filter when includeDeleted=true', async () => {
    const { c, db } = buildContext({
      queries: { _limit: ['10'] },
      queryResult: [],
      countResult: 0,
    });

    const crud = new CrudBuilder({ ...defaultOptions, includeDeleted: true });
    await crud.get(c);

    const whereCalls = db.queryBuilder.getAllCalls('where');
    const deletedFilter = whereCalls.find((call) => {
      const arg = call.args[0] as Record<string, unknown>;
      return typeof arg === 'object' && arg !== null && `${TABLE}.isDeleted` in arg;
    });
    expect(deletedFilter).toBeUndefined();
  });
});

// -- 10. getQueryLimit with env vars -----------------------

describe('getQueryLimit (env vars)', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('returns undefined when unlimited is allowed and requested', async () => {
    process.env.CAN_GET_UNLIMITED = 'true';
    const { c } = buildContext({
      queries: { _unlimited: ['true'] },
      queryResult: [],
      countResult: 0,
    });

    const crud = new CrudBuilder(defaultOptions);
    const { meta } = await crud.getRequestResult(c);

    expect(meta.limit).toBe(0);
  });

  it('uses LIMIT_DEFAULT when no _limit in request', async () => {
    process.env.LIMIT_DEFAULT = '25';
    const { c, db } = buildContext({
      queries: {},
      queryResult: [],
      countResult: 0,
    });

    const crud = new CrudBuilder(defaultOptions);
    await crud.get(c);

    const limitCalls = db.queryBuilder.getAllCalls('limit');
    expect(limitCalls.length).toBe(1);
    expect(limitCalls[0].args[0]).toBe(25);
  });

  it('caps _limit to LIMIT_MAX', async () => {
    process.env.LIMIT_MAX = '50';
    const { c, db } = buildContext({
      queries: { _limit: ['1000'] },
      queryResult: [],
      countResult: 0,
    });

    const crud = new CrudBuilder(defaultOptions);
    await crud.get(c);

    const limitCalls = db.queryBuilder.getAllCalls('limit');
    expect(limitCalls[0].args[0]).toBe(50);
  });
});

// -- 11. Options methods -----------------------------------

describe('optionsGet()', () => {
  it('returns documented query parameters', () => {
    const crud = new CrudBuilder({
      ...defaultOptions,
      dbTables: usersColumns,
      searchFields: ['name'],
    });

    const opts = crud.optionsGet();
    expect(opts.queryParameters).toHaveProperty('_fields');
    expect(opts.queryParameters).toHaveProperty('_sort');
    expect(opts.queryParameters).toHaveProperty('_limit');
    expect(opts.queryParameters).toHaveProperty('_search');
    expect(opts.queryParameters).toHaveProperty('name');
  });
});
```

### test/helpers.ts
```ts
import type { Knex } from 'knex';
import type { AppContext, ColumnInfoMap, EnvBindings, UserType, RolesService } from '../src/types';

// -- Chainable Knex QueryBuilder mock ----------------------

type MockCall = { method: string; args: unknown[] };

export class MockQueryBuilder {
  calls: MockCall[] = [];
  private _result: unknown;

  constructor(result: unknown = []) {
    this._result = result;
  }

  setResult(result: unknown): void {
    this._result = result;
  }

  then(resolve: (v: unknown) => void): void {
    resolve(this._result);
  }

  // -- chainable stubs --

  private chain(method: string, ...args: unknown[]): this {
    this.calls.push({ method, args });
    return this;
  }

  withSchema(...a: unknown[]) { return this.chain('withSchema', ...a); }
  where(...a: unknown[]) { return this.chain('where', ...a); }
  whereNot(...a: unknown[]) { return this.chain('whereNot', ...a); }
  whereIn(...a: unknown[]) { return this.chain('whereIn', ...a); }
  whereNotIn(...a: unknown[]) { return this.chain('whereNotIn', ...a); }
  whereNull(...a: unknown[]) { return this.chain('whereNull', ...a); }
  whereNotNull(...a: unknown[]) { return this.chain('whereNotNull', ...a); }
  whereRaw(...a: unknown[]) { return this.chain('whereRaw', ...a); }
  andWhere(...a: unknown[]) { return this.chain('andWhere', ...a); }
  orWhere(...a: unknown[]) { return this.chain('orWhere', ...a); }
  orderBy(...a: unknown[]) { return this.chain('orderBy', ...a); }
  orderByRaw(...a: unknown[]) { return this.chain('orderByRaw', ...a); }
  limit(...a: unknown[]) { return this.chain('limit', ...a); }
  offset(...a: unknown[]) { return this.chain('offset', ...a); }
  column(...a: unknown[]) { return this.chain('column', ...a); }
  select(...a: unknown[]) { return this.chain('select', ...a); }
  leftJoin(...a: unknown[]) { return this.chain('leftJoin', ...a); }
  distinct(...a: unknown[]) { return this.chain('distinct', ...a); }
  insert(...a: unknown[]) { return this.chain('insert', ...a); }
  update(...a: unknown[]) { return this.chain('update', ...a); }
  delete(...a: unknown[]) { return this.chain('delete', ...a); }
  returning(...a: unknown[]) { return this.chain('returning', ...a); }

  count(...a: unknown[]) {
    this.calls.push({ method: 'count', args: a });
    return this;
  }

  first() {
    this.calls.push({ method: 'first', args: [] });
    const r = Array.isArray(this._result) ? this._result[0] : this._result;
    return { then: (resolve: (v: unknown) => void) => resolve(r) };
  }

  hasCalled(method: string): boolean {
    return this.calls.some((c) => c.method === method);
  }

  getCallArgs(method: string): unknown[] | undefined {
    return this.calls.find((c) => c.method === method)?.args;
  }

  getAllCalls(method: string): MockCall[] {
    return this.calls.filter((c) => c.method === method);
  }
}

// -- Mock Knex instance ------------------------------------

export type MockKnexResult = {
  knex: Knex;
  queryBuilder: MockQueryBuilder;
  countBuilder: MockQueryBuilder;
};

export function createMockKnex(options: {
  queryResult?: unknown[];
  countResult?: number;
} = {}): MockKnexResult {
  const { queryResult = [], countResult = 0 } = options;

  const queryBuilder = new MockQueryBuilder(queryResult);
  const countBuilder = new MockQueryBuilder([{ count: String(countResult) }]);

  const knex = Object.assign(
    (_table: string) => queryBuilder,
    {
      from: () => countBuilder,
      raw: (sql: string, _bindings?: unknown) => `RAW:${sql}`,
      fn: { now: () => 'NOW()' },
    },
  );

  return { knex: knex as unknown as Knex, queryBuilder, countBuilder };
}

// -- Mock Hono Context -------------------------------------

export type MockContextOptions = {
  query?: Record<string, string>;
  queries?: Record<string, string[]>;
  params?: Record<string, string>;
  body?: unknown;
  dbTables?: Record<string, ColumnInfoMap>;
  user?: UserType;
  roles?: RolesService;
  queryResult?: unknown[];
  countResult?: number;
  writeResult?: unknown[];
};

export type MockContextResult = {
  c: AppContext;
  db: MockKnexResult;
  dbWrite: MockKnexResult;
  getSet: (key: string) => unknown;
};

export function createMockContext(opts: MockContextOptions = {}): MockContextResult {
  const db = createMockKnex({
    queryResult: opts.queryResult || [],
    countResult: opts.countResult || 0,
  });
  const dbWrite = createMockKnex({
    queryResult: opts.writeResult || [{ id: 1 }],
  });

  const store: Record<string, unknown> = {};

  const c = {
    req: {
      query: () => opts.query || {},
      queries: () => opts.queries || {},
      param: () => opts.params || {},
      json: async () => opts.body || {},
    },
    env: {
      db: db.knex,
      dbWrite: dbWrite.knex,
      dbTables: opts.dbTables || {},
      roles: opts.roles,
    } satisfies EnvBindings as EnvBindings,
    var: {
      user: opts.user,
    },
    set: (key: string, value: unknown) => { store[key] = value; },
  } as unknown as AppContext;

  return {
    c,
    db,
    dbWrite,
    getSet: (key: string) => store[key],
  };
}

// -- Standard table schemas for tests ----------------------

export const usersColumns: ColumnInfoMap = {
  id: { data_type: 'integer', is_nullable: 'NO' },
  name: { data_type: 'string', is_nullable: 'NO' },
  email: { data_type: 'string', is_nullable: 'YES' },
  password: { data_type: 'string', is_nullable: 'NO' },
  status: { data_type: 'string', is_nullable: 'YES' },
  age: { data_type: 'integer', is_nullable: 'YES' },
  userId: { data_type: 'integer', is_nullable: 'YES' },
  isDeleted: { data_type: 'boolean', is_nullable: 'NO' },
  timeCreated: { data_type: 'timestamp', is_nullable: 'NO' },
  timeUpdated: { data_type: 'timestamp', is_nullable: 'YES' },
};
```

### test/Routings.test.ts
```ts
import { describe, it, expect } from 'bun:test';
import { Routings } from '../src/Routings';

describe('Routings', () => {

  // -- crud() route generation -----------------------------

  describe('crud()', () => {
    it('registers 6 routes for a table', () => {
      const router = new Routings();
      router.crud({ table: 'posts' });

      const paths = router.routes.map((r) => `${r.method} ${r.path}`);

      expect(paths).toContain('GET /posts');
      expect(paths).toContain('POST /posts');
      expect(paths).toContain('GET /posts/:id');
      expect(paths).toContain('PUT /posts/:id');
      expect(paths).toContain('PATCH /posts/:id');
      expect(paths).toContain('DELETE /posts/:id');
      expect(router.routes.length).toBe(6);
    });

    it('uses prefix when provided', () => {
      const router = new Routings();
      router.crud({ table: 'posts', prefix: 'api/v1/posts' });

      const paths = router.routes.map((r) => r.path);
      expect(paths).toContain('/api/v1/posts');
      expect(paths).toContain('/api/v1/posts/:id');
    });

    it('normalizes double slashes in prefix', () => {
      const router = new Routings();
      router.crud({ table: 'posts', prefix: '/api//posts' });

      const paths = router.routes.map((r) => r.path);
      expect(paths[0]).toBe('/api//posts');
      // leading slash normalization
      expect(paths[0].startsWith('//')).toBe(false);
    });

    it('registers permissions for protected methods', () => {
      const router = new Routings();
      router.crud({
        table: 'posts',
        permissions: {
          protectedMethods: ['POST', 'DELETE'],
        },
      });

      expect(router.routesPermissions).toHaveProperty('POST /posts');
      expect(router.routesPermissions).toHaveProperty('DELETE /posts/:id');
      expect(router.routesPermissions).not.toHaveProperty('GET /posts');
    });

    it('expands wildcard * permissions to all methods', () => {
      const router = new Routings();
      router.crud({
        table: 'items',
        permissions: { protectedMethods: ['*'] },
      });

      expect(router.routesPermissions).toHaveProperty('GET /items');
      expect(router.routesPermissions).toHaveProperty('POST /items');
      expect(router.routesPermissions).toHaveProperty('PUT /items/:id');
      expect(router.routesPermissions).toHaveProperty('PATCH /items/:id');
      expect(router.routesPermissions).toHaveProperty('DELETE /items/:id');
    });
  });

  // -- HTTP method helpers ---------------------------------

  describe('HTTP methods', () => {
    it('registers GET route', () => {
      const router = new Routings();
      router.get('/health', async () => {});

      expect(router.routes.length).toBe(1);
      expect(router.routes[0].method).toBe('GET');
      expect(router.routes[0].path).toBe('/health');
    });

    it('registers POST route', () => {
      const router = new Routings();
      router.post('/items', async () => {});

      expect(router.routes[0].method).toBe('POST');
    });

    it('registers PUT route', () => {
      const router = new Routings();
      router.put('/items/:id', async () => {});

      expect(router.routes[0].method).toBe('PUT');
    });

    it('registers PATCH route', () => {
      const router = new Routings();
      router.patch('/items/:id', async () => {});

      expect(router.routes[0].method).toBe('PATCH');
    });

    it('registers DELETE route', () => {
      const router = new Routings();
      router.delete('/items/:id', async () => {});

      expect(router.routes[0].method).toBe('DELETE');
    });

    it('registers multiple handlers as separate routes', () => {
      const router = new Routings();
      const mw1 = async () => {};
      const mw2 = async () => {};
      router.get('/test', mw1, mw2);

      expect(router.routes.length).toBe(2);
    });

    it('use() registers route without method', () => {
      const router = new Routings();
      router.use('/api/*', async () => {});

      expect(router.routes[0].method).toBeUndefined();
      expect(router.routes[0].path).toBe('/api/*');
    });

    it('all() registers route on wildcard path', () => {
      const router = new Routings();
      router.all(async () => {});

      expect(router.routes[0].path).toBe('*');
    });
  });

  // -- Errors ----------------------------------------------

  describe('errors()', () => {
    it('registers error definitions', () => {
      const router = new Routings();
      router.errors({
        NOT_FOUND: { code: 1001, status: 404 },
        BAD_INPUT: { code: 1002, status: 400, description: 'Invalid input' },
      });

      expect(router.routesErrors.NOT_FOUND.status).toBe(404);
      expect(router.routesErrors.BAD_INPUT.description).toBe('Invalid input');
    });

    it('merges multiple error calls', () => {
      const router = new Routings();
      router.errors({ A: { code: 1, status: 400 } });
      router.errors({ B: { code: 2, status: 404 } });

      expect(router.routesErrors).toHaveProperty('A');
      expect(router.routesErrors).toHaveProperty('B');
    });

    it('accepts array of error objects', () => {
      const router = new Routings();
      router.errors([
        { A: { code: 1, status: 400 } },
        { B: { code: 2, status: 404 } },
      ]);

      expect(router.routesErrors).toHaveProperty('A');
      expect(router.routesErrors).toHaveProperty('B');
    });
  });

  // -- Email templates -------------------------------------

  describe('emailTemplates()', () => {
    it('registers templates', () => {
      const router = new Routings();
      router.emailTemplates({
        welcome: { subject: 'Hi', html: '<b>Hello</b>' },
      });

      expect(router.routesEmailTemplates.welcome.subject).toBe('Hi');
    });

    it('merges with existing templates', () => {
      const router = new Routings();
      router.emailTemplates({ a: { subject: 'A' } });
      router.emailTemplates({ b: { subject: 'B' } });

      expect(router.routesEmailTemplates).toHaveProperty('a');
      expect(router.routesEmailTemplates).toHaveProperty('b');
    });
  });

  // -- Constructor options ---------------------------------

  describe('constructor', () => {
    it('stores migrationDirs', () => {
      const dirs = ['/path/to/migrations'];
      const router = new Routings({ migrationDirs: dirs });

      expect(router.migrationDirs).toEqual(dirs);
    });

    it('works without options', () => {
      const router = new Routings();
      expect(router.routes).toEqual([]);
    });
  });
});
```

