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
