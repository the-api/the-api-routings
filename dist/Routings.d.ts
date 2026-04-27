import type { CrudPermissionMeta, CrudBuilderOptionsType, MiddlewareHandler, RoutesErrorsType, RoutesEmailTemplatesType, RoutesType, RoutingsOptionsType } from './types';
export declare class Routings {
    routes: RoutesType[];
    routesPermissions: Record<string, string[]>;
    routesErrors: RoutesErrorsType;
    routesEmailTemplates: RoutesEmailTemplatesType;
    crudPermissionsMeta: CrudPermissionMeta[];
    migrationDirs: string[] | undefined;
    private pathPrefix;
    constructor(options?: RoutingsOptionsType);
    private pushToRoutes;
    prefix(path: string): Routings;
    get(p: string, ...fnArr: MiddlewareHandler[]): Routings;
    post(p: string, ...fnArr: MiddlewareHandler[]): Routings;
    patch(p: string, ...fnArr: MiddlewareHandler[]): Routings;
    delete(p: string, ...fnArr: MiddlewareHandler[]): Routings;
    use(p: string, ...fnArr: MiddlewareHandler[]): Routings;
    all(...fnArr: MiddlewareHandler[]): Routings;
    crud(params: CrudBuilderOptionsType): void;
    errors(err: RoutesErrorsType | RoutesErrorsType[]): void;
    emailTemplates(template: RoutesEmailTemplatesType): void;
}
//# sourceMappingURL=Routings.d.ts.map