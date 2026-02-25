// src/CrudBuilder.ts
import flattening from "flattening";

class CrudBuilder {
  c;
  table;
  schema;
  aliases;
  join;
  joinOnDemand;
  leftJoin;
  leftJoinDistinct;
  lang;
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
  permissionViewableFields;
  permissionEditableFields;
  showFieldsByPermission;
  permissionCheckedMethods;
  replacedOwnerPermissions;
  cache;
  userIdFieldName;
  additionalFields;
  apiClientMethodNames;
  dbTables;
  coaliseWhere;
  langJoin = {};
  coaliseWhereReplacements;
  user;
  res;
  isOwner;
  rows;
  relations;
  roles;
  permissions;
  ownerPermissions;
  constructor({
    c,
    table,
    schema,
    aliases,
    join,
    joinOnDemand,
    leftJoin,
    leftJoinDistinct,
    lang,
    translate,
    searchFields,
    hiddenFields,
    readOnlyFields,
    permissions,
    requiredFields,
    defaultWhere,
    defaultWhereRaw,
    defaultSort,
    sortRaw,
    fieldsRaw,
    tokenRequired,
    ownerRequired,
    rootRequired,
    access,
    accessByStatuses,
    dbTables,
    deletedReplacements,
    includeDeleted,
    cache,
    userIdFieldName,
    additionalFields,
    apiClientMethodNames,
    relations
  }) {
    this.c = c;
    this.table = table;
    this.schema = schema || "public";
    this.aliases = aliases || {};
    this.join = join || [];
    this.joinOnDemand = joinOnDemand || [];
    this.leftJoin = leftJoin || [];
    this.leftJoinDistinct = !!leftJoinDistinct;
    this.lang = lang || "en";
    this.translate = translate || [];
    this.showFieldsByPermission = permissions?.fields?.viewable || {};
    this.ownerPermissions = permissions?.owner?.reduce((acc, cur) => ({ ...acc, [cur]: true }), {}) || {};
    this.readOnlyFields = readOnlyFields || ["id", "timeCreated", "timeUpdated", "timeDeleted", "isDeleted"];
    this.requiredFields = requiredFields || {};
    this.defaultWhere = defaultWhere || {};
    this.defaultWhereRaw = defaultWhereRaw;
    this.defaultSort = defaultSort;
    this.sortRaw = sortRaw;
    this.fieldsRaw = fieldsRaw;
    this.tokenRequired = tokenRequired?.reduce((acc, cur) => ({ ...acc, [cur]: true }), {}) || {};
    this.ownerRequired = ownerRequired?.reduce((acc, cur) => ({ ...acc, [cur]: true }), {}) || {};
    this.rootRequired = rootRequired?.reduce((acc, cur) => ({ ...acc, [cur]: true }), {}) || {};
    this.access = access || {};
    this.accessByStatuses = accessByStatuses || {};
    this.searchFields = searchFields || [];
    this.dbTables = dbTables || {};
    this.deletedReplacements = deletedReplacements;
    this.includeDeleted = typeof includeDeleted === "boolean" ? includeDeleted : !!this.deletedReplacements;
    this.hiddenFields = hiddenFields || [];
    this.coaliseWhere = {};
    this.coaliseWhereReplacements = {};
    this.cache = cache;
    this.userIdFieldName = userIdFieldName || "userId";
    this.additionalFields = additionalFields || {};
    this.apiClientMethodNames = apiClientMethodNames || {};
    this.relations = relations;
  }
  getDbWithSchema(db) {
    const result = db(this.table);
    if (this.schema)
      result.withSchema(this.schema);
    return result;
  }
  getTableRows(c) {
    return c.env.dbTables[`${this.schema}.${this.table}`] || {};
  }
  sort(sort, db) {
    if (this.sortRaw)
      this.res.orderByRaw(this.sortRaw);
    const _sort = sort || this.defaultSort;
    if (!_sort)
      return;
    _sort.split(",").forEach((item) => {
      if (item.match(/^random\(\)$/i))
        return this.res.orderBy(db.raw("RANDOM()"));
      const match = item.match(/^(-)?(.*)$/);
      this.res.orderBy(match[2], match[1] && "desc", "last");
    });
  }
  pagination({
    _page,
    _skip = 0,
    _limit,
    _unlimited
  }) {
    const isUnlimited = _unlimited === "true" || _unlimited === true;
    if (!_limit || isUnlimited)
      return;
    this.res.limit(_limit);
    const offset = _page ? (_page - 1) * _limit : 0;
    this.res.offset(offset + +_skip);
  }
  whereNotIn(whereNotInObj) {
    if (!whereNotInObj)
      return;
    for (const [key, value] of Object.entries(whereNotInObj)) {
      this.res.whereNotIn(key, value);
    }
  }
  where(whereObj, db) {
    if (!whereObj)
      return;
    for (const [key, value] of Object.entries(whereObj)) {
      if (this.langJoin[`${key}`]) {
        this.res.whereRaw(`${this.langJoin[`${key}`]} = :_value`, { _value: value, lang: this.lang });
      } else if (this.coaliseWhere[`${key}`] || this.coaliseWhere[`${key.replace(/!$/, "")}`]) {
        const key2 = key.replace(/!$/, "");
        const isNnot = key.match(/!$/) ? "NOT" : "";
        const coaliseWhere = this.coaliseWhere[`${key2}`];
        const replacements = this.coaliseWhereReplacements;
        if (Array.isArray(value)) {
          for (const _value of value) {
            this.res.orWhere(function() {
              this.whereRaw(`${isNnot} ${coaliseWhere} = :_value`, { ...replacements, _value });
            });
          }
        } else {
          this.res.whereRaw(`${isNnot} ${coaliseWhere} = :_value`, { ...replacements, _value: value });
        }
      } else if (key.match(/~$/)) {
        this.res.where(key.replace(/~$/, ""), "ilike", value);
      } else if (key.match(/!$/)) {
        if (Array.isArray(value)) {
          this.res.whereNotIn(key.replace(/!$/, ""), value);
        } else {
          this.res.whereNot(key.replace(/!$/, ""), value);
        }
      } else if (key.match(/^_null_/)) {
        const m = key.match(/^_null_(.+)$/);
        this.res.whereNull(m?.[1]);
      } else if (key.match(/^_in_/)) {
        try {
          const m = key.match(/^_in_(.+)$/);
          this.res.whereIn(m?.[1], JSON.parse(value));
        } catch {
          throw new Error("ERROR_QUERY_VALUE");
        }
      } else if (key.match(/^_not_in_/)) {
        try {
          const m = key.match(/^_not_in_(.+)$/);
          this.res.whereNotIn(m?.[1], JSON.parse(value));
        } catch {
          throw new Error("ERROR_QUERY_VALUE");
        }
      } else if (key.match(/^_not_null_/)) {
        const m = key.match(/^_not_null_(.+)$/);
        this.res.whereNotNull(m?.[1]);
      } else if (key.match(/_(from|to)_/)) {
        if (value !== "") {
          const m = key.match(/_(from|to)_(.+)$/);
          const sign = m?.[1] === "from" ? ">=" : "<=";
          const coaliseWhere = this.coaliseWhere[`${m?.[2]}`];
          if (coaliseWhere) {
            this.res.whereRaw(`${coaliseWhere} ${sign} ?`, [value]);
          } else {
            this.res.where(`${m?.[2]}`, sign, value);
          }
        }
      } else if (Array.isArray(value)) {
        this.res.whereIn(key, value);
      } else if (value === null) {
        this.res.whereNull(key);
      } else if (this.leftJoin && !key.includes(".")) {
        this.res.where({ [`${this.table}.${key}`]: value });
      } else {
        this.res.where(key, value);
      }
    }
  }
  getHiddenFields() {
    if (!this.roles)
      return { regular: this.hiddenFields, owner: this.hiddenFields };
    const permissions = this.roles.getPermissions(this.user?.roles);
    let toShow = [];
    let ownerToShow = [];
    for (const [key, value] of Object.entries(this.showFieldsByPermission)) {
      const hasPermission = this.roles.checkWildcardPermissions({ key, permissions });
      if (hasPermission)
        toShow = toShow.concat(value);
      const ownerHasPermission = this.roles.checkWildcardPermissions({ key, permissions: this.ownerPermissions });
      if (ownerHasPermission)
        ownerToShow = ownerToShow.concat(value);
    }
    const regular = this.hiddenFields?.filter((item) => !toShow.includes(item)) || [];
    const owner = this.hiddenFields?.filter((item) => !ownerToShow.includes(item)) || [];
    return { regular, owner };
  }
  fields({
    c,
    _fields,
    _join,
    db,
    _sort
  }) {
    let f = _fields && _fields.split(",").filter((item) => item !== "-relations");
    if (this.leftJoin.length) {
      this.leftJoin.map((item) => this.res.leftJoin(...item));
      if (this.leftJoinDistinct) {
        const sortArr = (_sort || this.defaultSort || "").replace(/(^|,)-/g, ",").split(",").filter(Boolean);
        this.res.distinct(!f ? [] : sortArr.map((item) => !f.includes(item) && `${this.table}.${item}`).filter(Boolean));
      }
    }
    let join = [...this.join];
    if (_join) {
      const joinNames = Array.isArray(_join) ? _join : _join.split(",");
      for (const joinName of joinNames) {
        const toJoin = this.joinOnDemand.filter(({ table, alias }) => joinName === alias || joinName === table);
        if (toJoin.length)
          join = join.concat(toJoin.filter((j) => !join.find(({ table, alias }) => table === j.table && alias === j.alias)));
      }
    }
    if (f) {
      join = join.filter(({ table, alias }) => f.includes(table) || f.includes(alias));
      f = f.filter((name) => !join.find(({ table, alias }) => name === table || name === alias));
    }
    let joinCoaleise = (f || Object.keys(this.rows)).map((l) => `${this.table}.${l}`);
    if (this.includeDeleted && this.deletedReplacements && this.rows.isDeleted) {
      joinCoaleise = joinCoaleise.map((item) => {
        const [tableName, fieldName] = item.split(".");
        const replaceWith = this.deletedReplacements[`${fieldName}`];
        if (typeof replaceWith === "undefined")
          return item;
        return db.raw(`CASE WHEN "${this.table}"."isDeleted" THEN :replaceWith ELSE "${tableName}"."${fieldName}" END AS ${fieldName}`, { replaceWith });
      });
    }
    for (const field of Object.keys(this.aliases)) {
      joinCoaleise.push(`${this.table}.${field} AS ${this.aliases[`${field}`]}`);
    }
    if (this.lang && this.lang !== "en") {
      for (const field of this.translate) {
        this.langJoin[`${field}`] = `COALESCE( (
          select text from langs where lang=:lang and "textKey" = any(
            select "textKey" from langs where lang='en' and text = "${this.table}"."${field}" 
          ) limit 1), name )`;
        joinCoaleise.push(db.raw(this.langJoin[`${field}`] + `AS "${field}"`, { lang: this.lang }));
      }
    }
    for (const {
      table,
      schema,
      as,
      where,
      whereBindings,
      alias,
      defaultValue,
      fields,
      field,
      limit,
      orderBy,
      byIndex,
      leftJoin
    } of join) {
      if (!table && field) {
        joinCoaleise.push(db.raw(`${field} AS ${alias || field}`));
        continue;
      }
      const orderByStr = orderBy ? `ORDER BY ${orderBy}` : "";
      const limitStr = limit ? `LIMIT ${limit}` : "";
      const lang = table === "lang" && this.lang && this.lang.match(/^\w{2}$/) ? `AND lang='${this.lang}'` : "";
      const ff = fields?.map((item) => typeof item === "string" ? `'${item}', "${as || table}"."${item}"` : `'${Object.keys(item)[0]}', ${Object.values(item)[0]}`);
      const f2 = ff ? `json_build_object(${ff.join(", ")})` : `"${as || table}".*`;
      const f3 = field || `jsonb_agg(${f2})`;
      const wb = {};
      if (whereBindings) {
        if (!c)
          continue;
        const envAll = c.env;
        const query = c.req.query();
        const params = c.req.param();
        const env = { ...envAll };
        [
          "db",
          "dbWrite",
          "dbTables",
          "error",
          "getErrorByMessage",
          "log"
        ].map((key) => delete env[`${key}`]);
        const dd = flattening({ env, params, query });
        for (const [k, v] of Object.entries(whereBindings))
          wb[`${k}`] = dd[`${v}`] || null;
      }
      const leftJoinStr = !leftJoin ? "" : typeof leftJoin === "string" ? `LEFT JOIN ${leftJoin}` : `LEFT JOIN "${leftJoin[0]}" ON ${leftJoin[1]} = ${leftJoin[2]}`;
      const index = typeof byIndex === "number" ? `[${byIndex}]` : "";
      const schemaStr = !schema ? "" : `"${schema}".`;
      const dValue = defaultValue ? `'${defaultValue}'` : "NULL";
      const coaliseWhere = `COALESCE( ( SELECT ${f3} FROM (
        SELECT * FROM ${schemaStr}"${table}" AS "${as || table}"
        ${leftJoinStr}
        WHERE ${where} ${lang}
        ${orderByStr}
        ${limitStr}
      ) "${as || table}")${index}, ${dValue})`;
      this.coaliseWhere = { ...this.coaliseWhere, [`${alias || table}`]: coaliseWhere };
      this.coaliseWhereReplacements = { ...this.coaliseWhereReplacements, ...wb };
      let sqlToJoin = `${coaliseWhere} AS "${alias || table}"`;
      if (this.includeDeleted && this.deletedReplacements && this.rows.isDeleted) {
        const replaceWith = this.deletedReplacements[`${table}`] || this.deletedReplacements[`${as}`] || this.deletedReplacements[`${alias}`];
        if (typeof replaceWith !== "undefined") {
          sqlToJoin = `CASE WHEN "${this.table}"."isDeleted" THEN ${replaceWith} ELSE ${coaliseWhere} END AS "${alias || table}"`;
        }
      }
      joinCoaleise.push(db.raw(sqlToJoin, wb));
    }
    if (c.req.query()._search && this.searchFields.length) {
      const searchColumnsStr = this.searchFields.map((name) => {
        const searchName = this.langJoin[`${name}`] || `"${name}"`;
        return `COALESCE(${searchName} <-> :_search, 1)`;
      }).join(" + ");
      joinCoaleise.push(db.raw(`(${searchColumnsStr})/${this.searchFields.length} as _search_distance`, { ...c.req.query(), lang: this.lang }));
      if (!_sort)
        this.res.orderBy("_search_distance", "ASC");
    }
    this.res.column(joinCoaleise.concat(this.fieldsRaw || []));
  }
  checkDeleted() {
    if (this.includeDeleted || !this.rows.isDeleted)
      return;
    this.res.where({ [`${this.table}.isDeleted`]: false });
  }
  getJoinFields() {
    return this.join.reduce((acc, { alias, table, field }) => {
      let type = !field && "ARRAY";
      if (!type)
        type = field.match(/::bool$/) && "boolean";
      if (!type)
        type = field.match(/::int$/) && "integer";
      if (!type)
        type = "string";
      acc[alias || table] = type;
      return acc;
    }, {});
  }
  deleteHiddenFieldsFromResult(result, hiddenFields) {
    if (!hiddenFields)
      return;
    const isOwner = this.user?.id && result[`${this.userIdFieldName}`] === this.user?.id;
    hiddenFields[isOwner ? "owner" : "regular"].map((key) => delete result[`${key}`]);
  }
  optionsGet() {
    const fields = {};
    const fieldsSearchLike = {};
    const fieldsFromTo = {};
    const fieldsNull = {};
    for (const [key, data] of Object.entries(this.dbTables || {})) {
      if (!data)
        continue;
      fields[`${key}`] = data.data_type;
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
    const queryParameters = {
      ...fields,
      ...fieldsSearchLike,
      ...fieldsNull,
      ...fieldsFromTo,
      ...this.additionalFields?.get,
      _fields: {
        type: "string",
        example: "id,name"
      },
      _sort: {
        type: "string",
        example: "-timeCreated,name,random()"
      },
      _join: {
        type: "string",
        example: "table1,alias1"
      },
      _limit: "integer",
      _page: "integer",
      _skip: "integer",
      _lang: "string",
      ...this.searchFields.length && { _search: "string" }
    };
    return {
      tokenRequired: this.tokenRequired.get || this.access.read || this.accessByStatuses.read,
      ownerRequired: this.ownerRequired.get,
      rootRequired: this.rootRequired.get,
      joinFields: this.getJoinFields(),
      cache: this.cache,
      joinOnDemand: this.joinOnDemand,
      accessByStatuses: this.accessByStatuses.read,
      additionalFields: this.additionalFields.get,
      queryParameters,
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
    const { db, roles } = c.env;
    const { user } = c.var;
    this.roles = roles;
    this.user = user;
    const queries = q || c.req.queries();
    let queriesWithoutArrays = {};
    for (const [queryName, queryValue] of Object.entries(queries)) {
      queriesWithoutArrays[`${queryName}`] = queryValue?.length === 1 ? queryValue[0] : queryValue;
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
    } = queriesWithoutArrays;
    if (_lang)
      this.lang = _lang;
    this.rows = this.getTableRows(c);
    this.res = this.getDbWithSchema(c.env.db);
    this.fields({ c, _fields, _join, db, _sort });
    this.where({ ...this.defaultWhere, ...where }, db);
    if (this.defaultWhereRaw) {
      const whereStr = this.defaultWhereRaw;
      this.res.andWhere(function() {
        this.whereRaw(whereStr);
      });
    }
    if (_search && this.searchFields.length) {
      const whereStr = this.searchFields.map((name) => {
        const searchName = this.langJoin[`${name}`] || `"${name}"`;
        return `${searchName} % :_search`;
      }).join(" OR ");
      const lang = this.lang;
      this.res.andWhere(function() {
        this.whereRaw(whereStr, { _search, lang });
      });
    }
    this.checkDeleted();
    const total = +(await db.from({ w: this.res }).count("*"))[0].count;
    this.sort(_sort, db);
    const s = _sort || this.defaultSort;
    const sName = s?.replace(/^-/, "");
    if (_after && _limit && s && this.getTableRows(c)[`${sName}`]) {
      this.res.where(sName, s[0] === "-" ? "<" : ">", _after);
      this.res.limit(_limit);
    } else
      this.pagination({
        _page,
        _skip,
        _limit,
        _unlimited
      });
    const result = await this.res;
    const nextAfterData = result?.at(-1)?.[`${sName}`];
    const addAfterMs = s?.[0] === "-" ? "000" : "999";
    const nextAfter = nextAfterData instanceof Date ? new Date(nextAfterData).toISOString().replace("Z", `${addAfterMs}Z`) : nextAfterData;
    let meta = { total };
    if (_after) {
      meta = {
        ...meta,
        after: _after,
        nextAfter: nextAfter ? encodeURIComponent(nextAfter) : undefined
      };
      meta = {
        ...meta,
        isFirstPage: false,
        isLastPage: !result.length || result.length < _limit
      };
    } else {
      const limit = +_limit;
      const skip = +_skip || 0;
      const page = +_page || 1;
      const pages = !limit ? 1 : Math.ceil((total - skip) / limit);
      meta = {
        ...meta,
        limit,
        skip,
        page,
        pages,
        nextAfter: page === 1 && nextAfter ? encodeURIComponent(nextAfter) : undefined,
        nextPage: page >= pages ? undefined : page + 1,
        isFirstPage: page <= 1,
        isLastPage: page >= pages
      };
    }
    const hiddenFields = this.getHiddenFields();
    if (hiddenFields) {
      for (let i = 0;i < result.length; i++) {
        this.deleteHiddenFieldsFromResult(result[i], hiddenFields);
      }
    }
    return { result, meta };
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
  async getById(c) {
    const { db, roles } = c.env;
    this.roles = roles;
    this.user = c.var.user;
    const { id } = c.req.param();
    const {
      _fields,
      _lang,
      _join,
      ...whereWithParams
    } = c.req.query();
    const where = Object.keys(whereWithParams).reduce((acc, key) => {
      if (key[0] !== "_") {
        const isInt = this.dbTables?.[`${key}`]?.data_type === "integer";
        const hasNaN = [].concat(whereWithParams[`${key}`]).find((item) => Number.isNaN(+item));
        if (isInt && hasNaN)
          throw new Error("INTEGER_REQUIRED");
        acc[`${key}`] = whereWithParams[`${key}`];
      }
      return acc;
    }, {});
    this.lang = _lang;
    this.rows = this.getTableRows(c);
    this.res = this.getDbWithSchema(c.env.db);
    if (this.dbTables?.id?.data_type === "integer" && Number.isNaN(+id))
      throw new Error("INTEGER_REQUIRED");
    this.where({ ...where, [`${this.table}.id`]: id }, db);
    if (this.defaultWhereRaw) {
      const whereStr = this.defaultWhereRaw;
      this.res.andWhere(function() {
        this.whereRaw(whereStr);
      });
    }
    this.checkDeleted();
    this.fields({
      c,
      _fields,
      _join,
      db
    });
    const result = await this.res.first();
    this.deleteHiddenFieldsFromResult(result, this.getHiddenFields());
    c.set("result", result);
    c.set("relationsData", this.relations);
  }
  updateIncomingData(c, data) {
    return Array.isArray(data) ? data.map((item) => this.updateData(c, item)) : this.updateData(c, data);
  }
  updateData(c, data) {
    const { user } = c.var;
    let result = { ...data };
    const rows = this.getTableRows(c);
    for (const [key, error_code] of Object.entries(this.requiredFields)) {
      if (!result[`${key}`])
        throw new Error(error_code);
    }
    for (const key of this.readOnlyFields) {
      delete result[`${key}`];
    }
    result = { ...c.req.param(), ...result };
    for (const r of Object.keys(result)) {
      if (rows[`${r}`] && typeof result[`${r}`] !== "undefined")
        continue;
      delete result[`${r}`];
    }
    if (rows.userId && user)
      result.userId = user.id;
    return result;
  }
  optionsAdd() {
    const schema = Object.entries(this.dbTables || {}).reduce((acc, [key, data]) => {
      const keyForbiddeen = this.readOnlyFields.includes(key);
      return keyForbiddeen ? acc : { ...acc, [key]: data };
    }, this.additionalFields?.add || {});
    return {
      tokenRequired: this.tokenRequired.add || this.access.create || this.accessByStatuses.create,
      ownerRequired: this.ownerRequired.add,
      rootRequired: this.rootRequired.add,
      readOnlyFields: this.readOnlyFields,
      requiredFields: Object.keys(this.requiredFields),
      accessByStatuses: this.accessByStatuses.add,
      apiClientMethodNames: this.apiClientMethodNames,
      schema
    };
  }
  async add(c) {
    const requestBody = await c.req.json();
    const bodyKeys = Object.keys(requestBody);
    const looksLikeArray = bodyKeys.length && bodyKeys.every((j, i) => i === +j);
    const body = looksLikeArray ? Object.values(requestBody) : requestBody;
    const data = this.updateIncomingData(c, body);
    for (const key of Object.keys(data)) {
      const isInt = this.dbTables?.[`${key}`]?.data_type === "integer";
      const hasNaN = [].concat(data[`${key}`]).find((item) => item && Number.isNaN(+item));
      if (isInt && hasNaN)
        throw new Error("INTEGER_REQUIRED");
      data[`${key}`] = data[`${key}`] ?? null;
    }
    const result = await this.getDbWithSchema(c.env.dbWrite).insert(data).returning("*");
    c.set("result", result[0]);
    c.set("relationsData", this.relations);
  }
  optionsUpdate() {
    const schema = Object.entries(this.dbTables || {}).reduce((acc, [key, data]) => {
      const keyForbiddeen = this.readOnlyFields.includes(key);
      return keyForbiddeen ? acc : { ...acc, [key]: data };
    }, this.additionalFields?.update || {});
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
  async update(c) {
    const { db } = c.env;
    const where = { ...c.req.param() };
    if (this.dbTables?.id?.data_type === "integer" && Number.isNaN(+where.id))
      throw new Error("INTEGER_REQUIRED");
    const rows = this.getTableRows(c);
    if (rows.isDeleted)
      where.isDeleted = false;
    const data = await c.req.json();
    for (const key of this.readOnlyFields) {
      delete data[`${key}`];
    }
    if (Object.keys(data).length) {
      if (rows.timeUpdated)
        data.timeUpdated = db.fn.now();
      await this.getDbWithSchema(c.env.dbWrite).update(data).where(where);
    }
    await this.getById(c);
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
  async delete(c) {
    const { user } = c.var;
    const where = { ...c.req.param() };
    if (this.dbTables?.id?.data_type === "integer" && Number.isNaN(+where.id))
      throw new Error("INTEGER_REQUIRED");
    const rows = this.getTableRows(c);
    if (rows.isDeleted)
      where.isDeleted = false;
    const t = this.getDbWithSchema(c.env.dbWrite).where(where);
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
    const { migrationDirs } = options || {};
    if (migrationDirs)
      this.migrationDirs = migrationDirs;
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
    const { table, prefix, permissions } = params;
    const p = `/${prefix || table}`.replace(/^\/+/, "/");
    this.get(`${p}`, async (c) => {
      const crudBuilder = new CrudBuilder(params);
      await crudBuilder.get(c);
    });
    this.post(`${p}`, async (c) => {
      const crudBuilder = new CrudBuilder(params);
      await crudBuilder.add(c);
    });
    this.get(`${p}/:id`, async (c) => {
      const crudBuilder = new CrudBuilder(params);
      await crudBuilder.getById(c);
    });
    this.put(`${p}/:id`, async (c) => {
      const crudBuilder = new CrudBuilder(params);
      await crudBuilder.update(c);
    });
    this.patch(`${p}/:id`, async (c) => {
      const crudBuilder = new CrudBuilder(params);
      await crudBuilder.update(c);
    });
    this.delete(`${p}/:id`, async (c) => {
      const crudBuilder = new CrudBuilder(params);
      await crudBuilder.delete(c);
    });
    if (permissions?.protectedMethods) {
      const updteRoutesPermissions = (path, method) => {
        const key = `${method} ${path}`;
        if (!this.routesPermissions[`${key}`])
          this.routesPermissions[`${key}`] = [];
        this.routesPermissions[`${key}`].push(`${p.replace(/^\//, "")}.${method.toLowerCase()}`);
      };
      const methods = permissions?.protectedMethods?.[0] === "*" ? ["GET", "POST", "PUT", "PATCH", "DELETE"] : permissions?.protectedMethods;
      for (const method of methods) {
        if (method === "POST" || method === "GET")
          updteRoutesPermissions(`${p}`, method);
        if (method !== "POST")
          updteRoutesPermissions(`${p}/:id`, method);
      }
    }
  }
  errors(err) {
    const errArr = Array.isArray(err) ? err : [err];
    errArr.map((e) => this.routesErrors = { ...this.routesErrors, ...e });
  }
  emailTemplates(template) {
    this.routesEmailTemplates = { ...this.routesEmailTemplates, ...template };
  }
}
export {
  Routings,
  CrudBuilder
};
