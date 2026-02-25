## Project Overview

**the-api-routings** — TypeScript library that provides automatic CRUD endpoint generation
over PostgreSQL tables for the [the-api](https://github.com/ivanoff/the-api) framework.

One call `router.crud({ table: 'users' })` generates 6 REST routes:
`GET /`, `POST /`, `GET /:id`, `PUT /:id`, `PATCH /:id`, `DELETE /:id`.

## Tech Stack

- **Runtime:** Bun
- **Language:** TypeScript (ESNext, strict)
- **HTTP framework:** Hono
- **SQL query builder:** Knex (PostgreSQL-oriented)
- **Build:** `bun build` + `tsc` (declarations only)
- **Test:** `bun test` (bun:test runner)

## Repository Structure

```
src/
├── index.ts            # Barrel export
├── Routings.ts         # Router class: HTTP method helpers + crud() auto-generator
├── CrudBuilder.ts      # Core: builds Knex queries for CRUD operations (~550 lines)
└── types.ts            # All TypeScript types and interfaces

test/
├── helpers.ts          # Shared mocks: createMockQb, createMockDb, createMockContext
├── Routings.test.ts    # Routings class tests
└── CrudBuilder.test.ts # CrudBuilder tests (constructor, where, sort, pagination, CRUD ops)

dist/                   # Build output (gitignored)
```

## Key Concepts

### Routings (src/Routings.ts)
- Wraps Hono's `createFactory` for handler creation
- Methods: `get()`, `post()`, `put()`, `patch()`, `delete()`, `use()`, `all()`
- `crud(params)` — generates 6 routes, each instantiates a fresh `CrudBuilder`
- Manages `routesPermissions`, `routesErrors`, `routesEmailTemplates`
- Accepts `migrationDirs` in constructor options

### CrudBuilder (src/CrudBuilder.ts)
- One instance per request (created inside route handler)
- Context comes from Hono's `Context` object:
  - `c.env.db` — Knex read connection
  - `c.env.dbWrite` — Knex write connection
  - `c.env.dbTables` — table schemas keyed by `"schema.table"`
  - `c.env.roles` — optional roles/permissions service
  - `c.var.user` — authenticated user (has `.id` and `.roles`)
- Results are set via `c.set('result', ...)` and `c.set('meta', ...)`

### Query Parameters (GET endpoints)
| Param | Purpose |
|---|---|
| `_fields` | Select specific columns: `?_fields=id,name` |
| `_sort` | Sort: `?_sort=-created,name,random()` (NULLS LAST) |
| `_limit`, `_page`, `_skip` | Offset pagination |
| `_after` | Cursor pagination |
| `_unlimited` | Disable limit |
| `_lang` | Translation language code |
| `_search` | Trigram search (`%` and `<->` operators) |
| `_join` | On-demand joins |
| `field~` | iLIKE filter |
| `field!` | NOT / NOT IN filter |
| `_null_field` | WHERE field IS NULL |
| `_not_null_field` | WHERE field IS NOT NULL |
| `_in_field` | WHERE field IN (JSON array) |
| `_not_in_field` | WHERE field NOT IN (JSON array) |
| `_from_field` | WHERE field >= value |
| `_to_field` | WHERE field <= value |

### Soft Delete
- Column `isDeleted` (boolean) — soft delete flag
- `deletedReplacements` — field value substitutions for deleted rows
- `includeDeleted` — show deleted rows with replacements

### Permissions System
- `permissions.protectedMethods` — methods requiring permission check
- `permissions.fields.viewable` — fields visible per permission
- `permissions.owner` — permissions granted to record owner
- `hiddenFields` — fields stripped from response (SQL-level filtering NOT applied, post-query only)

## Commands

```bash
# Install
bun install

# Build (JS + declarations)
bun run build

# Run tests
bun test

# Run specific test file
bun test test/CrudBuilder.test.ts
```

## Code Conventions

- **Naming:** camelCase for fields (`userId`, `timeCreated`, `isDeleted`)
- **Immutability:** CrudBuilder is created fresh per request, never reused
- **Errors:** thrown as `new Error('ERROR_CODE')` — uppercase snake_case
- **DB access:** read via `c.env.db`, write via `c.env.dbWrite` (read replica pattern)
- **Schema:** default is `'public'`, always used in `getDbWithSchema()`
- **ReadOnly fields default:** `['id', 'timeCreated', 'timeUpdated', 'timeDeleted', 'isDeleted']`

## Writing Tests

Tests use `bun:test` with manual mocks (no real DB):

```typescript
import { createMockQb, createMockDb, createMockContext } from './helpers';

// For unit-testing a method:
const cb = new CrudBuilder({ table: 'testTable' });
const qb = createMockQb();
cb.res = qb;
cb.sort('-name', db);
expect(qb.orderBy).toHaveBeenCalledWith('name', 'desc', 'last');

// For testing full CRUD operation:
const { c, sets } = createMockContext({
  data: [{ id: 1, name: 'test' }],
  totalCount: 1,
  tableRows: { id: {}, name: {} },
  queries: { _limit: ['10'] },
});
await cb.get(c);
expect(sets.result).toHaveLength(1);
expect(sets.meta.total).toBe(1);
```

Mock architecture:
- `createMockQb(data)` — chainable Knex query builder mock (all methods return self, `await` resolves to `data`)
- `createMockDb(data, count)` — callable mock with `.raw()`, `.from().count()`, `.fn.now()`
- `createMockContext(opts)` — Hono Context mock with `env`, `var`, `req`, `set()`

## Known Gaps (vs legacy koa_knex_helper.js)

These features from the old Koa version are NOT yet ported:

### Security-critical
- **Owner-based access control** — no `isFullAccess()` method, no `clone().first()` owner check
- **`keepUserId` / `needToCheckUserId`** in update/delete — users can modify others' records

### Missing query features
- **`_or` parameter** — OR conditions not extracted from query
- **`_isNull` parameter** — dedicated isNull shorthand not extracted
- **`_whereNotIn` from query** — `whereNotIn()` exists but never called from `getRequestResult()`

### Other
- **`statusesFromJoin`** — conditional joins by user token statuses
- **SQLite fallback** in `add()` — `returning('*')` fix for SQLite
- **Hidden fields SQL-level filtering** — currently post-query only (performance)
- **Join alias deduplication** from column list in `fields()`
- **Coalesce-where array OR grouping** — current implementation may produce incorrect SQL with multiple WHERE conditions (uses separate `orWhere` instead of grouped callback)

## PostgreSQL-Specific Features

This library generates PostgreSQL-specific SQL:
- `COALESCE` subqueries for joins
- `json_build_object` / `jsonb_agg` for nested data
- `RANDOM()` for random ordering
- Trigram operators `%` and `<->` for search (requires `pg_trgm` extension)
- `NULLS LAST` in ordering

## Dependencies

| Package | Role | External? |
|---|---|---|
| `hono` | HTTP framework types + factory | Yes (peer-like) |
| `flattening` | Object flattening for whereBindings | Yes |
| `knex` | SQL builder types | Dev/peer |
```
