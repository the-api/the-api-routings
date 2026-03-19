import type { Context, MiddlewareHandler, Handler } from 'hono';
import type { H } from 'hono/types';
import type { Knex } from 'knex';
export type { MiddlewareHandler, Handler };
export type MethodsType = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'OPTIONS';
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
export type DbColumnInfo = {
    column_name?: string;
    data_type: 'string' | 'integer' | 'boolean' | 'file' | 'date' | 'timestamp' | 'json' | 'jsonb' | 'text' | 'uuid' | (string & {});
    is_nullable: 'YES' | 'NO';
    table_schema?: string;
    table_name?: string;
    column_default?: string | null;
    udt_name?: string;
    is_primary_key?: boolean;
    check_min?: number;
    check_max?: number;
    check_enum?: unknown[];
    enum_values?: unknown[];
    references?: {
        table_schema: string;
        constraint_name: string;
        table_name: string;
        column_name: string;
        foreign_table_schema: string;
        foreign_table_name: string;
        foreign_column_name: string;
    };
    character_maximum_length?: number | null;
    [key: string]: unknown;
};
export type ColumnInfo = DbColumnInfo;
export type ColumnInfoMap = Record<string, DbColumnInfo>;
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
export type ContextServices = {
    db?: Knex;
    dbWrite?: Knex;
    dbTables?: Record<string, ColumnInfoMap>;
    roles?: RolesService;
    error?: (code: string, status?: number) => void;
    getErrorByMessage?: (message: string) => RouteErrorType | undefined;
    log?: (...args: unknown[]) => void;
};
export type EnvBindings = ContextServices;
export type VarBindings = ContextServices & {
    user?: UserType;
    result?: unknown;
    meta?: metaType | Record<string, unknown>;
    relationsData?: Record<string, CrudBuilderOptionsType>;
};
export type AppContext = Context<any>;
export type RouteErrorType = {
    code: number;
    status: number;
    description?: string;
};
export type RoutesErrorsType = Record<string, RouteErrorType>;
export type AdditionalMessageType = {
    message: string;
    [key: string]: unknown;
};
export type EmailTemplateType = {
    subject?: string;
    text?: string;
    html?: string;
};
export type RoutesEmailTemplatesType = Record<string, EmailTemplateType>;
export type RoutingsOptionsType = {
    migrationDirs?: string[];
};
export type CrudPermissionMeta = {
    path: string;
    permissionPrefix: string;
    methodsConfigured: boolean;
    tableName: string;
};
export type StringRecord = Record<string, string>;
export type FieldValue = string | number | boolean | null;
export type FieldRecord = Record<string, FieldValue>;
export type WhereParams = Record<string, string | string[] | boolean | null>;
export type stringRecordType = StringRecord;
export type fieldRecordType = FieldRecord;
export type whereParamsType = WhereParams;
export type DbTablesType = ColumnInfoMap;
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
export type CrudBuilderFieldRulesType = {
    hidden?: string[];
    readOnly?: string[];
    visibleFor?: Record<string, string[]>;
    editableFor?: Record<string, string[]>;
};
export type CrudBuilderPermissionsType = {
    methods?: (MethodsType | '*')[];
    protectedMethods?: (MethodsType | '*')[];
    owner?: string[];
    fields?: {
        viewable?: Record<string, string[]>;
        editable?: Record<string, string[]>;
    };
};
export type ValidationType = 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'array' | 'object';
export type ValidationFieldType = ValidationType | ValidationType[];
export type ValidationFieldSchema = {
    type?: ValidationFieldType;
    required?: boolean;
    enum?: unknown[];
    min?: number;
    max?: number;
    preprocess?: (value: unknown) => unknown;
    items?: ValidationFieldSchema;
    properties?: Record<string, ValidationFieldSchema>;
    [key: string]: unknown;
};
export type ValidationSchema = Record<string, ValidationFieldSchema>;
export type ValidationErrorItem = {
    field: string;
    message: string;
    expected?: Record<string, unknown>;
    value: unknown;
};
export type ValidationResolverResult = ValidationSchema | ValidationErrorItem[] | {
    errors?: ValidationErrorItem[];
} | null | undefined | unknown;
export type ValidationResolver = (c: AppContext, next: () => Promise<void>) => Promise<ValidationResolverResult> | ValidationResolverResult;
export type ValidationSection = ValidationSchema | ValidationResolver;
export type CrudValidationOptions = {
    params?: ValidationSection;
    query?: ValidationSection;
    headers?: ValidationSection;
    body?: {
        post?: ValidationSection;
        patch?: ValidationSection;
    };
};
export type CrudAction = 'get' | 'add' | 'update' | 'delete';
export type AccessRecord = Partial<Record<'read' | 'create' | 'update' | 'delete', boolean | string>>;
export type ActionFlags = Partial<Record<CrudAction, boolean>>;
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
    fieldRules?: CrudBuilderFieldRulesType;
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
    cache?: {
        ttl?: number;
    };
    userIdFieldName?: string;
    additionalFields?: Partial<Record<CrudAction | 'get', Record<string, unknown>>>;
    apiClientMethodNames?: StringRecord;
    validation?: CrudValidationOptions;
};
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
//# sourceMappingURL=types.d.ts.map