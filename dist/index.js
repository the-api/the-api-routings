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
    const env = c.env;
    this.state = {
      res: this.getDbWithSchema(env.db),
      rows: env.dbTables?.[`${this.schema}.${this.table}`] || {},
      user: c.var?.user,
      roles: env.roles,
      lang: this.defaultLang,
      coalesceWhere: {},
      coalesceWhereReplacements: {},
      langJoin: {}
    };
  }
  getDbWithSchema(db) {
    const qb = db(this.table);
    if (this.schema)
      qb.withSchema(this.schema);
    return qb;
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
        this.state.res.distinct(!f ? [] : sortArr.map((item) => !f.includes(item) && `${this.table}.${item}`).filter(Boolean));
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
      join = join.filter(({ table, alias }) => f.includes(table) || (alias ? f.includes(alias) : false));
      f = f.filter((name) => !join.find(({ table, alias }) => name === table || name === alias));
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
          select text from langs where lang=:lang and "textKey" = any(
            select "textKey" from langs where lang='en' and text = "${this.table}"."${field}"
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
      const lang = table === "lang" && this.state.lang?.match(/^\w{2}$/) ? `AND lang='${this.state.lang}'` : "";
      const ff = joinFields?.map((item) => typeof item === "string" ? `'${item}', "${as || table}"."${item}"` : `'${Object.keys(item)[0]}', ${Object.values(item)[0]}`);
      const f2 = ff ? `json_build_object(${ff.join(", ")})` : `"${as || table}".*`;
      const f3 = field || `jsonb_agg(${f2})`;
      const wb = {};
      if (whereBindings) {
        const envAll = { ...c.env };
        ["db", "dbWrite", "dbTables", "error", "getErrorByMessage", "log"].forEach((key) => delete envAll[key]);
        const dd = flattening({
          env: envAll,
          params: c.req.param(),
          query: c.req.query()
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
    if (c.req.query()._search && this.searchFields.length) {
      const searchColumnsStr = this.searchFields.map((name) => {
        const searchName = this.state.langJoin[name] || `"${name}"`;
        return `COALESCE(${searchName} <-> :_search, 1)`;
      }).join(" + ");
      joinCoalesce.push(db.raw(`(${searchColumnsStr})/${this.searchFields.length} as _search_distance`, { ...c.req.query(), lang: this.state.lang }));
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
        filtered[key] = data[key];
      }
    }
    return filtered;
  }
  updateData(c, data) {
    for (const [key, errorCode] of Object.entries(this.requiredFields)) {
      if (!data[key])
        throw new Error(errorCode);
    }
    const rows = this.state.rows;
    const filtered = this.filterDataByTableColumns(data, rows);
    if (rows.userId && this.state.user) {
      filtered.userId = this.state.user.id;
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
    const db = c.env.db;
    const queries = q || c.req.queries();
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
    const db = c.env.db;
    const { id } = c.req.param();
    const { _fields, _lang, _join, ...whereWithParams } = c.req.query();
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
    const body = await c.req.json();
    const data = this.updateIncomingData(c, body);
    const validatedData = Array.isArray(data) ? data.map((item) => this.validateIntegerFields(item)) : this.validateIntegerFields(data);
    const result = await this.getDbWithSchema(c.env.dbWrite).insert(validatedData).returning("*");
    c.set("result", result[0]);
    c.set("relationsData", this.relations);
  }
  validateIntegerFields(data) {
    for (const key of Object.keys(data)) {
      const isInt = this.dbTables?.[key]?.data_type === "integer";
      const hasNaN = [].concat(data[key]).find((item) => item && Number.isNaN(+item));
      if (isInt && hasNaN)
        throw new Error("INTEGER_REQUIRED");
      data[key] = data[key] ?? null;
    }
    return data;
  }
  async update(c) {
    this.initState(c);
    const db = c.env.db;
    const params = c.req.param();
    const whereClause = { ...params };
    if (this.dbTables?.id?.data_type === "integer" && Number.isNaN(+String(whereClause.id))) {
      throw new Error("INTEGER_REQUIRED");
    }
    const rows = this.state.rows;
    if (rows.isDeleted)
      whereClause.isDeleted = false;
    const rawData = await c.req.json();
    const data = this.filterDataByTableColumns(rawData, rows);
    if (Object.keys(data).length) {
      if (rows.timeUpdated)
        data.timeUpdated = db.fn.now();
      await this.getDbWithSchema(c.env.dbWrite).update(data).where(whereClause);
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
    const t = this.getDbWithSchema(c.env.dbWrite).where(whereClause);
    const result = rows.isDeleted ? await t.update({ isDeleted: true }) : await t.delete();
    c.set("result", { ok: true });
    c.set("meta", { countDeleted: result });
  }
}
// src/Routings.ts
import { createFactory } from "hono/factory";
var factory = createFactory();

class Routings {
  routes = [];
  routesPermissions = {};
  routesErrors = {};
  routesEmailTemplates = {};
  migrationDirs;
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
  get(path, ...fnArr) {
    this.pushToRoutes({ method: "GET", path, fnArr });
  }
  post(path, ...fnArr) {
    this.pushToRoutes({ method: "POST", path, fnArr });
  }
  patch(path, ...fnArr) {
    this.pushToRoutes({ method: "PATCH", path, fnArr });
  }
  put(path, ...fnArr) {
    this.pushToRoutes({ method: "PUT", path, fnArr });
  }
  delete(path, ...fnArr) {
    this.pushToRoutes({ method: "DELETE", path, fnArr });
  }
  use(path, ...fnArr) {
    this.pushToRoutes({ path, fnArr });
  }
  all(...fnArr) {
    this.pushToRoutes({ path: "*", fnArr });
  }
  crud(params) {
    const { prefix, table, permissions } = params;
    const p = `/${prefix || table}`.replace(/^\/+/, "/");
    this.get(`${p}`, async (c) => {
      const cb = new CrudBuilder(params);
      await cb.get(c);
    });
    this.post(`${p}`, async (c) => {
      const cb = new CrudBuilder(params);
      await cb.add(c);
    });
    this.get(`${p}/:id`, async (c) => {
      const cb = new CrudBuilder(params);
      await cb.getById(c);
    });
    this.put(`${p}/:id`, async (c) => {
      const cb = new CrudBuilder(params);
      await cb.update(c);
    });
    this.patch(`${p}/:id`, async (c) => {
      const cb = new CrudBuilder(params);
      await cb.update(c);
    });
    this.delete(`${p}/:id`, async (c) => {
      const cb = new CrudBuilder(params);
      await cb.delete(c);
    });
    if (permissions?.protectedMethods) {
      const register = (path, method) => {
        const key = `${method} ${path}`;
        if (!this.routesPermissions[key])
          this.routesPermissions[key] = [];
        this.routesPermissions[key].push(`${p.replace(/^\//, "")}.${method.toLowerCase()}`);
      };
      const methods = permissions.protectedMethods[0] === "*" ? ["GET", "POST", "PUT", "PATCH", "DELETE"] : permissions.protectedMethods;
      for (const method of methods) {
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
      this.routesErrors = { ...this.routesErrors, ...e };
  }
  emailTemplates(template) {
    this.routesEmailTemplates = { ...this.routesEmailTemplates, ...template };
  }
}
export {
  Routings,
  CrudBuilder
};
