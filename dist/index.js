// src/CrudBuilder.ts
import flattening from "flattening";
var getPositiveIntFromEnv = (name) => {
  const value = process.env[name];
  if (!value)
    return;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1)
    return;
  return parsed;
};
var getQueryLimit = ({
  _limit,
  _unlimited
}) => {
  const canGetUnlimited = process.env.CAN_GET_UNLIMITED === "true";
  const isUnlimited = canGetUnlimited && (_unlimited === "true" || _unlimited === true);
  if (isUnlimited)
    return;
  const defaultLimit = getPositiveIntFromEnv("LIMIT_DEFAULT");
  const maxLimit = getPositiveIntFromEnv("LIMIT_MAX");
  let limit = _limit != null && _limit !== "" ? +_limit : defaultLimit;
  if (!limit || Number.isNaN(limit))
    return;
  if (maxLimit && limit > maxLimit)
    return maxLimit;
  return limit;
};
var toPositiveInt = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < fallback)
    return fallback;
  return Math.floor(n);
};
var toActionFlags = (input) => (input || []).reduce((acc, cur) => ({ ...acc, [cur]: true }), {});
var isNumericDbType = (dataType) => {
  const dt = String(dataType || "").toLowerCase();
  if ([
    "integer",
    "int",
    "int2",
    "int4",
    "int8",
    "smallint",
    "bigint",
    "numeric",
    "decimal",
    "real",
    "double precision",
    "float",
    "serial",
    "bigserial",
    "smallserial"
  ].includes(dt))
    return true;
  return /^(numeric|decimal|float)\b/.test(dt);
};
var isIntegerDbType = (dataType) => {
  const dt = String(dataType || "").toLowerCase();
  return [
    "integer",
    "int",
    "int2",
    "int4",
    "int8",
    "smallint",
    "bigint",
    "serial",
    "bigserial",
    "smallserial"
  ].includes(dt);
};
var isDateDbType = (dataType) => {
  const dt = String(dataType || "").toLowerCase();
  return dt.includes("date") || dt.includes("timestamp") || dt.includes("time");
};

class CrudBuilder {
  table;
  schema;
  aliases;
  join;
  joinOnDemand;
  leftJoinConfig;
  leftJoinDistinct;
  defaultLang;
  translate;
  searchFields;
  requiredFields;
  defaultWhere;
  defaultWhereRaw;
  defaultSort;
  sortRaw;
  fieldsRaw;
  tokenRequired;
  ownerRequired;
  rootRequired;
  access;
  accessByStatuses;
  deletedReplacements;
  includeDeleted;
  hiddenFields;
  readOnlyFields;
  showFieldsByPermission;
  ownerPermissions;
  dbTables;
  cache;
  userIdFieldName;
  additionalFields;
  apiClientMethodNames;
  relations;
  state;
  constructor(options) {
    this.table = options.table;
    this.schema = options.schema || "public";
    this.aliases = options.aliases || {};
    this.join = options.join || [];
    this.joinOnDemand = options.joinOnDemand || [];
    this.leftJoinConfig = options.leftJoin || [];
    this.leftJoinDistinct = !!options.leftJoinDistinct;
    this.defaultLang = options.lang || "en";
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
    this.includeDeleted = typeof options.includeDeleted === "boolean" ? options.includeDeleted : !!options.deletedReplacements;
    this.hiddenFields = options.hiddenFields || [];
    this.readOnlyFields = options.readOnlyFields || ["id", "timeCreated", "timeUpdated", "timeDeleted", "isDeleted"];
    this.showFieldsByPermission = options.permissions?.fields?.viewable || {};
    this.ownerPermissions = options.permissions?.owner?.reduce((acc, cur) => ({ ...acc, [cur]: true }), {}) || {};
    this.dbTables = options.dbTables || {};
    this.cache = options.cache;
    this.userIdFieldName = options.userIdFieldName || "userId";
    this.additionalFields = options.additionalFields || {};
    this.apiClientMethodNames = options.apiClientMethodNames || {};
    this.relations = options.relations;
  }
  initState(c) {
    const db = this.getDbFromContext(c);
    const dbTables = this.getDbTablesFromContext(c);
    this.state = {
      res: this.getDbWithSchema(db),
      rows: dbTables[`${this.schema}.${this.table}`] || {},
      user: c.var?.user,
      roles: this.getRolesFromContext(c),
      lang: this.defaultLang,
      coalesceWhere: {},
      coalesceWhereReplacements: {},
      langJoin: {}
    };
  }
  getDbFromContext(c) {
    const db = c.var?.db || c.env?.db;
    if (!db)
      throw new Error("DB_CONNECTION_REQUIRED");
    return db;
  }
  getDbWriteFromContext(c) {
    const dbWrite = c.var?.dbWrite || c.env?.dbWrite;
    if (!dbWrite)
      throw new Error("DB_WRITE_CONNECTION_REQUIRED");
    return dbWrite;
  }
  getDbTablesFromContext(c) {
    return c.var?.dbTables || c.env?.dbTables || {};
  }
  getRolesFromContext(c) {
    return c.var?.roles || c.env?.roles;
  }
  getDbWithSchema(db) {
    const qb = db(this.table);
    if (this.schema)
      qb.withSchema(this.schema);
    return qb;
  }
  getNormalizedQuery(c) {
    const query = c.var?.query;
    if (query && typeof query === "object" && !Array.isArray(query)) {
      return { ...query };
    }
    return {};
  }
  getSingleValueQuery(c) {
    return Object.entries(this.getNormalizedQuery(c)).reduce((acc, [key, value]) => {
      acc[key] = Array.isArray(value) ? String(value[0] ?? "") : String(value);
      return acc;
    }, {});
  }
  getQueryArrays(c, q) {
    if (q)
      return q;
    return Object.entries(this.getNormalizedQuery(c)).reduce((acc, [key, value]) => {
      acc[key] = Array.isArray(value) ? value.map(String) : [String(value)];
      return acc;
    }, {});
  }
  async getRequestBody(c) {
    const body = c.var?.body;
    if (Array.isArray(body))
      return body;
    if (body && typeof body === "object")
      return body;
    return {};
  }
  getKnownColumnNames() {
    const names = new Set;
    for (const col of Object.keys(this.state.rows))
      names.add(col);
    for (const col of Object.keys(this.aliases))
      names.add(col);
    for (const j of this.join)
      names.add(j.alias || j.table);
    for (const j of this.joinOnDemand)
      names.add(j.alias || j.table);
    return names;
  }
  isValidSortField(field) {
    const name = field.replace(/^-/, "");
    if (/^random\(\)$/i.test(name))
      return true;
    return this.getKnownColumnNames().has(name);
  }
  isValidWhereKey(key) {
    const cleanKey = key.replace(/^(_null_|_not_null_|_in_|_not_in_|_from_|_to_)/, "").replace(/[!~]$/, "");
    if (this.state.rows[cleanKey])
      return true;
    if (cleanKey.includes(".")) {
      const col = cleanKey.split(".").pop() || "";
      return !!this.state.rows[col];
    }
    if (this.state.coalesceWhere[cleanKey])
      return true;
    if (this.state.langJoin[cleanKey])
      return true;
    return false;
  }
  sort(sortParam, db) {
    if (this.sortRaw)
      this.state.res.orderByRaw(this.sortRaw);
    const _sort = sortParam || this.defaultSort;
    if (!_sort)
      return;
    for (const item of _sort.split(",")) {
      if (/^random\(\)$/i.test(item)) {
        this.state.res.orderBy(db.raw("RANDOM()"));
        continue;
      }
      if (!this.isValidSortField(item))
        continue;
      const match = item.match(/^(-)?(.+)$/);
      if (!match)
        continue;
      this.state.res.orderBy(match[2], match[1] ? "desc" : "asc", "last");
    }
  }
  pagination({
    _page,
    _skip = 0,
    _limit,
    _unlimited
  }) {
    const limit = getQueryLimit({ _limit, _unlimited });
    if (!limit)
      return;
    this.state.res.limit(limit);
    const page = toPositiveInt(_page, 1);
    const skip = toPositiveInt(_skip, 0);
    const offset = (page - 1) * limit + skip;
    this.state.res.offset(offset);
  }
  where(whereObj, db, options) {
    if (!whereObj)
      return;
    const { trusted = false } = options || {};
    for (const [key, value] of Object.entries(whereObj)) {
      if (!trusted && !this.isValidWhereKey(key))
        continue;
      if (this.state.langJoin[key]) {
        this.state.res.whereRaw(`${this.state.langJoin[key]} = :_value`, { _value: value, lang: this.state.lang });
      } else if (this.state.coalesceWhere[key] || this.state.coalesceWhere[key.replace(/!$/, "")]) {
        const key2 = key.replace(/!$/, "");
        const isNot = key.endsWith("!") ? "NOT" : "";
        const coalesceWhere = this.state.coalesceWhere[key2];
        const replacements = this.state.coalesceWhereReplacements;
        if (Array.isArray(value)) {
          for (const _value of value) {
            this.state.res.orWhere(function() {
              this.whereRaw(`${isNot} ${coalesceWhere} = :_value`, { ...replacements, _value });
            });
          }
        } else {
          this.state.res.whereRaw(`${isNot} ${coalesceWhere} = :_value`, { ...replacements, _value: value });
        }
      } else if (key.endsWith("~")) {
        this.state.res.where(key.replace(/~$/, ""), "ilike", value);
      } else if (key.endsWith("!")) {
        const col = key.replace(/!$/, "");
        if (Array.isArray(value)) {
          this.state.res.whereNotIn(col, value);
        } else {
          this.state.res.whereNot(col, value);
        }
      } else if (key.startsWith("_null_")) {
        const m = key.match(/^_null_(.+)$/);
        if (m)
          this.state.res.whereNull(m[1]);
      } else if (key.startsWith("_in_")) {
        try {
          const m = key.match(/^_in_(.+)$/);
          if (m)
            this.state.res.whereIn(m[1], JSON.parse(value));
        } catch {
          throw new Error("ERROR_QUERY_VALUE");
        }
      } else if (key.startsWith("_not_in_")) {
        try {
          const m = key.match(/^_not_in_(.+)$/);
          if (m)
            this.state.res.whereNotIn(m[1], JSON.parse(value));
        } catch {
          throw new Error("ERROR_QUERY_VALUE");
        }
      } else if (key.startsWith("_not_null_")) {
        const m = key.match(/^_not_null_(.+)$/);
        if (m)
          this.state.res.whereNotNull(m[1]);
      } else if (/_(?:from|to)_/.test(key)) {
        if (value !== "") {
          const m = key.match(/_(from|to)_(.+)$/);
          if (!m)
            continue;
          const sign = m[1] === "from" ? ">=" : "<=";
          const coalesceWhere = this.state.coalesceWhere[m[2]];
          if (coalesceWhere) {
            this.state.res.whereRaw(`${coalesceWhere} ${sign} ?`, [value]);
          } else {
            this.state.res.where(m[2], sign, value);
          }
        }
      } else if (Array.isArray(value)) {
        this.state.res.whereIn(key, value);
      } else if (value === null) {
        this.state.res.whereNull(key);
      } else if (this.leftJoinConfig.length && !key.includes(".")) {
        this.state.res.where({ [`${this.table}.${key}`]: value });
      } else {
        this.state.res.where(key, value);
      }
    }
  }
  fields({
    c,
    _fields,
    _join,
    db,
    _sort
  }) {
    let f = _fields?.split(",").filter((item) => item !== "-relations");
    if (this.leftJoinConfig.length) {
      for (const item of this.leftJoinConfig)
        this.state.res.leftJoin(...item);
      if (this.leftJoinDistinct) {
        const sortArr = (_sort || this.defaultSort || "").replace(/(^|,)-/g, ",").split(",").filter(Boolean);
        const selectedFields = f;
        const distinctColumns = selectedFields ? sortArr.filter((item) => !selectedFields.includes(item)).map((item) => `${this.table}.${item}`) : [];
        this.state.res.distinct(distinctColumns);
      }
    }
    let join = [...this.join];
    if (_join) {
      const joinNames = Array.isArray(_join) ? _join : _join.split(",");
      for (const joinName of joinNames) {
        const toJoin = this.joinOnDemand.filter(({ table, alias }) => joinName === alias || joinName === table);
        if (toJoin.length) {
          join = join.concat(toJoin.filter((j) => !join.find(({ table, alias }) => table === j.table && alias === j.alias)));
        }
      }
    }
    if (f) {
      const selectedFields = f;
      join = join.filter(({ table, alias }) => selectedFields.includes(table) || (alias ? selectedFields.includes(alias) : false));
      f = selectedFields.filter((name) => !join.find(({ table, alias }) => name === table || name === alias));
    }
    let joinCoalesce = (f || Object.keys(this.state.rows)).map((l) => `${this.table}.${l}`);
    if (this.includeDeleted && this.deletedReplacements && this.state.rows.isDeleted) {
      joinCoalesce = joinCoalesce.map((item) => {
        const [tableName, fieldName] = item.split(".");
        const replaceWith = this.deletedReplacements?.[fieldName];
        if (typeof replaceWith === "undefined")
          return item;
        return db.raw(`CASE WHEN "${this.table}"."isDeleted" THEN :replaceWith ELSE "${tableName}"."${fieldName}" END AS ${fieldName}`, { replaceWith });
      });
    }
    for (const field of Object.keys(this.aliases)) {
      joinCoalesce.push(`${this.table}.${field} AS ${this.aliases[field]}`);
    }
    if (this.state.lang && this.state.lang !== "en") {
      for (const field of this.translate) {
        this.state.langJoin[field] = `COALESCE( (
          select text from dict where lang=:lang and "textKey" = any(
            select "textKey" from dict where lang='en' and text = "${this.table}"."${field}"
          ) limit 1), name )`;
        joinCoalesce.push(db.raw(this.state.langJoin[field] + `AS "${field}"`, { lang: this.state.lang }));
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
      leftJoin
    } of join) {
      if (!table && field) {
        joinCoalesce.push(db.raw(`${field} AS ${alias || field}`));
        continue;
      }
      const orderByStr = orderBy ? `ORDER BY ${orderBy}` : "";
      const limitStr = limit ? `LIMIT ${limit}` : "";
      const lang = table === "dict" && this.state.lang?.match(/^\w{2}$/) ? `AND lang='${this.state.lang}'` : "";
      const ff = joinFields?.map((item) => typeof item === "string" ? `'${item}', "${as || table}"."${item}"` : `'${Object.keys(item)[0]}', ${Object.values(item)[0]}`);
      const f2 = ff ? `json_build_object(${ff.join(", ")})` : `"${as || table}".*`;
      const f3 = field || `jsonb_agg(${f2})`;
      const wb = {};
      const flatQuery2 = this.getSingleValueQuery(c);
      if (whereBindings) {
        const envAll = {
          ...c.env,
          ...c.var
        };
        ["db", "dbWrite", "dbTables", "error", "getErrorByMessage", "log"].forEach((key) => delete envAll[key]);
        const dd = flattening({
          env: envAll,
          params: c.req.param(),
          query: flatQuery2
        });
        for (const [k, v] of Object.entries(whereBindings)) {
          wb[k] = dd[v] ?? null;
        }
      }
      const leftJoinStr = !leftJoin ? "" : typeof leftJoin === "string" ? `LEFT JOIN ${leftJoin}` : `LEFT JOIN "${leftJoin[0]}" ON ${leftJoin[1]} = ${leftJoin[2]}`;
      const index = typeof byIndex === "number" ? `[${byIndex}]` : "";
      const schemaStr = !schema ? "" : `"${schema}".`;
      const dValue = defaultValue ? `'${defaultValue}'` : "NULL";
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
        ...wb
      };
      let sqlToJoin = `${coalesceWhere} AS "${alias || table}"`;
      if (this.includeDeleted && this.deletedReplacements && this.state.rows.isDeleted) {
        const replaceWith = this.deletedReplacements[table] ?? (as ? this.deletedReplacements[as] : undefined) ?? (alias ? this.deletedReplacements[alias] : undefined);
        if (typeof replaceWith !== "undefined") {
          sqlToJoin = `CASE WHEN "${this.table}"."isDeleted" THEN ${replaceWith} ELSE ${coalesceWhere} END AS "${alias || table}"`;
        }
      }
      joinCoalesce.push(db.raw(sqlToJoin, wb));
    }
    const flatQuery = this.getSingleValueQuery(c);
    if (flatQuery._search && this.searchFields.length) {
      const searchColumnsStr = this.searchFields.map((name) => {
        const searchName = this.state.langJoin[name] || `"${name}"`;
        return `COALESCE(${searchName} <-> :_search, 1)`;
      }).join(" + ");
      joinCoalesce.push(db.raw(`(${searchColumnsStr})/${this.searchFields.length} as _search_distance`, { ...flatQuery, lang: this.state.lang }));
      if (!_sort)
        this.state.res.orderBy("_search_distance", "ASC");
    }
    this.state.res.column(joinCoalesce.concat(this.fieldsRaw || []));
  }
  checkDeleted() {
    if (this.includeDeleted || !this.state.rows.isDeleted)
      return;
    this.state.res.where({ [`${this.table}.isDeleted`]: false });
  }
  getJoinFields() {
    return this.join.reduce((acc, { alias, table, field }) => {
      let type = !field ? "ARRAY" : field.match(/::bool$/) ? "boolean" : field.match(/::int$/) ? "integer" : "string";
      acc[alias || table] = type;
      return acc;
    }, {});
  }
  getHiddenFields() {
    if (!this.state.roles) {
      return { regular: this.hiddenFields, owner: this.hiddenFields };
    }
    const permissions = this.state.roles.getPermissions(this.state.user?.roles);
    let toShow = [];
    let ownerToShow = [];
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
      owner: this.hiddenFields.filter((item) => !ownerToShow.includes(item))
    };
  }
  deleteHiddenFieldsFromResult(result, hiddenFields) {
    if (!result || !hiddenFields)
      return;
    const isOwner = this.state.user?.id && result[this.userIdFieldName] === this.state.user.id;
    const fields = hiddenFields[isOwner ? "owner" : "regular"];
    for (const key of fields)
      delete result[key];
  }
  filterDataByTableColumns(data, rows) {
    const filtered = {};
    for (const key of Object.keys(data)) {
      if (rows[key] && !this.readOnlyFields.includes(key)) {
        filtered[key] = this.normalizeWriteValue(data[key], rows[key]);
      }
    }
    return filtered;
  }
  normalizeWriteValue(value, column) {
    if (value === "" && column.is_nullable === "YES" && (isNumericDbType(column.data_type) || isDateDbType(column.data_type))) {
      return null;
    }
    return value;
  }
  updateData(c, data) {
    for (const [key, errorCode] of Object.entries(this.requiredFields)) {
      if (!data[key])
        throw new Error(errorCode);
    }
    const rows = this.state.rows;
    const filtered = this.filterDataByTableColumns(data, rows);
    if (rows[this.userIdFieldName] && this.state.user) {
      filtered[this.userIdFieldName] = this.state.user.id;
    }
    return filtered;
  }
  updateIncomingData(c, data) {
    return Array.isArray(data) ? data.map((item) => this.updateData(c, item)) : this.updateData(c, data);
  }
  optionsGet() {
    const fields = {};
    const fieldsSearchLike = {};
    const fieldsFromTo = {};
    const fieldsNull = {};
    for (const [key, data] of Object.entries(this.dbTables)) {
      if (!data)
        continue;
      fields[key] = data.data_type;
      if (data.data_type === "string")
        fieldsSearchLike[`${key}~`] = data.data_type;
      if (data.is_nullable === "YES") {
        fieldsNull[`_null_${key}`] = "string";
        fieldsNull[`_not_null_${key}`] = "string";
      }
      if (data.data_type !== "boolean" && data.data_type !== "file") {
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
        _fields: { type: "string", example: "id,name" },
        _sort: { type: "string", example: "-timeCreated,name,random()" },
        _join: { type: "string", example: "table1,alias1" },
        _limit: "integer",
        _page: "integer",
        _skip: "integer",
        _lang: "string",
        ...this.searchFields.length && { _search: "string" }
      },
      apiClientMethodNames: this.apiClientMethodNames
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
      apiClientMethodNames: this.apiClientMethodNames
    };
  }
  optionsAdd() {
    const schema = Object.entries(this.dbTables).reduce((acc, [key, data]) => this.readOnlyFields.includes(key) ? acc : { ...acc, [key]: data }, this.additionalFields?.add || {});
    return {
      tokenRequired: this.tokenRequired.add || this.access.create || this.accessByStatuses.create,
      ownerRequired: this.ownerRequired.add,
      rootRequired: this.rootRequired.add,
      readOnlyFields: this.readOnlyFields,
      requiredFields: Object.keys(this.requiredFields),
      accessByStatuses: this.accessByStatuses.create,
      apiClientMethodNames: this.apiClientMethodNames,
      schema
    };
  }
  optionsUpdate() {
    const schema = Object.entries(this.dbTables).reduce((acc, [key, data]) => this.readOnlyFields.includes(key) ? acc : { ...acc, [key]: data }, this.additionalFields?.update || {});
    return {
      tokenRequired: this.tokenRequired.update || this.access.update || this.accessByStatuses.update,
      ownerRequired: this.ownerRequired.update,
      rootRequired: this.rootRequired.update,
      readOnlyFields: this.readOnlyFields,
      accessByStatuses: this.accessByStatuses.update,
      additionalFields: this.additionalFields.update,
      apiClientMethodNames: this.apiClientMethodNames,
      schema
    };
  }
  optionsDelete() {
    return {
      tokenRequired: this.tokenRequired.delete || this.access.delete || this.accessByStatuses.delete,
      ownerRequired: this.ownerRequired.delete,
      rootRequired: this.rootRequired.delete,
      accessByStatuses: this.accessByStatuses.delete,
      apiClientMethodNames: this.apiClientMethodNames
    };
  }
  async get(c) {
    const { result, meta } = await this.getRequestResult(c);
    c.set("meta", meta);
    c.set("result", result);
    c.set("relationsData", this.relations);
  }
  async getRequestResult(c, q) {
    this.initState(c);
    const db = this.getDbFromContext(c);
    const queries = this.getQueryArrays(c, q);
    const queriesFlat = {};
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
    if (_lang)
      this.state.lang = _lang;
    this.fields({ c, _fields, _join, db, _sort });
    this.where(this.defaultWhere, db, { trusted: true });
    this.where(where, db);
    if (this.defaultWhereRaw) {
      const whereStr = this.defaultWhereRaw;
      this.state.res.andWhere(function() {
        this.whereRaw(whereStr);
      });
    }
    if (_search && this.searchFields.length) {
      const whereStr = this.searchFields.map((name) => {
        const searchName = this.state.langJoin[name] || `"${name}"`;
        return `${searchName} % :_search`;
      }).join(" OR ");
      const lang = this.state.lang;
      this.state.res.andWhere(function() {
        this.whereRaw(whereStr, { _search, lang });
      });
    }
    this.checkDeleted();
    const total = +(await db.from({ w: this.state.res }).count("*"))[0].count;
    this.sort(_sort, db);
    const sortFields = (_sort || this.defaultSort || "").split(",").filter(Boolean);
    const firstSortField = sortFields[0];
    const cursorColumnName = firstSortField?.replace(/^-/, "");
    const limit = getQueryLimit({
      _limit,
      _unlimited
    });
    if (_after && limit && firstSortField && cursorColumnName && this.state.rows[cursorColumnName]) {
      const direction = firstSortField.startsWith("-") ? "<" : ">";
      this.state.res.where(cursorColumnName, direction, _after);
      this.state.res.limit(limit);
    } else {
      this.pagination({
        _page,
        _skip,
        _limit: limit,
        _unlimited
      });
    }
    const result = await this.state.res;
    const nextAfterData = cursorColumnName ? result?.at(-1)?.[cursorColumnName] : undefined;
    const addAfterMs = firstSortField?.startsWith("-") ? "000" : "999";
    const nextAfter = nextAfterData instanceof Date ? new Date(nextAfterData).toISOString().replace("Z", `${addAfterMs}Z`) : nextAfterData;
    let meta = { total };
    if (_after) {
      meta = {
        ...meta,
        after: _after,
        nextAfter: nextAfter ? encodeURIComponent(String(nextAfter)) : undefined,
        isFirstPage: false,
        isLastPage: !result.length || (limit ? result.length < limit : false)
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
        isLastPage: page >= pages
      };
    }
    const hiddenFields = this.getHiddenFields();
    for (const row of result) {
      this.deleteHiddenFieldsFromResult(row, hiddenFields);
    }
    return { result, meta };
  }
  async getById(c) {
    this.initState(c);
    const db = this.getDbFromContext(c);
    const { id } = c.req.param();
    const { _fields, _lang, _join, ...whereWithParams } = this.getSingleValueQuery(c);
    const where = {};
    for (const [key, val] of Object.entries(whereWithParams)) {
      if (key.startsWith("_"))
        continue;
      const isInt = this.dbTables?.[key]?.data_type === "integer";
      const hasNaN = [].concat(val).find((item) => Number.isNaN(+item));
      if (isInt && hasNaN)
        throw new Error("INTEGER_REQUIRED");
      if (this.state.rows[key]) {
        where[key] = val;
      }
    }
    if (_lang)
      this.state.lang = _lang;
    if (this.dbTables?.id?.data_type === "integer" && Number.isNaN(+id)) {
      throw new Error("INTEGER_REQUIRED");
    }
    this.where({ ...where, [`${this.table}.id`]: id }, db, { trusted: true });
    if (this.defaultWhereRaw) {
      const whereStr = this.defaultWhereRaw;
      this.state.res.andWhere(function() {
        this.whereRaw(whereStr);
      });
    }
    this.checkDeleted();
    this.fields({ c, _fields, _join, db });
    const result = await this.state.res.first();
    this.deleteHiddenFieldsFromResult(result, this.getHiddenFields());
    c.set("result", result);
    c.set("relationsData", this.relations);
  }
  async add(c) {
    this.initState(c);
    const body = await this.getRequestBody(c);
    const data = this.updateIncomingData(c, body);
    const validatedData = Array.isArray(data) ? data.map((item) => this.validateIntegerFields(item)) : this.validateIntegerFields(data);
    const result = await this.getDbWithSchema(this.getDbWriteFromContext(c)).insert(validatedData).returning("*");
    c.set("result", result[0]);
    c.set("relationsData", this.relations);
  }
  validateIntegerFields(data) {
    const rows = this.state?.rows || this.dbTables;
    for (const key of Object.keys(data)) {
      const isInt = isIntegerDbType(rows[key]?.data_type);
      const hasNaN = [].concat(data[key]).find((item) => item !== null && typeof item !== "undefined" && item !== "" && Number.isNaN(+item));
      if (isInt && hasNaN)
        throw new Error("INTEGER_REQUIRED");
      data[key] = data[key] ?? null;
    }
    return data;
  }
  async update(c) {
    this.initState(c);
    const db = this.getDbFromContext(c);
    const params = c.req.param();
    const whereClause = { ...params };
    if (this.dbTables?.id?.data_type === "integer" && Number.isNaN(+String(whereClause.id))) {
      throw new Error("INTEGER_REQUIRED");
    }
    const rows = this.state.rows;
    if (rows.isDeleted)
      whereClause.isDeleted = false;
    const rawData = await this.getRequestBody(c);
    const data = this.validateIntegerFields(this.filterDataByTableColumns(rawData, rows));
    if (Object.keys(data).length) {
      if (rows.timeUpdated)
        data.timeUpdated = db.fn.now();
      await this.getDbWithSchema(this.getDbWriteFromContext(c)).update(data).where(whereClause);
    }
    await this.getById(c);
  }
  async delete(c) {
    this.initState(c);
    const whereClause = { ...c.req.param() };
    if (this.dbTables?.id?.data_type === "integer" && Number.isNaN(+String(whereClause.id))) {
      throw new Error("INTEGER_REQUIRED");
    }
    const rows = this.state.rows;
    if (rows.isDeleted)
      whereClause.isDeleted = false;
    const t = this.getDbWithSchema(this.getDbWriteFromContext(c)).where(whereClause);
    const result = rows.isDeleted ? await t.update({ isDeleted: true }) : await t.delete();
    c.set("result", { ok: true });
    c.set("meta", { countDeleted: result });
  }
}
// src/Routings.ts
import { createFactory } from "hono/factory";

// src/crudConfig.ts
var DEFAULT_READONLY_FIELDS = [
  "id",
  "timeCreated",
  "timeUpdated",
  "timeDeleted",
  "isDeleted"
];
var unique = (values = []) => Array.from(new Set(values));
var hasOwn = (obj, key) => !!obj && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, key);
var toArray = (values) => Array.isArray(values) ? values.filter((item) => typeof item === "string") : [];
var toMap = (values) => {
  if (!values || typeof values !== "object" || Array.isArray(values))
    return {};
  return Object.entries(values).reduce((acc, [key, raw]) => {
    const arr = toArray(raw);
    if (arr.length)
      acc[key] = arr;
    return acc;
  }, {});
};
var buildPermissions = (permissions, viewable, editable) => {
  const next = { ...permissions || {} };
  const fields = {};
  if (Object.keys(viewable).length)
    fields.viewable = viewable;
  if (Object.keys(editable).length)
    fields.editable = editable;
  if (Object.keys(fields).length)
    next.fields = fields;
  else
    delete next.fields;
  return Object.keys(next).length ? next : undefined;
};
var normalizeCrudConfig = (params) => {
  const fieldRules = params.fieldRules || {};
  const hasFieldRuleHidden = hasOwn(fieldRules, "hidden");
  const hasFieldRuleReadOnly = hasOwn(fieldRules, "readOnly");
  const hidden = hasFieldRuleHidden ? toArray(fieldRules.hidden) : [];
  const readOnly = hasFieldRuleReadOnly ? toArray(fieldRules.readOnly) : undefined;
  const visibleFor = toMap(fieldRules.visibleFor);
  const editableFor = toMap(fieldRules.editableFor);
  const next = { ...params };
  if (hasFieldRuleHidden)
    next.hiddenFields = hidden;
  else
    delete next.hiddenFields;
  if (Array.isArray(readOnly)) {
    next.readOnlyFields = unique([...readOnly, ...hidden]);
  } else if (hidden.length) {
    next.readOnlyFields = unique([...DEFAULT_READONLY_FIELDS, ...hidden]);
  } else {
    delete next.readOnlyFields;
  }
  next.permissions = buildPermissions(params.permissions, visibleFor, editableFor);
  return next;
};

// src/Validatior.ts
var DEFAULT_READONLY_FIELDS2 = [
  "id",
  "timeCreated",
  "timeUpdated",
  "timeDeleted",
  "isDeleted"
];
var DEFAULT_VALIDATION_ERROR = {
  code: 22,
  status: 400,
  description: "Validation error"
};
var toPlainObject = (input) => input && typeof input === "object" && !Array.isArray(input) ? input : null;
var isPlainObject = (input) => !!toPlainObject(input);
var isEmptyPlainObject = (input) => isPlainObject(input) && Object.keys(input).length === 0;
var isValidationResolver = (section) => typeof section === "function";
var withSectionPrefix = (section, issues) => issues.map((issue) => {
  if (issue.field.startsWith(`${section}.`) || issue.field === section) {
    return issue;
  }
  return { ...issue, field: `${section}.${issue.field}` };
});
var toExpected = (rule) => {
  const expected = {};
  if (typeof rule.type !== "undefined")
    expected.type = rule.type;
  if (rule.required === true)
    expected.required = true;
  if (typeof rule.min === "number")
    expected.min = rule.min;
  if (typeof rule.max === "number")
    expected.max = rule.max;
  if (Array.isArray(rule.enum))
    expected.enum = rule.enum;
  if (rule.items)
    expected.items = toExpected(rule.items);
  if (rule.properties) {
    expected.properties = Object.entries(rule.properties).reduce((acc, [key, value]) => {
      acc[key] = toExpected(value);
      return acc;
    }, {});
  }
  return expected;
};
var formatValueForMessage = (value) => {
  if (typeof value === "string")
    return `'${value}'`;
  if (value === null || typeof value === "undefined")
    return "null";
  if (value instanceof Date)
    return `'${value.toISOString()}'`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};
var makeIssue = (field, message, expected, value) => ({
  field,
  message,
  expected,
  value: value ?? null
});
var isMissingValue = (value) => typeof value === "undefined" || value === null || value === "";
var canBeNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { ok: true, num: value };
  }
  if (typeof value === "string" && value.trim() !== "") {
    const num = Number(value);
    if (Number.isFinite(num)) {
      return { ok: true, num };
    }
  }
  return { ok: false };
};
var canBeBoolean = (value) => {
  if (typeof value === "boolean")
    return true;
  if (typeof value !== "string")
    return false;
  return ["true", "false", "1", "0"].includes(value.toLowerCase());
};
var canBeDate = (value) => {
  if (value instanceof Date)
    return !Number.isNaN(value.getTime());
  if (typeof value === "string" && value.toUpperCase() === "NOW()")
    return true;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return !Number.isNaN(d.getTime());
  }
  return false;
};
var normalizeTypeList = (rule) => {
  if (Array.isArray(rule.type))
    return rule.type;
  if (typeof rule.type === "string")
    return [rule.type];
  if (Array.isArray(rule.enum))
    return ["enum"];
  if (rule.items)
    return ["array"];
  if (rule.properties)
    return ["object"];
  return [];
};
var validateByType = (value, rule, type, field) => {
  const expected = toExpected({ ...rule, type });
  if (type === "string") {
    if (typeof value === "string")
      return [];
    return [makeIssue(field, `Expected a string, but received ${formatValueForMessage(value)}`, expected, value)];
  }
  if (type === "number") {
    const parsed = canBeNumber(value);
    if (!parsed.ok) {
      if (typeof rule.min === "number" && typeof rule.max === "number") {
        return [makeIssue(field, `Expected a number between ${rule.min} and ${rule.max}, but received ${formatValueForMessage(value)}`, expected, value)];
      }
      return [makeIssue(field, `Expected a number, but received ${formatValueForMessage(value)}`, expected, value)];
    }
    const num = parsed.num;
    if (typeof rule.min === "number" && num < rule.min) {
      return [makeIssue(field, `Expected a number greater than or equal to ${rule.min}, but received ${formatValueForMessage(value)}`, expected, value)];
    }
    if (typeof rule.max === "number" && num > rule.max) {
      return [makeIssue(field, `Expected a number less than or equal to ${rule.max}, but received ${formatValueForMessage(value)}`, expected, value)];
    }
    return [];
  }
  if (type === "boolean") {
    if (canBeBoolean(value))
      return [];
    return [makeIssue(field, `Expected a boolean, but received ${formatValueForMessage(value)}`, expected, value)];
  }
  if (type === "date") {
    if (canBeDate(value))
      return [];
    return [makeIssue(field, `Expected a date, but received ${formatValueForMessage(value)}`, expected, value)];
  }
  if (type === "enum") {
    const enumValues = Array.isArray(rule.enum) ? rule.enum : [];
    const isAllowed = enumValues.some((item) => item === value || String(item) === String(value));
    if (isAllowed)
      return [];
    return [makeIssue(field, `Expected one of [${enumValues.join(", ")}], but received ${formatValueForMessage(value)}`, expected, value)];
  }
  if (type === "array") {
    if (!Array.isArray(value)) {
      return [makeIssue(field, `Expected an array, but received ${formatValueForMessage(value)}`, expected, value)];
    }
    if (!rule.items)
      return [];
    const errors = [];
    for (let i = 0;i < value.length; i += 1) {
      errors.push(...validateValue(value[i], rule.items, `${field}[${i}]`));
    }
    return errors;
  }
  if (type === "object") {
    if (!isPlainObject(value)) {
      return [makeIssue(field, `Expected an object, but received ${formatValueForMessage(value)}`, expected, value)];
    }
    if (!rule.properties)
      return [];
    const errors = [];
    for (const [key, nestedRule] of Object.entries(rule.properties)) {
      errors.push(...validateValue(value[key], nestedRule, `${field}.${key}`));
    }
    return errors;
  }
  return [];
};
var validateValue = (value, rule, field) => {
  if (isMissingValue(value)) {
    if (rule.required === true) {
      return [makeIssue(field, "This field is required but was not provided", toExpected(rule), value)];
    }
    return [];
  }
  let processed = value;
  if (typeof rule.preprocess === "function") {
    try {
      processed = rule.preprocess(value);
    } catch (err) {
      return [makeIssue(field, `Failed to preprocess value: ${err instanceof Error ? err.message : String(err)}`, toExpected(rule), value)];
    }
  }
  const types = normalizeTypeList(rule);
  if (!types.length)
    return [];
  if (types.length === 1) {
    return validateByType(processed, rule, types[0], field);
  }
  let bestErrors = [];
  for (const t of types) {
    const errs = validateByType(processed, rule, t, field);
    if (!errs.length)
      return [];
    if (!bestErrors.length)
      bestErrors = errs;
  }
  if (bestErrors.length)
    return bestErrors;
  return [makeIssue(field, `Expected one of types [${types.join(", ")}], but received ${formatValueForMessage(processed)}`, toExpected(rule), processed)];
};
var validateDataBySchema = (data, schema, section) => {
  const errors = [];
  for (const [field, rule] of Object.entries(schema)) {
    errors.push(...validateValue(data[field], rule, `${section}.${field}`));
  }
  return errors;
};
var parseJsonArray = (value) => {
  if (Array.isArray(value))
    return value;
  if (typeof value !== "string")
    return value;
  const parsed = JSON.parse(value);
  return Array.isArray(parsed) ? parsed : value;
};
var splitCsv = (value) => {
  if (Array.isArray(value))
    return value;
  if (typeof value !== "string")
    return value;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
};
var splitSortFields = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim().replace(/^-/, "")).filter(Boolean);
  }
  if (typeof value !== "string")
    return value;
  return value.split(",").map((item) => item.trim().replace(/^-/, "")).filter(Boolean);
};
var isNumericDbType2 = (dataType) => {
  const dt = dataType.toLowerCase();
  return [
    "integer",
    "int",
    "smallint",
    "bigint",
    "numeric",
    "decimal",
    "real",
    "double precision",
    "float",
    "serial",
    "bigserial"
  ].some((name) => dt.includes(name));
};
var isBooleanDbType = (dataType) => dataType.toLowerCase().includes("bool");
var isDateDbType2 = (dataType) => {
  const dt = dataType.toLowerCase();
  return dt.includes("date") || dt.includes("timestamp") || dt.includes("time");
};
var isJsonDbType = (dataType) => {
  const dt = dataType.toLowerCase();
  return dt.includes("json");
};
var getColumnValidationRule = (column, options) => {
  const required = options?.required === true;
  const enumValues = column.enum_values || column.check_enum;
  if (Array.isArray(enumValues) && enumValues.length) {
    return {
      type: "enum",
      enum: enumValues,
      ...required && { required: true }
    };
  }
  const dataType = String(column.data_type || "").toLowerCase();
  if (isNumericDbType2(dataType)) {
    return {
      type: "number",
      ...typeof column.check_min === "number" && { min: column.check_min },
      ...typeof column.check_max === "number" && { max: column.check_max },
      ...required && { required: true }
    };
  }
  if (isBooleanDbType(dataType)) {
    return { type: "boolean", ...required && { required: true } };
  }
  if (isDateDbType2(dataType)) {
    return { type: "date", ...required && { required: true } };
  }
  if (isJsonDbType(dataType)) {
    return { type: ["object", "array"], ...required && { required: true } };
  }
  return { type: "string", ...required && { required: true } };
};
var withArrayAlternative = (rule) => {
  const { preprocess, ...cleanRule } = rule;
  if (Array.isArray(cleanRule.type)) {
    if (cleanRule.type.includes("array"))
      return cleanRule;
    return {
      ...cleanRule,
      type: [...cleanRule.type, "array"],
      items: cleanRule.items || { ...cleanRule, required: false }
    };
  }
  if (cleanRule.type === "array")
    return cleanRule;
  if (!cleanRule.type && Array.isArray(cleanRule.enum)) {
    return {
      ...cleanRule,
      type: ["enum", "array"],
      items: { type: "enum", enum: cleanRule.enum }
    };
  }
  return {
    ...cleanRule,
    type: [cleanRule.type || "string", "array"],
    items: cleanRule.items || { ...cleanRule, required: false }
  };
};
var resolveTableColumns = (c, params) => {
  const schema = params.schema || "public";
  const key = `${schema}.${params.table}`;
  const envRecord = c.env;
  const fromContext = c.var?.dbTables || envRecord.dbTables || {};
  if (fromContext[key])
    return fromContext[key] || {};
  const fromParams = params.dbTables;
  if (fromParams && typeof fromParams === "object") {
    const asRecord = fromParams;
    if (asRecord[key] && typeof asRecord[key] === "object") {
      return asRecord[key];
    }
    const values = Object.values(asRecord);
    if (values.length && values.every((item) => isPlainObject(item) && ("data_type" in item))) {
      return asRecord;
    }
  }
  return {};
};
var buildPatchFromPost = (post) => {
  if (!post)
    return;
  return Object.entries(post).reduce((acc, [key, value]) => {
    const rule = { ...value };
    delete rule.required;
    if (rule.properties) {
      rule.properties = Object.entries(rule.properties).reduce((nestedAcc, [nestedKey, nestedRule]) => {
        const nr = { ...nestedRule };
        delete nr.required;
        nestedAcc[nestedKey] = nr;
        return nestedAcc;
      }, {});
    }
    acc[key] = rule;
    return acc;
  }, {});
};
var buildCrudValidationSchemaFromTable = (c, params) => {
  const normalizedParams = normalizeCrudConfig(params);
  const userIdFieldName = normalizedParams.userIdFieldName || "userId";
  const columns = resolveTableColumns(c, normalizedParams);
  const columnEntries = Object.entries(columns);
  const columnNames = columnEntries.map(([name]) => name);
  const joinSelectableNames = [
    ...normalizedParams.join || [],
    ...normalizedParams.joinOnDemand || []
  ].flatMap((item) => [item.table, item.alias]).filter((name) => typeof name === "string" && !!name);
  const joinFieldNames = [
    ...joinSelectableNames
  ];
  const selectableFieldNames = Array.from(new Set([...columnNames, ...joinFieldNames, "-relations"]));
  const primaryKey = columnEntries.find(([, col]) => col.is_primary_key)?.[0] || (columns.id ? "id" : columnNames[0]);
  const readOnly = normalizedParams.readOnlyFields || DEFAULT_READONLY_FIELDS2;
  const paramsSchema = {};
  if (primaryKey && columns[primaryKey]) {
    paramsSchema[primaryKey] = {
      ...getColumnValidationRule(columns[primaryKey]),
      required: true
    };
  }
  const querySchema = {
    _sort: {
      type: "array",
      preprocess: splitSortFields,
      items: {
        type: "enum",
        enum: [...columnNames, "random()"]
      }
    },
    _limit: { type: "number" },
    _page: { type: "number" },
    _skip: { type: "number" },
    _after: { type: ["string", "number", "date"] },
    _unlimited: { type: "boolean" },
    _fields: {
      type: "array",
      preprocess: splitCsv,
      items: {
        type: "enum",
        enum: selectableFieldNames
      }
    },
    _join: {
      type: "array",
      preprocess: splitCsv,
      items: {
        type: "enum",
        enum: Array.from(new Set((normalizedParams.joinOnDemand || []).flatMap((item) => [item.table, item.alias]).filter((name) => typeof name === "string" && !!name)))
      }
    },
    _lang: { type: "string" },
    _search: { type: "string" }
  };
  for (const [name, column] of columnEntries) {
    const rule = getColumnValidationRule(column);
    querySchema[name] = withArrayAlternative(rule);
    if (rule.type === "string" || Array.isArray(rule.type) && rule.type.includes("string")) {
      querySchema[`${name}~`] = { type: "string" };
    }
    if (column.is_nullable === "YES") {
      querySchema[`_null_${name}`] = { type: "boolean" };
      querySchema[`_not_null_${name}`] = { type: "boolean" };
    }
    if (rule.type !== "boolean") {
      querySchema[`_from_${name}`] = rule;
      querySchema[`_to_${name}`] = rule;
      querySchema[`_in_${name}`] = {
        type: "array",
        preprocess: parseJsonArray,
        items: { ...rule, required: false }
      };
      querySchema[`_not_in_${name}`] = {
        type: "array",
        preprocess: parseJsonArray,
        items: { ...rule, required: false }
      };
    }
    querySchema[`${name}!`] = withArrayAlternative(rule);
  }
  const bodyPost = {};
  for (const [name, column] of columnEntries) {
    if (readOnly.includes(name))
      continue;
    const required = name !== userIdFieldName && column.is_nullable === "NO" && (column.column_default === null || typeof column.column_default === "undefined");
    bodyPost[name] = getColumnValidationRule(column, { required });
  }
  const bodyPatch = buildPatchFromPost(bodyPost);
  return {
    params: paramsSchema,
    query: querySchema,
    headers: {
      authorization: { type: "string" }
    },
    body: {
      post: bodyPost,
      patch: bodyPatch
    }
  };
};
var mergeValidationSection = (generated, custom) => {
  if (typeof custom === "undefined")
    return generated;
  if (isEmptyPlainObject(custom))
    return null;
  if (isValidationResolver(custom))
    return custom;
  return {
    ...generated || {},
    ...custom || {}
  };
};
var mergeValidationConfig = (generated, custom) => {
  if (typeof custom === "undefined") {
    return {
      disabledAll: false,
      params: generated.params,
      query: generated.query,
      headers: generated.headers,
      body: generated.body
    };
  }
  if (isEmptyPlainObject(custom)) {
    return { disabledAll: true };
  }
  const mergedPost = mergeValidationSection(generated.body?.post, custom.body?.post);
  let mergedPatch = mergeValidationSection(generated.body?.patch, custom.body?.patch);
  if (typeof custom.body?.patch === "undefined" && isPlainObject(mergedPost)) {
    mergedPatch = buildPatchFromPost(mergedPost);
  }
  if (isEmptyPlainObject(custom.body)) {
    return {
      disabledAll: false,
      params: mergeValidationSection(generated.params, custom.params),
      query: mergeValidationSection(generated.query, custom.query),
      headers: mergeValidationSection(generated.headers, custom.headers),
      body: {
        post: null,
        patch: null
      }
    };
  }
  return {
    disabledAll: false,
    params: mergeValidationSection(generated.params, custom.params),
    query: mergeValidationSection(generated.query, custom.query),
    headers: mergeValidationSection(generated.headers, custom.headers),
    body: {
      post: mergedPost,
      patch: mergedPatch
    }
  };
};
var mapExternalIssues = (issues, section) => {
  return issues.map((issue) => {
    const record = issue || {};
    const pathArr = Array.isArray(record.path) ? record.path : [];
    const path = pathArr.map((part) => String(part)).join(".");
    const message = typeof record.message === "string" ? record.message : "Validation failed";
    const expected = isPlainObject(record.expected) ? record.expected : { type: "external" };
    const value = typeof record.input !== "undefined" ? record.input : typeof record.received !== "undefined" ? record.received : null;
    return {
      field: path ? `${section}.${path}` : section,
      message,
      expected,
      value
    };
  });
};
var runExternalValidator = async (validator, value, section) => {
  const v = validator;
  if (v && typeof v.safeParse === "function") {
    const result = await v.safeParse(value);
    const r = result;
    if (r?.success === true)
      return [];
    const issues = r?.error?.issues || [];
    return mapExternalIssues(issues, section);
  }
  if (v && typeof v.parse === "function") {
    try {
      await v.parse(value);
      return [];
    } catch (err) {
      const issues = err?.issues || [];
      if (issues.length)
        return mapExternalIssues(issues, section);
      return [{
        field: section,
        message: err instanceof Error ? err.message : "Validation failed",
        expected: { type: "external" },
        value
      }];
    }
  }
  if (v && typeof v.validate === "function") {
    try {
      const result = await v.validate(value);
      if (result === true || typeof result === "undefined")
        return [];
      if (Array.isArray(result)) {
        return withSectionPrefix(section, result);
      }
      if (isPlainObject(result) && Array.isArray(result.errors)) {
        return withSectionPrefix(section, result.errors);
      }
      if (result === false) {
        return [{
          field: section,
          message: "Validation failed",
          expected: { type: "external" },
          value
        }];
      }
      return [];
    } catch (err) {
      return [{
        field: section,
        message: err instanceof Error ? err.message : "Validation failed",
        expected: { type: "external" },
        value
      }];
    }
  }
  return [];
};
var resolveRuntimeSection = async (section, c, sectionName) => {
  if (!section)
    return {};
  if (isValidationResolver(section)) {
    const resolved = await section(c, async () => {});
    if (!resolved)
      return {};
    if (Array.isArray(resolved)) {
      return { errors: withSectionPrefix(sectionName, resolved) };
    }
    if (isPlainObject(resolved) && Array.isArray(resolved.errors)) {
      return {
        errors: withSectionPrefix(sectionName, resolved.errors || [])
      };
    }
    if (isPlainObject(resolved) && (typeof resolved.safeParse === "function" || typeof resolved.parse === "function" || typeof resolved.validate === "function")) {
      return { externalValidator: resolved };
    }
    if (isPlainObject(resolved)) {
      return { schema: resolved };
    }
    return {};
  }
  return { schema: section };
};
var getQueryData = (c) => {
  if (c.var?.query && typeof c.var.query === "object") {
    return { ...c.var.query };
  }
  return {};
};
var getHeaderData = (c) => {
  const headers = {};
  c.req.raw.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return headers;
};
var setValidationError = (c, issues) => {
  const getErr = c.get("getErrorByMessage");
  const errObj = getErr?.("VALIDATION_ERROR") || DEFAULT_VALIDATION_ERROR;
  c.status(errObj.status || 400);
  c.set("result", {
    ...errObj,
    name: "VALIDATION_ERROR",
    additional: issues,
    error: true
  });
};
var validateActionSections = async (c, action, merged) => {
  const errors = [];
  const paramsData = c.req.param();
  let bodyData;
  let bodyLoaded = false;
  const ensureBody = async () => {
    if (bodyLoaded) {
      return bodyData && typeof bodyData === "object" ? bodyData : {};
    }
    bodyLoaded = true;
    bodyData = c.var?.body;
    if (!bodyData || typeof bodyData !== "object") {
      bodyData = {};
    }
    return bodyData;
  };
  const run = async (sectionName, section, data) => {
    if (!section)
      return;
    const runtime = await resolveRuntimeSection(section, c, sectionName);
    if (runtime.errors?.length) {
      errors.push(...runtime.errors);
      return;
    }
    if (runtime.externalValidator) {
      errors.push(...await runExternalValidator(runtime.externalValidator, data, sectionName));
      return;
    }
    if (runtime.schema) {
      errors.push(...validateDataBySchema(data, runtime.schema, sectionName));
    }
  };
  if (action === "get") {
    if (Object.keys(paramsData).length) {
      await run("params", merged.params, paramsData);
    }
    await run("query", merged.query, getQueryData(c));
    await run("headers", merged.headers, getHeaderData(c));
    return errors;
  }
  if (action === "post") {
    await run("headers", merged.headers, getHeaderData(c));
    await run("body", merged.body?.post, await ensureBody());
    return errors;
  }
  if (action === "patch") {
    await run("params", merged.params, paramsData);
    await run("headers", merged.headers, getHeaderData(c));
    await run("body", merged.body?.patch, await ensureBody());
    return errors;
  }
  await run("params", merged.params, paramsData);
  await run("headers", merged.headers, getHeaderData(c));
  return errors;
};
var createCrudValidationMiddleware = (params) => {
  return (action) => async (c, next) => {
    const generated = buildCrudValidationSchemaFromTable(c, params);
    const merged = mergeValidationConfig(generated, params.validation);
    if (merged.disabledAll) {
      await next();
      return;
    }
    const issues = await validateActionSections(c, action, merged);
    if (issues.length) {
      setValidationError(c, issues);
      return;
    }
    await next();
  };
};

// src/Routings.ts
var factory = createFactory();

class Routings {
  routes = [];
  routesPermissions = {};
  routesErrors = {};
  routesEmailTemplates = {};
  crudPermissionsMeta = [];
  migrationDirs;
  pathPrefix = "";
  constructor(options) {
    if (options?.migrationDirs)
      this.migrationDirs = options.migrationDirs;
  }
  pushToRoutes({ method, path, fnArr }) {
    for (const fn of fnArr) {
      const handlers = factory.createHandlers(fn);
      this.routes.push({ path, method, handlers });
    }
  }
  prefix(path) {
    this.pathPrefix = path;
    return this;
  }
  get(p, ...fnArr) {
    const path = `${this.pathPrefix}${p}`.replace(/^\/+/g, "/");
    this.pushToRoutes({ method: "GET", path, fnArr });
    return this;
  }
  post(p, ...fnArr) {
    const path = `${this.pathPrefix}${p}`.replace(/^\/+/g, "/");
    this.pushToRoutes({ method: "POST", path, fnArr });
    return this;
  }
  patch(p, ...fnArr) {
    const path = `${this.pathPrefix}${p}`.replace(/^\/+/g, "/");
    this.pushToRoutes({ method: "PATCH", path, fnArr });
    return this;
  }
  delete(p, ...fnArr) {
    const path = `${this.pathPrefix}${p}`.replace(/^\/+/g, "/");
    this.pushToRoutes({ method: "DELETE", path, fnArr });
    return this;
  }
  use(p, ...fnArr) {
    const path = `${this.pathPrefix}${p}`.replace(/^\/+/g, "/");
    this.pushToRoutes({ path, fnArr });
    return this;
  }
  all(...fnArr) {
    const path = `${this.pathPrefix}*`.replace(/^\/+/g, "/");
    this.pushToRoutes({ path, fnArr });
    return this;
  }
  crud(params) {
    const normalizedParams = normalizeCrudConfig(params);
    const { prefix, table, permissions } = normalizedParams;
    const p = `/${prefix || table}`.replace(/^\/+/, "/");
    const permissionPrefix = p.replace(/^\//, "");
    const methods = permissions?.methods || permissions?.protectedMethods;
    const methodsConfigured = Array.isArray(methods);
    const hasExplicitOwnerPermissions = !!normalizedParams.permissions?.owner?.length;
    const validate = createCrudValidationMiddleware(normalizedParams);
    const createCrudBuilder = (c) => {
      const cb = new CrudBuilder(normalizedParams);
      if (hasExplicitOwnerPermissions)
        return cb;
      const roles = c.var.roles;
      if (!roles || typeof roles.getPermissions !== "function")
        return cb;
      const ownerPermissions = roles.getPermissions(["owner"]);
      if (!ownerPermissions || typeof ownerPermissions !== "object")
        return cb;
      cb.ownerPermissions = ownerPermissions;
      return cb;
    };
    this.get(`${p}`, validate("get"), async (c) => {
      const cb = createCrudBuilder(c);
      await cb.get(c);
    });
    this.post(`${p}`, validate("post"), async (c) => {
      const cb = createCrudBuilder(c);
      await cb.add(c);
    });
    this.get(`${p}/:id`, validate("get"), async (c) => {
      const cb = createCrudBuilder(c);
      await cb.getById(c);
    });
    this.patch(`${p}/:id`, validate("patch"), async (c) => {
      const cb = createCrudBuilder(c);
      await cb.update(c);
    });
    this.delete(`${p}/:id`, validate("delete"), async (c) => {
      const cb = createCrudBuilder(c);
      await cb.delete(c);
    });
    this.crudPermissionsMeta.push({
      path: `${this.pathPrefix}${p}`,
      permissionPrefix,
      methodsConfigured,
      tableName: table
    });
    if (methods?.length) {
      const register = (path, method) => {
        const key = `${method} ${path}`;
        if (!this.routesPermissions[key])
          this.routesPermissions[key] = [];
        this.routesPermissions[key].push(`${permissionPrefix}.${method.toLowerCase()}`);
      };
      const protectedMethods = methods[0] === "*" ? ["GET", "POST", "PATCH", "DELETE"] : methods;
      for (const method of protectedMethods) {
        if (method === "POST" || method === "GET")
          register(p, method);
        if (method !== "POST")
          register(`${p}/:id`, method);
      }
    }
  }
  errors(err) {
    const errArr = Array.isArray(err) ? err : [err];
    for (const e of errArr)
      Object.assign(this.routesErrors, e);
  }
  emailTemplates(template) {
    Object.assign(this.routesEmailTemplates, template);
  }
}
export {
  Routings,
  CrudBuilder
};
