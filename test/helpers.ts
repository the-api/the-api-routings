import { mock } from 'bun:test';

export function createMockQb(data: any[] = []) {
  const qb: any = {};

  const chainMethods = [
    'withSchema', 'where', 'whereNot', 'whereIn', 'whereNotIn',
    'whereNull', 'whereNotNull', 'whereRaw', 'andWhere', 'orWhere',
    'select', 'column', 'orderBy', 'orderByRaw', 'limit', 'offset',
    'leftJoin', 'distinct', 'insert', 'update', 'returning',
  ];

  for (const m of chainMethods) {
    qb[m] = mock((..._args: any[]) => qb);
  }

  qb.delete = mock(async () => 1);
  qb.first = mock(async () => data[0] ?? undefined);
  qb.then = (resolve: Function) => resolve(data);
  qb.catch = () => qb;

  return qb;
}

export function createMockDb(data: any[] = [], totalCount?: number) {
  const qb = createMockQb(data);
  const count = totalCount ?? data.length;

  const db: any = (_table: string) => qb;
  db.raw = mock((sql: string, _bindings?: any) => sql);
  db.fn = { now: mock(() => 'NOW()') };
  db.from = mock((_sub: any) => ({
    count: mock(async () => [{ count: String(count) }]),
  }));

  return { db, qb };
}

export interface MockContextOptions {
  data?: any[];
  totalCount?: number;
  tableRows?: Record<string, any>;
  dbTables?: Record<string, any>;
  query?: Record<string, any>;
  queries?: Record<string, any>;
  params?: Record<string, any>;
  body?: any;
  user?: any;
  roles?: any;
  env?: Record<string, any>;
  db?: any;
  dbWrite?: any;
}

export function createMockContext(opts: MockContextOptions = {}) {
  const sets: Record<string, any> = {};

  const readMock = opts.db
    ? { db: opts.db, qb: null }
    : createMockDb(opts.data || [], opts.totalCount);
  const writeMock = opts.dbWrite
    ? { db: opts.dbWrite, qb: null }
    : createMockDb(opts.data || []);

  const tableName = opts.dbTables ? undefined : 'public.testTable';

  const c: any = {
    env: {
      db: readMock.db,
      dbWrite: writeMock.db,
      dbTables: opts.dbTables || (tableName ? { [tableName]: opts.tableRows || {} } : {}),
      roles: opts.roles || null,
      ...(opts.env || {}),
    },
    var: { user: opts.user || null },
    req: {
      query: () => opts.query || {},
      queries: () => opts.queries || {},
      param: () => opts.params || {},
      json: async () => opts.body || {},
    },
    set(key: string, value: any) { sets[key] = value; },
  };

  return { c, sets, readQb: readMock.qb, writeQb: writeMock.qb };
}

export const DEFAULT_CRUD_PARAMS = {
  table: 'testTable',
  schema: 'public',
};
