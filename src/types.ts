import type { Context, MiddlewareHandler, Handler } from 'hono';
import type { H } from 'hono/types';
import type { Knex } from 'knex';

export type { MiddlewareHandler, Handler };

export type MethodsType = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'OPTIONS';

export type MethodPathType = {
  method?: MethodsType;
  path: string;
};

export type RoutesType = MethodPathType & {
  handlers: (Handler | MiddlewareHandler)[];
};

export type PushToRoutesParamsType = MethodPathType & {
  fnArr: H[];
};

// -- FIX: proper env typing --------------------------------

export type ColumnInfo = {
  data_type: 'string' | 'integer' | 'boolean' | 'file' | 'date'
    | 'timestamp' | 'json' | 'jsonb' | 'text' | 'uuid' | (string & {});
  is_nullable: 'YES' | 'NO';
  column_default?: string | null;
  character_maximum_length?: number | null;
};

export type ColumnInfoMap = Record<string, ColumnInfo>;

export type UserType = {
  id: string | number;
  roles?: string[];
  [key: string]: unknown;
};

export interface RolesService {
  getPermissions(roles?: string[]): Record<string, boolean>;
  checkWildcardPermissions(params: {
    key: string;
    permissions: Record<string, boolean>;
  }): boolean;
}

export type EnvBindings = {
  db: Knex;
  dbWrite: Knex;
  dbTables: Record<string, ColumnInfoMap>;
  roles?: RolesService;
  error?: (code: string, status?: number) => void;
  getErrorByMessage?: (message: string) => unknown;
  log?: (...args: unknown[]) => void;
};

export type VarBindings = {
  user?: UserType;
  result?: unknown;
  meta?: metaType | Record<string, unknown>;
  relationsData?: Record<string, CrudBuilderOptionsType>;
};

export type AppContext = Context<{
  Bindings: EnvBindings & Record<string, unknown>;
  Variables: VarBindings & Record<string, unknown>;
}>;

// -- Route-level types -------------------------------------

export type RouteErrorType = {
  code: number;
  status: number;
  description?: string;
};

export type RoutesErrorsType = Record<string, RouteErrorType>;

export type EmailTemplateType = {
  subject?: string;
  text?: string;
  html?: string;
};

export type RoutesEmailTemplatesType = Record<string, EmailTemplateType>;

export type RoutingsOptionsType = {
  migrationDirs?: string[];
};

// -- FIX: eliminate `any`, add proper field types ----------

export type StringRecord = Record<string, string>;
export type FieldValue = string | number | boolean | null;
export type FieldRecord = Record<string, FieldValue>;
export type WhereParams = Record<string, string | string[] | boolean | null>;

// -- backward compat aliases -------------------------------
export type stringRecordType = StringRecord;
export type fieldRecordType = FieldRecord;
export type whereParamsType = WhereParams;
export type DbTablesType = ColumnInfoMap;

// -- Join configuration ------------------------------------

export type CrudBuilderJoinType = {
  table: string;
  schema?: string;
  alias?: string;
  as?: string;
  where?: string;
  whereBindings?: StringRecord;
  defaultValue?: FieldValue;
  fields?: (string | Record<string, string>)[];
  field?: string;
  orderBy?: string;
  limit?: number;
  leftJoin?: string | [string, string, string];
  byIndex?: number;
  permission?: string;
};

// -- Permissions -------------------------------------------

export type CrudBuilderPermissionsType = {
  protectedMethods?: (MethodsType | '*')[];
  owner?: string[];
  fields?: {
    viewable?: Record<string, string[]>;
    editable?: Record<string, string[]>;
  };
};

// -- CRUD action names and access records ------------------

export type CrudAction = 'get' | 'add' | 'update' | 'delete';
export type AccessRecord = Partial<Record<'read' | 'create' | 'update' | 'delete', boolean | string>>;
export type ActionFlags = Partial<Record<CrudAction, boolean>>;

// -- FIX: generic result types -----------------------------

export type CrudBuilderOptionsType<T extends Record<string, unknown> = Record<string, unknown>> = {
  c?: AppContext;
  table: string;
  prefix?: string;
  schema?: string;
  aliases?: StringRecord;
  join?: CrudBuilderJoinType[];
  joinOnDemand?: CrudBuilderJoinType[];
  leftJoin?: [string, string, string][];
  leftJoinDistinct?: boolean;
  lang?: string;
  translate?: string[];
  searchFields?: string[];
  requiredFields?: Record<string, string>;
  hiddenFields?: string[];
  readOnlyFields?: string[];
  permissions?: CrudBuilderPermissionsType;

  defaultWhere?: FieldRecord;
  defaultWhereRaw?: string;
  defaultSort?: string;
  sortRaw?: string;
  fieldsRaw?: string[];
  includeDeleted?: boolean;
  deletedReplacements?: FieldRecord;
  relations?: Record<string, CrudBuilderOptionsType>;
  relationIdName?: string;

  tokenRequired?: CrudAction[];
  ownerRequired?: CrudAction[];
  rootRequired?: CrudAction[];
  access?: AccessRecord;
  accessByStatuses?: AccessRecord;
  dbTables?: ColumnInfoMap;
  cache?: { ttl?: number };
  userIdFieldName?: string;
  additionalFields?: Partial<Record<CrudAction | 'get', Record<string, unknown>>>;
  apiClientMethodNames?: StringRecord;
};

// -- Meta / Result -----------------------------------------

export type metaType = {
  total: number;
  limit?: number;
  skip?: number;
  page?: number;
  nextPage?: number;
  pages?: number;
  after?: string;
  nextAfter?: string;
  isFirstPage?: boolean;
  isLastPage?: boolean;
};

export type getResultType<T = Record<string, unknown>> = {
  result: T[];
  meta: metaType;
  relations?: Record<string, unknown[]>;
  error?: boolean;
};

// -- FIX: per-request mutable state type -------------------

export type RequestState = {
  res: Knex.QueryBuilder;
  rows: ColumnInfoMap;
  user: UserType | undefined;
  roles: RolesService | undefined;
  lang: string;
  coalesceWhere: Record<string, string>;
  coalesceWhereReplacements: Record<string, unknown>;
  langJoin: Record<string, string>;
};

export type HiddenFieldsResult = {
  regular: string[];
  owner: string[];
};
