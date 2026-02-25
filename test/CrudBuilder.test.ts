import { describe, it, expect, mock, beforeEach } from 'bun:test';
import CrudBuilder from '../src/CrudBuilder';
import {
  createMockQb,
  createMockDb,
  createMockContext,
  DEFAULT_CRUD_PARAMS,
} from './helpers';

// ════════════════════════════════════════════════════
//  Constructor
// ════════════════════════════════════════════════════

describe('CrudBuilder – constructor', () => {
  it('sets table and default schema', () => {
    const cb = new CrudBuilder({ table: 'users' });
    expect(cb.table).toBe('users');
    expect(cb.schema).toBe('public');
  });

  it('accepts custom schema', () => {
    const cb = new CrudBuilder({ table: 'users', schema: 'app' });
    expect(cb.schema).toBe('app');
  });

  it('defaults arrays and objects', () => {
    const cb = new CrudBuilder({ table: 't' });
    expect(cb.join).toEqual([]);
    expect(cb.leftJoin).toEqual([]);
    expect(cb.joinOnDemand).toEqual([]);
    expect(cb.translate).toEqual([]);
    expect(cb.searchFields).toEqual([]);
    expect(cb.aliases).toEqual({});
    expect(cb.defaultWhere).toEqual({});
    expect(cb.access).toEqual({});
    expect(cb.lang).toBe('en');
  });

  it('defaults readOnlyFields', () => {
    const cb = new CrudBuilder({ table: 't' });
    expect(cb.readOnlyFields).toContain('id');
    expect(cb.readOnlyFields).toContain('timeCreated');
    expect(cb.readOnlyFields).toContain('timeUpdated');
    expect(cb.readOnlyFields).toContain('isDeleted');
  });

  it('converts tokenRequired array to map', () => {
    const cb = new CrudBuilder({ table: 't', tokenRequired: ['get', 'add'] });
    expect(cb.tokenRequired).toEqual({ get: true, add: true });
  });

  it('converts ownerRequired array to map', () => {
    const cb = new CrudBuilder({ table: 't', ownerRequired: ['update', 'delete'] });
    expect(cb.ownerRequired).toEqual({ update: true, delete: true });
  });

  it('sets includeDeleted from deletedReplacements', () => {
    const cb = new CrudBuilder({ table: 't', deletedReplacements: { name: '***' } });
    expect(cb.includeDeleted).toBe(true);
  });

  it('explicit includeDeleted overrides deletedReplacements', () => {
    const cb = new CrudBuilder({
      table: 't',
      deletedReplacements: { name: '***' },
      includeDeleted: false,
    });
    expect(cb.includeDeleted).toBe(false);
  });
});

// ════════════════════════════════════════════════════
//  getDbWithSchema
// ════════════════════════════════════════════════════

describe('CrudBuilder – getDbWithSchema', () => {
  it('calls db with table name and withSchema', () => {
    const cb = new CrudBuilder({ table: 'users', schema: 'app' });
    const qb = createMockQb();
    const db: any = mock(() => qb);

    const result = cb.getDbWithSchema(db);

    expect(db).toHaveBeenCalledWith('users');
    expect(qb.withSchema).toHaveBeenCalledWith('app');
    expect(result).toBe(qb);
  });

  it('falls back to public schema when schema is empty', () => {
    const cb = new CrudBuilder({ table: 'users', schema: '' });
    const qb = createMockQb();
    const db: any = mock(() => qb);

    cb.getDbWithSchema(db);

    expect(qb.withSchema).toHaveBeenCalledWith('public');
  });
});

// ════════════════════════════════════════════════════
//  sort
// ════════════════════════════════════════════════════

describe('CrudBuilder – sort', () => {
  let cb: CrudBuilder;
  let qb: any;
  let db: any;

  beforeEach(() => {
    cb = new CrudBuilder({ table: 't' });
    qb = createMockQb();
    cb.res = qb;
    db = createMockDb().db;
  });

  it('does nothing without sort and defaultSort', () => {
    cb.sort(undefined, db);
    expect(qb.orderBy).not.toHaveBeenCalled();
  });

  it('applies ascending sort with NULLS LAST', () => {
    cb.sort('name', db);
    expect(qb.orderBy).toHaveBeenCalledWith('name', undefined, 'last');
  });

  it('applies descending sort with NULLS LAST', () => {
    cb.sort('-name', db);
    expect(qb.orderBy).toHaveBeenCalledWith('name', 'desc', 'last');
  });

  it('applies multiple sort fields', () => {
    cb.sort('-created,name', db);
    expect(qb.orderBy).toHaveBeenCalledTimes(2);
    expect(qb.orderBy).toHaveBeenCalledWith('created', 'desc', 'last');
    expect(qb.orderBy).toHaveBeenCalledWith('name', undefined, 'last');
  });

  it('handles random() sort', () => {
    cb.sort('random()', db);
    expect(qb.orderBy).toHaveBeenCalled();
  });

  it('falls back to defaultSort', () => {
    cb.defaultSort = '-id';
    cb.sort(undefined, db);
    expect(qb.orderBy).toHaveBeenCalledWith('id', 'desc', 'last');
  });

  it('applies sortRaw', () => {
    cb.sortRaw = 'custom_column DESC NULLS LAST';
    cb.sort(undefined, db);
    expect(qb.orderByRaw).toHaveBeenCalledWith('custom_column DESC NULLS LAST');
  });
});

// ════════════════════════════════════════════════════
//  pagination
// ════════════════════════════════════════════════════

describe('CrudBuilder – pagination', () => {
  let cb: CrudBuilder;
  let qb: any;

  beforeEach(() => {
    cb = new CrudBuilder({ table: 't' });
    qb = createMockQb();
    cb.res = qb;
  });

  it('does nothing when no _limit', () => {
    cb.pagination({ _limit: undefined });
    expect(qb.limit).not.toHaveBeenCalled();
  });

  it('does nothing when _unlimited is true', () => {
    cb.pagination({ _limit: 10, _unlimited: 'true' });
    expect(qb.limit).not.toHaveBeenCalled();
  });

  it('does nothing when _unlimited is boolean true', () => {
    cb.pagination({ _limit: 10, _unlimited: true });
    expect(qb.limit).not.toHaveBeenCalled();
  });

  it('applies limit', () => {
    cb.pagination({ _limit: 25 });
    expect(qb.limit).toHaveBeenCalledWith(25);
  });

  it('applies offset from _page', () => {
    cb.pagination({ _limit: 10, _page: 3 });
    expect(qb.limit).toHaveBeenCalledWith(10);
    expect(qb.offset).toHaveBeenCalledWith(20); // (3-1)*10
  });

  it('applies offset from _skip', () => {
    cb.pagination({ _limit: 10, _skip: 5 });
    expect(qb.limit).toHaveBeenCalledWith(10);
    expect(qb.offset).toHaveBeenCalledWith(5);
  });

  it('combines _page and _skip', () => {
    cb.pagination({ _limit: 10, _page: 2, _skip: 3 });
    expect(qb.offset).toHaveBeenCalledWith(13); // (2-1)*10 + 3
  });

  it('defaults _skip to 0', () => {
    cb.pagination({ _limit: 10, _page: 1 });
    expect(qb.offset).toHaveBeenCalledWith(0);
  });
});

// ════════════════════════════════════════════════════
//  where
// ════════════════════════════════════════════════════

describe('CrudBuilder – where', () => {
  let cb: CrudBuilder;
  let qb: any;
  let db: any;

  beforeEach(() => {
    cb = new CrudBuilder({ table: 'testTable' });
    qb = createMockQb();
    cb.res = qb;
    db = createMockDb().db;
  });

  it('does nothing with null/undefined whereObj', () => {
    cb.where(null, db);
    cb.where(undefined, db);
    expect(qb.where).not.toHaveBeenCalled();
  });

  it('handles simple key-value (table-prefixed by default)', () => {
    cb.where({ status: 'active' }, db);
    expect(qb.where).toHaveBeenCalledWith({ 'testTable.status': 'active' });
  });

  it('handles key with dot directly', () => {
    cb.where({ 'other.status': 'active' }, db);
    expect(qb.where).toHaveBeenCalledWith('other.status', 'active');
  });

  it('handles ilike operator (~)', () => {
    cb.where({ 'name~': '%test%' }, db);
    expect(qb.where).toHaveBeenCalledWith('name', 'ilike', '%test%');
  });

  it('handles not operator (!) with single value', () => {
    cb.where({ 'status!': 'deleted' }, db);
    expect(qb.whereNot).toHaveBeenCalledWith('status', 'deleted');
  });

  it('handles not operator (!) with array value', () => {
    cb.where({ 'status!': ['a', 'b'] }, db);
    expect(qb.whereNotIn).toHaveBeenCalledWith('status', ['a', 'b']);
  });

  it('handles _null_ prefix', () => {
    cb.where({ _null_email: 'true' }, db);
    expect(qb.whereNull).toHaveBeenCalledWith('email');
  });

  it('handles _not_null_ prefix', () => {
    cb.where({ _not_null_email: 'true' }, db);
    expect(qb.whereNotNull).toHaveBeenCalledWith('email');
  });

  it('handles _in_ prefix with JSON array', () => {
    cb.where({ _in_id: '[1,2,3]' }, db);
    expect(qb.whereIn).toHaveBeenCalledWith('id', [1, 2, 3]);
  });

  it('throws ERROR_QUERY_VALUE for _in_ with invalid JSON', () => {
    expect(() => cb.where({ _in_id: 'not-json' }, db)).toThrow('ERROR_QUERY_VALUE');
  });

  it('handles _not_in_ prefix', () => {
    cb.where({ _not_in_id: '[4,5]' }, db);
    expect(qb.whereNotIn).toHaveBeenCalledWith('id', [4, 5]);
  });

  it('throws ERROR_QUERY_VALUE for _not_in_ with invalid JSON', () => {
    expect(() => cb.where({ _not_in_id: '{bad}' }, db)).toThrow('ERROR_QUERY_VALUE');
  });

  it('handles _from_ range', () => {
    cb.where({ _from_year: '2020' }, db);
    expect(qb.where).toHaveBeenCalledWith('year', '>=', '2020');
  });

  it('handles _to_ range', () => {
    cb.where({ _to_year: '2025' }, db);
    expect(qb.where).toHaveBeenCalledWith('year', '<=', '2025');
  });

  it('ignores _from_/_to_ with empty string', () => {
    cb.where({ _from_year: '' }, db);
    expect(qb.where).not.toHaveBeenCalled();
  });

  it('handles array value -> whereIn', () => {
    cb.where({ id: ['1', '2', '3'] }, db);
    expect(qb.whereIn).toHaveBeenCalledWith('id', ['1', '2', '3']);
  });

  it('handles null value -> whereNull', () => {
    cb.where({ deletedAt: null }, db);
    expect(qb.whereNull).toHaveBeenCalledWith('deletedAt');
  });

  it('merges defaultWhere with where', () => {
    cb.defaultWhere = { tenantId: '1' };
    cb.where({ ...cb.defaultWhere, status: 'ok' }, db);
    expect(qb.where).toHaveBeenCalledWith({ 'testTable.tenantId': '1' });
    expect(qb.where).toHaveBeenCalledWith({ 'testTable.status': 'ok' });
  });
});

// ════════════════════════════════════════════════════
//  whereNotIn
// ════════════════════════════════════════════════════

describe('CrudBuilder – whereNotIn', () => {
  it('applies whereNotIn for each entry', () => {
    const cb = new CrudBuilder({ table: 't' });
    const qb = createMockQb();
    cb.res = qb;

    cb.whereNotIn({ status: ['deleted', 'banned'], role: ['guest'] });

    expect(qb.whereNotIn).toHaveBeenCalledTimes(2);
    expect(qb.whereNotIn).toHaveBeenCalledWith('status', ['deleted', 'banned']);
    expect(qb.whereNotIn).toHaveBeenCalledWith('role', ['guest']);
  });

  it('does nothing with undefined', () => {
    const cb = new CrudBuilder({ table: 't' });
    const qb = createMockQb();
    cb.res = qb;
    cb.whereNotIn(undefined);
    expect(qb.whereNotIn).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════
//  checkDeleted
// ════════════════════════════════════════════════════

describe('CrudBuilder – checkDeleted', () => {
  it('adds isDeleted=false when table has isDeleted', () => {
    const cb = new CrudBuilder({ table: 'posts' });
    const qb = createMockQb();
    cb.res = qb;
    cb.rows = { isDeleted: {} };

    cb.checkDeleted();

    expect(qb.where).toHaveBeenCalledWith({ 'posts.isDeleted': false });
  });

  it('skips when includeDeleted is true', () => {
    const cb = new CrudBuilder({ table: 'posts', includeDeleted: true });
    const qb = createMockQb();
    cb.res = qb;
    cb.rows = { isDeleted: {} };

    cb.checkDeleted();

    expect(qb.where).not.toHaveBeenCalled();
  });

  it('skips when table has no isDeleted', () => {
    const cb = new CrudBuilder({ table: 'posts' });
    const qb = createMockQb();
    cb.res = qb;
    cb.rows = {};

    cb.checkDeleted();

    expect(qb.where).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════
//  getHiddenFields
// ════════════════════════════════════════════════════

describe('CrudBuilder – getHiddenFields', () => {
  it('returns hiddenFields when no roles', () => {
    const cb = new CrudBuilder({ table: 't', hiddenFields: ['secret'] });
    const result = cb.getHiddenFields();
    expect(result.regular).toEqual(['secret']);
    expect(result.owner).toEqual(['secret']);
  });

  it('returns empty arrays when no hiddenFields', () => {
    const cb = new CrudBuilder({ table: 't' });
    const result = cb.getHiddenFields();
    expect(result.regular).toEqual([]);
    expect(result.owner).toEqual([]);
  });
});

// ════════════════════════════════════════════════════
//  deleteHiddenFieldsFromResult
// ════════════════════════════════════════════════════

describe('CrudBuilder – deleteHiddenFieldsFromResult', () => {
  it('removes regular hidden fields for non-owner', () => {
    const cb = new CrudBuilder({ table: 't', hiddenFields: ['secret', 'internal'] });
    cb.userIdFieldName = 'userId';
    cb.user = { id: 999 };

    const row = { id: 1, name: 'test', secret: '***', internal: 'x', userId: 1 };
    const hidden = { regular: ['secret', 'internal'], owner: ['internal'] };

    cb.deleteHiddenFieldsFromResult(row, hidden);

    expect(row.secret).toBeUndefined();
    expect(row.internal).toBeUndefined();
    expect(row.name).toBe('test');
  });

  it('removes owner hidden fields for owner', () => {
    const cb = new CrudBuilder({ table: 't' });
    cb.userIdFieldName = 'userId';
    cb.user = { id: 1 };

    const row = { id: 1, name: 'test', secret: '***', internal: 'x', userId: 1 };
    const hidden = { regular: ['secret', 'internal'], owner: ['internal'] };

    cb.deleteHiddenFieldsFromResult(row, hidden);

    expect(row.secret).toBe('***');       // visible for owner
    expect(row.internal).toBeUndefined();  // still hidden for owner
  });

  it('does nothing with no hiddenFields', () => {
    const cb = new CrudBuilder({ table: 't' });
    const row = { id: 1, name: 'test' };
    cb.deleteHiddenFieldsFromResult(row, undefined);
    expect(row.name).toBe('test');
  });
});

// ════════════════════════════════════════════════════
//  updateData
// ════════════════════════════════════════════════════

describe('CrudBuilder – updateData', () => {
  it('removes readOnlyFields', () => {
    const cb = new CrudBuilder({ table: 'testTable' });
    const { c } = createMockContext({
      tableRows: { name: {}, title: {} },
    });

    const result = cb.updateData(c, { id: 1, name: 'a', timeCreated: 'x' });

    expect(result.id).toBeUndefined();
    expect(result.timeCreated).toBeUndefined();
    expect(result.name).toBe('a');
  });

  it('keeps only known table columns', () => {
    const cb = new CrudBuilder({ table: 'testTable' });
    const { c } = createMockContext({
      tableRows: { name: {} },
    });

    const result = cb.updateData(c, { name: 'a', unknown: 'b' });

    expect(result.name).toBe('a');
    expect(result.unknown).toBeUndefined();
  });

  it('throws on missing required field', () => {
    const cb = new CrudBuilder({
      table: 'testTable',
      requiredFields: { name: 'NAME_REQUIRED' } as any,
    });
    const { c } = createMockContext({ tableRows: { name: {} } });

    expect(() => cb.updateData(c, {})).toThrow('NAME_REQUIRED');
  });

  it('sets userId from user', () => {
    const cb = new CrudBuilder({ table: 'testTable' });
    const { c } = createMockContext({
      tableRows: { name: {}, userId: {} },
      user: { id: 42 },
    });

    const result = cb.updateData(c, { name: 'test' });

    expect(result.userId).toBe(42);
  });

  it('does not set userId when no user', () => {
    const cb = new CrudBuilder({ table: 'testTable' });
    const { c } = createMockContext({
      tableRows: { name: {}, userId: {} },
    });

    const result = cb.updateData(c, { name: 'test' });

    expect(result.userId).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════
//  updateIncomingData
// ════════════════════════════════════════════════════

describe('CrudBuilder – updateIncomingData', () => {
  it('handles single object', () => {
    const cb = new CrudBuilder({ table: 'testTable' });
    const { c } = createMockContext({ tableRows: { name: {} } });

    const result = cb.updateIncomingData(c, { name: 'test' });

    expect(result.name).toBe('test');
  });

  it('handles array of objects', () => {
    const cb = new CrudBuilder({ table: 'testTable' });
    const { c } = createMockContext({ tableRows: { name: {} } });

    const result = cb.updateIncomingData(c, [{ name: 'a' }, { name: 'b' }]);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });
});

// ════════════════════════════════════════════════════
//  getJoinFields
// ════════════════════════════════════════════════════

describe('CrudBuilder – getJoinFields', () => {
  it('returns ARRAY type for joins without field', () => {
    const cb = new CrudBuilder({
      table: 't',
      join: [{ table: 'tags', where: '"tags"."postId" = "t"."id"' }],
    });
    expect(cb.getJoinFields()).toEqual({ tags: 'ARRAY' });
  });

  it('returns boolean for ::bool field', () => {
    const cb = new CrudBuilder({
      table: 't',
      join: [{ table: 'x', alias: 'liked', field: 'EXISTS(...)::bool', where: '1=1' }],
    });
    expect(cb.getJoinFields()).toEqual({ liked: 'boolean' });
  });

  it('returns integer for ::int field', () => {
    const cb = new CrudBuilder({
      table: 't',
      join: [{ table: 'x', alias: 'cnt', field: 'COUNT(*)::int', where: '1=1' }],
    });
    expect(cb.getJoinFields()).toEqual({ cnt: 'integer' });
  });

  it('returns string for other fields', () => {
    const cb = new CrudBuilder({
      table: 't',
      join: [{ table: 'x', alias: 'label', field: '"label"', where: '1=1' }],
    });
    expect(cb.getJoinFields()).toEqual({ label: 'string' });
  });
});

// ════════════════════════════════════════════════════
//  optionsGet / optionsAdd / optionsUpdate / optionsDelete
// ════════════════════════════════════════════════════

describe('CrudBuilder – options methods', () => {
  it('optionsGet returns queryParameters', () => {
    const cb = new CrudBuilder({
      table: 't',
      dbTables: { name: { data_type: 'string', is_nullable: 'NO' } },
    });
    const opts = cb.optionsGet();

    expect(opts.queryParameters.name).toBe('string');
    expect(opts.queryParameters._fields).toBeDefined();
    expect(opts.queryParameters._sort).toBeDefined();
    expect(opts.queryParameters._limit).toBe('integer');
    expect(opts.queryParameters._page).toBe('integer');
    expect(opts.queryParameters._lang).toBe('string');
  });

  it('optionsGet includes search param when searchFields set', () => {
    const cb = new CrudBuilder({ table: 't', searchFields: ['name'] });
    const opts = cb.optionsGet();
    expect(opts.queryParameters._search).toBe('string');
  });

  it('optionsGet omits _search when no searchFields', () => {
    const cb = new CrudBuilder({ table: 't' });
    const opts = cb.optionsGet();
    expect(opts.queryParameters._search).toBeUndefined();
  });

  it('optionsGet generates from/to for non-boolean fields', () => {
    const cb = new CrudBuilder({
      table: 't',
      dbTables: { year: { data_type: 'integer', is_nullable: 'NO' } },
    });
    const opts = cb.optionsGet();
    expect(opts.queryParameters._from_year).toBe('integer');
    expect(opts.queryParameters._to_year).toBe('integer');
  });

  it('optionsGet generates null filters for nullable fields', () => {
    const cb = new CrudBuilder({
      table: 't',
      dbTables: { email: { data_type: 'string', is_nullable: 'YES' } },
    });
    const opts = cb.optionsGet();
    expect(opts.queryParameters._null_email).toBe('string');
    expect(opts.queryParameters._not_null_email).toBe('string');
  });

  it('optionsAdd excludes readOnlyFields from schema', () => {
    const cb = new CrudBuilder({
      table: 't',
      dbTables: {
        id: { data_type: 'integer' },
        name: { data_type: 'string' },
        timeCreated: { data_type: 'string' },
      },
    });
    const opts = cb.optionsAdd();
    expect(opts.schema.name).toBeDefined();
    expect(opts.schema.id).toBeUndefined();
    expect(opts.schema.timeCreated).toBeUndefined();
  });

  it('optionsUpdate excludes readOnlyFields from schema', () => {
    const cb = new CrudBuilder({
      table: 't',
      dbTables: {
        id: { data_type: 'integer' },
        name: { data_type: 'string' },
      },
    });
    const opts = cb.optionsUpdate();
    expect(opts.schema.name).toBeDefined();
    expect(opts.schema.id).toBeUndefined();
  });

  it('optionsDelete returns access settings', () => {
    const cb = new CrudBuilder({
      table: 't',
      tokenRequired: ['delete'],
      ownerRequired: ['delete'],
    });
    const opts = cb.optionsDelete();
    expect(opts.tokenRequired).toBe(true);
    expect(opts.ownerRequired).toBe(true);
  });
});

// ════════════════════════════════════════════════════
//  CRUD – get
// ════════════════════════════════════════════════════

describe('CrudBuilder – get', () => {
  it('sets result and meta', async () => {
    const data = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }];
    const { c, sets } = createMockContext({
      data,
      totalCount: 2,
      tableRows: { id: {}, name: {} },
      queries: {},
    });

    const cb = new CrudBuilder(DEFAULT_CRUD_PARAMS);
    await cb.get(c);

    expect(sets.result).toEqual(data);
    expect(sets.meta).toBeDefined();
    expect(sets.meta.total).toBe(2);
  });

  it('calculates pagination meta', async () => {
    const data = [{ id: 1 }];
    const { c, sets } = createMockContext({
      data,
      totalCount: 30,
      tableRows: { id: {} },
      queries: { _limit: ['10'], _page: ['2'] },
    });

    const cb = new CrudBuilder(DEFAULT_CRUD_PARAMS);
    await cb.get(c);

    expect(sets.meta.total).toBe(30);
    expect(sets.meta.limit).toBe(10);
    expect(sets.meta.page).toBe(2);
    expect(sets.meta.pages).toBe(3);
    expect(sets.meta.isFirstPage).toBe(false);
    expect(sets.meta.isLastPage).toBe(false);
    expect(sets.meta.nextPage).toBe(3);
  });

  it('marks first page', async () => {
    const { c, sets } = createMockContext({
      data: [],
      totalCount: 20,
      tableRows: { id: {} },
      queries: { _limit: ['10'], _page: ['1'] },
    });

    const cb = new CrudBuilder(DEFAULT_CRUD_PARAMS);
    await cb.get(c);

    expect(sets.meta.isFirstPage).toBe(true);
  });

  it('marks last page', async () => {
    const { c, sets } = createMockContext({
      data: [],
      totalCount: 20,
      tableRows: { id: {} },
      queries: { _limit: ['10'], _page: ['2'] },
    });

    const cb = new CrudBuilder(DEFAULT_CRUD_PARAMS);
    await cb.get(c);

    expect(sets.meta.isLastPage).toBe(true);
    expect(sets.meta.nextPage).toBeUndefined();
  });

  it('single page when no limit', async () => {
    const { c, sets } = createMockContext({
      data: [{ id: 1 }],
      totalCount: 1,
      tableRows: { id: {} },
      queries: {},
    });

    const cb = new CrudBuilder(DEFAULT_CRUD_PARAMS);
    await cb.get(c);

    expect(sets.meta.pages).toBe(1);
  });

  it('removes hidden fields from result', async () => {
    const data = [{ id: 1, name: 'a', secret: 'xxx' }];
    const { c, sets } = createMockContext({
      data,
      totalCount: 1,
      tableRows: { id: {}, name: {}, secret: {} },
      queries: {},
    });

    const cb = new CrudBuilder({ ...DEFAULT_CRUD_PARAMS, hiddenFields: ['secret'] });
    await cb.get(c);

    expect(sets.result[0].secret).toBeUndefined();
    expect(sets.result[0].name).toBe('a');
  });

  it('passes _lang to builder', async () => {
    const { c } = createMockContext({
      data: [],
      totalCount: 0,
      tableRows: { id: {} },
      queries: { _lang: ['de'] },
    });

    const cb = new CrudBuilder(DEFAULT_CRUD_PARAMS);
    await cb.get(c);

    expect(cb.lang).toBe('de');
  });

  it('sets relationsData', async () => {
    const relations = { comments: { table: 'comments' } as any };
    const { c, sets } = createMockContext({
      data: [],
      totalCount: 0,
      tableRows: {},
      queries: {},
    });

    const cb = new CrudBuilder({ ...DEFAULT_CRUD_PARAMS, relations });
    await cb.get(c);

    expect(sets.relationsData).toBe(relations);
  });
});

// ════════════════════════════════════════════════════
//  CRUD – getById
// ════════════════════════════════════════════════════

describe('CrudBuilder – getById', () => {
  it('returns single record', async () => {
    const record = { id: 1, name: 'first' };
    const { c, sets } = createMockContext({
      data: [record],
      tableRows: { id: {}, name: {} },
      params: { id: '1' },
    });

    const cb = new CrudBuilder(DEFAULT_CRUD_PARAMS);
    await cb.getById(c);

    expect(sets.result).toEqual(record);
  });

  it('throws INTEGER_REQUIRED for non-numeric id with integer type', async () => {
    const { c } = createMockContext({
      data: [],
      tableRows: { id: {}, name: {} },
      params: { id: 'abc' },
    });

    const cb = new CrudBuilder({
      ...DEFAULT_CRUD_PARAMS,
      dbTables: { id: { data_type: 'integer' } },
    });

    expect(cb.getById(c)).rejects.toThrow('INTEGER_REQUIRED');
  });

  it('removes hidden fields', async () => {
    const record = { id: 1, secret: 'xxx', name: 'a' };
    const { c, sets } = createMockContext({
      data: [record],
      tableRows: { id: {}, name: {}, secret: {} },
      params: { id: '1' },
    });

    const cb = new CrudBuilder({ ...DEFAULT_CRUD_PARAMS, hiddenFields: ['secret'] });
    await cb.getById(c);

    expect(sets.result.secret).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════
//  CRUD – add
// ════════════════════════════════════════════════════

describe('CrudBuilder – add', () => {
  it('inserts and returns new record', async () => {
    const inserted = { id: 1, name: 'new' };
    const { db: writeDb, qb: writeQb } = createMockDb([inserted]);

    const { c, sets } = createMockContext({
      dbWrite: writeDb,
      tableRows: { name: {} },
      body: { name: 'new' },
    });

    const cb = new CrudBuilder(DEFAULT_CRUD_PARAMS);
    await cb.add(c);

    expect(writeQb.insert).toHaveBeenCalled();
    expect(writeQb.returning).toHaveBeenCalledWith('*');
    expect(sets.result).toEqual(inserted);
  });

  it('removes readOnly fields before insert', async () => {
    const { db: writeDb, qb: writeQb } = createMockDb([{ id: 1 }]);

    const { c } = createMockContext({
      dbWrite: writeDb,
      tableRows: { name: {} },
      body: { id: 99, name: 'test', timeCreated: '2024-01-01' },
    });

    const cb = new CrudBuilder(DEFAULT_CRUD_PARAMS);
    await cb.add(c);

    const insertCall = writeQb.insert.mock.calls[0][0];
    expect(insertCall.id).toBeUndefined();
    expect(insertCall.timeCreated).toBeUndefined();
    expect(insertCall.name).toBe('test');
  });

  it('throws INTEGER_REQUIRED for bad integer data', async () => {
    const { c } = createMockContext({
      tableRows: { age: {} },
      body: { age: 'not-a-number' },
    });

    const cb = new CrudBuilder({
      ...DEFAULT_CRUD_PARAMS,
      dbTables: { age: { data_type: 'integer' } },
    });

    expect(cb.add(c)).rejects.toThrow('INTEGER_REQUIRED');
  });

  it('handles array-like body (object with numeric keys)', async () => {
    const { db: writeDb, qb: writeQb } = createMockDb([{ id: 1 }]);

    const { c } = createMockContext({
      dbWrite: writeDb,
      tableRows: { name: {} },
      body: { '0': { name: 'a' }, '1': { name: 'b' } },
    });

    const cb = new CrudBuilder(DEFAULT_CRUD_PARAMS);
    await cb.add(c);

    const insertCall = writeQb.insert.mock.calls[0][0];
    expect(Array.isArray(insertCall)).toBe(true);
  });
});

// ════════════════════════════════════════════════════
//  CRUD – update
// ════════════════════════════════════════════════════

describe('CrudBuilder – update', () => {
  it('updates record and returns it via getById', async () => {
    const updated = { id: 1, name: 'updated' };
    const { db: readDb } = createMockDb([updated]);
    const { db: writeDb, qb: writeQb } = createMockDb([]);

    const { c, sets } = createMockContext({
      db: readDb,
      dbWrite: writeDb,
      tableRows: { id: {}, name: {} },
      params: { id: '1' },
      body: { name: 'updated' },
    });

    const cb = new CrudBuilder(DEFAULT_CRUD_PARAMS);
    await cb.update(c);

    expect(writeQb.update).toHaveBeenCalled();
    expect(sets.result).toEqual(updated);
  });

  it('removes readOnly fields before update', async () => {
    const { db: readDb } = createMockDb([{ id: 1 }]);
    const { db: writeDb, qb: writeQb } = createMockDb([]);

    const { c } = createMockContext({
      db: readDb,
      dbWrite: writeDb,
      tableRows: { id: {}, name: {} },
      params: { id: '1' },
      body: { id: 99, name: 'up', timeCreated: '2024-01-01' },
    });

    const cb = new CrudBuilder(DEFAULT_CRUD_PARAMS);
    await cb.update(c);

    const updateCall = writeQb.update.mock.calls[0][0];
    expect(updateCall.id).toBeUndefined();
    expect(updateCall.timeCreated).toBeUndefined();
    expect(updateCall.name).toBe('up');
  });

  it('adds timeUpdated when column exists', async () => {
    const { db: readDb } = createMockDb([{ id: 1 }]);
    const { db: writeDb, qb: writeQb } = createMockDb([]);

    const { c } = createMockContext({
      db: readDb,
      dbWrite: writeDb,
      tableRows: { id: {}, name: {}, timeUpdated: {} },
      params: { id: '1' },
      body: { name: 'up' },
    });

    const cb = new CrudBuilder(DEFAULT_CRUD_PARAMS);
    await cb.update(c);

    const updateCall = writeQb.update.mock.calls[0][0];
    expect(updateCall.timeUpdated).toBeDefined();
  });

  it('adds isDeleted=false to where when column exists', async () => {
    const { db: readDb } = createMockDb([{ id: 1 }]);
    const { db: writeDb, qb: writeQb } = createMockDb([]);

    const { c } = createMockContext({
      db: readDb,
      dbWrite: writeDb,
      tableRows: { id: {}, name: {}, isDeleted: {} },
      params: { id: '1' },
      body: { name: 'up' },
    });

    const cb = new CrudBuilder(DEFAULT_CRUD_PARAMS);
    await cb.update(c);

    expect(writeQb.where).toHaveBeenCalledWith({ id: '1', isDeleted: false });
  });

  it('throws INTEGER_REQUIRED for non-numeric id with integer type', () => {
    const { c } = createMockContext({
      tableRows: { id: {} },
      params: { id: 'abc' },
      body: { name: 'up' },
    });

    const cb = new CrudBuilder({
      ...DEFAULT_CRUD_PARAMS,
      dbTables: { id: { data_type: 'integer' } },
    });

    expect(cb.update(c)).rejects.toThrow('INTEGER_REQUIRED');
  });

  it('skips db update when no editable fields remain', async () => {
    const { db: readDb } = createMockDb([{ id: 1 }]);
    const { db: writeDb, qb: writeQb } = createMockDb([]);

    const { c } = createMockContext({
      db: readDb,
      dbWrite: writeDb,
      tableRows: { id: {} },
      params: { id: '1' },
      body: { id: 5, timeCreated: 'x' },
    });

    const cb = new CrudBuilder(DEFAULT_CRUD_PARAMS);
    await cb.update(c);

    expect(writeQb.update).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════
//  CRUD – delete
// ════════════════════════════════════════════════════

describe('CrudBuilder – delete', () => {
  it('soft-deletes when isDeleted column exists', async () => {
    const { db: writeDb, qb: writeQb } = createMockDb([]);

    const { c, sets } = createMockContext({
      dbWrite: writeDb,
      tableRows: { id: {}, isDeleted: {} },
      params: { id: '1' },
    });

    const cb = new CrudBuilder(DEFAULT_CRUD_PARAMS);
    await cb.delete(c);

    expect(writeQb.update).toHaveBeenCalledWith({ isDeleted: true });
    expect(sets.result).toEqual({ ok: true });
  });

  it('hard-deletes when no isDeleted column', async () => {
    const { db: writeDb, qb: writeQb } = createMockDb([]);

    const { c, sets } = createMockContext({
      dbWrite: writeDb,
      tableRows: { id: {} },
      params: { id: '1' },
    });

    const cb = new CrudBuilder(DEFAULT_CRUD_PARAMS);
    await cb.delete(c);

    expect(writeQb.delete).toHaveBeenCalled();
    expect(sets.result).toEqual({ ok: true });
  });

  it('sets countDeleted in meta', async () => {
    const { db: writeDb } = createMockDb([]);

    const { c, sets } = createMockContext({
      dbWrite: writeDb,
      tableRows: { id: {} },
      params: { id: '1' },
    });

    const cb = new CrudBuilder(DEFAULT_CRUD_PARAMS);
    await cb.delete(c);

    expect(sets.meta).toBeDefined();
    expect(sets.meta.countDeleted).toBeDefined();
  });

  it('throws INTEGER_REQUIRED for non-numeric id with integer type', () => {
    const { c } = createMockContext({
      tableRows: { id: {} },
      params: { id: 'abc' },
    });

    const cb = new CrudBuilder({
      ...DEFAULT_CRUD_PARAMS,
      dbTables: { id: { data_type: 'integer' } },
    });

    expect(cb.delete(c)).rejects.toThrow('INTEGER_REQUIRED');
  });

  it('adds isDeleted=false to where on soft delete', async () => {
    const { db: writeDb, qb: writeQb } = createMockDb([]);

    const { c } = createMockContext({
      dbWrite: writeDb,
      tableRows: { id: {}, isDeleted: {} },
      params: { id: '5' },
    });

    const cb = new CrudBuilder(DEFAULT_CRUD_PARAMS);
    await cb.delete(c);

    expect(writeQb.where).toHaveBeenCalledWith({ id: '5', isDeleted: false });
  });
});

// ════════════════════════════════════════════════════
//  getRequestResult – cursor pagination (_after)
// ════════════════════════════════════════════════════

describe('CrudBuilder – cursor pagination', () => {
  it('uses _after for cursor-based pagination', async () => {
    const data = [{ id: 5, name: 'e' }];
    const { c, sets, readQb } = createMockContext({
      data,
      totalCount: 10,
      tableRows: { id: {}, name: {} },
      queries: {
        _after: ['3'],
        _limit: ['5'],
        _sort: ['id'],
      },
    });

    const cb = new CrudBuilder({
      ...DEFAULT_CRUD_PARAMS,
      dbTables: { id: { data_type: 'integer' } },
    });
    await cb.get(c);

    expect(sets.meta.after).toBe('3');
    expect(sets.meta.isFirstPage).toBe(false);
  });
});

// ════════════════════════════════════════════════════
//  getTableRows
// ════════════════════════════════════════════════════

describe('CrudBuilder – getTableRows', () => {
  it('reads from c.env.dbTables by schema.table', () => {
    const cb = new CrudBuilder({ table: 'users', schema: 'app' });
    const c: any = {
      env: {
        dbTables: { 'app.users': { id: { data_type: 'integer' }, name: { data_type: 'string' } } },
      },
    };

    const rows = cb.getTableRows(c);
    expect(rows).toEqual({ id: { data_type: 'integer' }, name: { data_type: 'string' } });
  });

  it('returns empty object for unknown table', () => {
    const cb = new CrudBuilder({ table: 'unknown' });
    const c: any = { env: { dbTables: {} } };

    expect(cb.getTableRows(c)).toEqual({});
  });
});
