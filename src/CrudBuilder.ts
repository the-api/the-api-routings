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
