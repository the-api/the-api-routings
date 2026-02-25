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
| `_unlimited` | `?_unlimited=true` | Return all records |
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
