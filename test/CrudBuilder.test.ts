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
