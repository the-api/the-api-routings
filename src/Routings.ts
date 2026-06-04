import { createFactory } from 'hono/factory';
import CrudBuilder from './CrudBuilder';
import type {
  AppContext,
  CrudPermissionMeta,
  CrudBuilderOptionsType,
  MethodsType,
  MiddlewareHandler,
  PushToRoutesParamsType,
  RoutesErrorsType,
  RoutesEmailTemplatesType,
  RoutesType,
  RoutingsOptionsType,
} from './types';
import { normalizeCrudConfig } from './crudConfig';
import { createCrudValidationMiddleware } from './Validatior';

const factory = createFactory();

export class Routings {
  routes: RoutesType[] = [];
  routesPermissions: Record<string, string[]> = {};
  routesErrors: RoutesErrorsType = {};
  routesEmailTemplates: RoutesEmailTemplatesType = {};
  crudPermissionsMeta: CrudPermissionMeta[] = [];
  migrationDirs: string[] | undefined;
  private pathPrefix = '';

  constructor(options?: RoutingsOptionsType) {
    if (options?.migrationDirs) this.migrationDirs = options.migrationDirs;
  }

  private pushToRoutes({ method, path, fnArr }: PushToRoutesParamsType): void {
    for (const fn of fnArr) {
      const handlers = factory.createHandlers(fn);
      this.routes.push({ path, method, handlers });
    }
  }

  prefix(path: string): Routings {
    this.pathPrefix = path;
    return this;
  }

  get(p: string, ...fnArr: MiddlewareHandler[]): Routings {
    const path = `${this.pathPrefix}${p}`.replace(/^\/+/g, '/');
    this.pushToRoutes({ method: 'GET', path, fnArr });
    return this;
  }

  post(p: string, ...fnArr: MiddlewareHandler[]): Routings {
    const path = `${this.pathPrefix}${p}`.replace(/^\/+/g, '/');
    this.pushToRoutes({ method: 'POST', path, fnArr });
    return this;
  }

  patch(p: string, ...fnArr: MiddlewareHandler[]): Routings {
    const path = `${this.pathPrefix}${p}`.replace(/^\/+/g, '/');
    this.pushToRoutes({ method: 'PATCH', path, fnArr });
    return this;
  }

  delete(p: string, ...fnArr: MiddlewareHandler[]): Routings {
    const path = `${this.pathPrefix}${p}`.replace(/^\/+/g, '/');
    this.pushToRoutes({ method: 'DELETE', path, fnArr });
    return this;
  }

  use(p: string, ...fnArr: MiddlewareHandler[]): Routings {
    const path = `${this.pathPrefix}${p}`.replace(/^\/+/g, '/');
    this.pushToRoutes({ path, fnArr });
    return this;
  }

  all(...fnArr: MiddlewareHandler[]): Routings {
    const path = `${this.pathPrefix}*`.replace(/^\/+/g, '/');
    this.pushToRoutes({ path, fnArr });
    return this;
  }

  crud(params: CrudBuilderOptionsType): void {
    const normalizedParams = normalizeCrudConfig(params);
    const { prefix, table, permissions } = normalizedParams;
    const p = `/${prefix || table}`.replace(/^\/+/, '/');
    const permissionPrefix = p.replace(/^\//, '');
    const methods = permissions?.methods || permissions?.protectedMethods;
    const methodsConfigured = Array.isArray(methods);
    const hasExplicitOwnerPermissions = !!normalizedParams.permissions?.owner?.length;

    const validate = createCrudValidationMiddleware(normalizedParams);
    const createCrudBuilder = (c: AppContext): CrudBuilder => {
      const cb = new CrudBuilder(normalizedParams);
      if (hasExplicitOwnerPermissions) return cb;

      const roles = c.var.roles;
      if (!roles || typeof roles.getPermissions !== 'function') return cb;

      const ownerPermissions = roles.getPermissions(['owner']);
      if (!ownerPermissions || typeof ownerPermissions !== 'object') return cb;

      (cb as unknown as { ownerPermissions: Record<string, boolean> }).ownerPermissions = ownerPermissions;
      return cb;
    };

    this.get(`${p}`, validate('get') as never, async (c) => {
      const cb = createCrudBuilder(c as AppContext);
      await cb.get(c as AppContext);
    });
    this.post(`${p}`, validate('post') as never, async (c) => {
      const cb = createCrudBuilder(c as AppContext);
      await cb.add(c as AppContext);
    });
    this.get(`${p}/:id`, validate('get') as never, async (c) => {
      const cb = createCrudBuilder(c as AppContext);
      await cb.getById(c as AppContext);
    });
    this.patch(`${p}/:id`, validate('patch') as never, async (c) => {
      const cb = createCrudBuilder(c as AppContext);
      await cb.update(c as AppContext);
    });
    this.delete(`${p}/:id`, validate('delete') as never, async (c) => {
      const cb = createCrudBuilder(c as AppContext);
      await cb.delete(c as AppContext);
    });

    this.crudPermissionsMeta.push({
      path: `${this.pathPrefix}${p}`,
      permissionPrefix,
      methodsConfigured,
      tableName: table,
    });

    if (methods?.length) {
      const register = (path: string, method: string): void => {
        const key = `${method} ${path}`;
        if (!this.routesPermissions[key]) this.routesPermissions[key] = [];
        this.routesPermissions[key].push(`${permissionPrefix}.${method.toLowerCase()}`);
      };

      const protectedMethods: MethodsType[] = methods[0] === '*'
        ? ['GET', 'POST', 'PATCH', 'DELETE']
        : (methods as MethodsType[]);

      for (const method of protectedMethods) {
        if (method === 'POST' || method === 'GET') register(p, method);
        if (method !== 'POST') register(`${p}/:id`, method);
      }
    }
  }

  errors(err: RoutesErrorsType | RoutesErrorsType[]): void {
    const errArr = Array.isArray(err) ? err : [err];
    for (const e of errArr) Object.assign(this.routesErrors, e);
  }

  emailTemplates(template: RoutesEmailTemplatesType): void {
    Object.assign(this.routesEmailTemplates, template);
  }
}
