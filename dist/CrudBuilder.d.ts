import type { ActionFlags, AccessRecord, AppContext, ColumnInfoMap, CrudBuilderJoinType, CrudBuilderOptionsType, FieldRecord, StringRecord, getResultType } from './types';
export default class CrudBuilder<T extends Record<string, unknown> = Record<string, unknown>> {
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
    readonly cache: {
        ttl?: number;
    } | undefined;
    readonly userIdFieldName: string;
    readonly additionalFields: Partial<Record<string, Record<string, unknown>>>;
    readonly apiClientMethodNames: StringRecord;
    readonly relations: Record<string, CrudBuilderOptionsType> | undefined;
    private state;
    constructor(options: CrudBuilderOptionsType<T>);
    private initState;
    private getDbWithSchema;
    private getKnownColumnNames;
    private isValidSortField;
    private isValidWhereKey;
    private sort;
    private pagination;
    private where;
    private fields;
    private checkDeleted;
    private getJoinFields;
    private getHiddenFields;
    private deleteHiddenFieldsFromResult;
    private filterDataByTableColumns;
    private updateData;
    private updateIncomingData;
    optionsGet(): {
        tokenRequired: string | boolean;
        ownerRequired: boolean;
        rootRequired: boolean;
        joinFields: Record<string, string>;
        cache: {
            ttl?: number;
        };
        joinOnDemand: CrudBuilderJoinType[];
        accessByStatuses: string | boolean;
        additionalFields: Record<string, unknown>;
        queryParameters: {
            _search: string;
            _fields: {
                type: string;
                example: string;
            };
            _sort: {
                type: string;
                example: string;
            };
            _join: {
                type: string;
                example: string;
            };
            _limit: string;
            _page: string;
            _skip: string;
            _lang: string;
        };
        apiClientMethodNames: StringRecord;
    };
    optionsGetById(): {
        tokenRequired: string | boolean;
        ownerRequired: boolean;
        rootRequired: boolean;
        joinFields: Record<string, string>;
        joinOnDemand: CrudBuilderJoinType[];
        accessByStatuses: string | boolean;
        additionalFields: Record<string, unknown>;
        cache: {
            ttl?: number;
        };
        apiClientMethodNames: StringRecord;
    };
    optionsAdd(): {
        tokenRequired: string | boolean;
        ownerRequired: boolean;
        rootRequired: boolean;
        readOnlyFields: string[];
        requiredFields: string[];
        accessByStatuses: string | boolean;
        apiClientMethodNames: StringRecord;
        schema: Record<string, unknown>;
    };
    optionsUpdate(): {
        tokenRequired: string | boolean;
        ownerRequired: boolean;
        rootRequired: boolean;
        readOnlyFields: string[];
        accessByStatuses: string | boolean;
        additionalFields: Record<string, unknown>;
        apiClientMethodNames: StringRecord;
        schema: Record<string, unknown>;
    };
    optionsDelete(): {
        tokenRequired: string | boolean;
        ownerRequired: boolean;
        rootRequired: boolean;
        accessByStatuses: string | boolean;
        apiClientMethodNames: StringRecord;
    };
    get(c: AppContext): Promise<void>;
    getRequestResult(c: AppContext, q?: Record<string, string[]>): Promise<getResultType<T>>;
    getById(c: AppContext): Promise<void>;
    add(c: AppContext): Promise<void>;
    private validateIntegerFields;
    update(c: AppContext): Promise<void>;
    delete(c: AppContext): Promise<void>;
}
//# sourceMappingURL=CrudBuilder.d.ts.map