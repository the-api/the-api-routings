import { createFactory } from 'hono/factory';
import CrudBuilder from './CrudBuilder';
import type {
  AppContext,
  CrudBuilderOptionsType,
  MethodsType,
  MiddlewareHandler,
  PushToRoutesParamsType,
  RoutesErrorsType,
  RoutesEmailTemplatesType,
  RoutesType,
  RoutingsOptionsType,
} from './types';

const factory = createFactory();

export class Routings {
  routes: RoutesType[] = [];
  routesPermissions: Record<string, string[]> = {};
  routesErrors: RoutesErrorsType = {};
  routesEmailTemplates: RoutesEmailTemplatesType = {};
  migrationDirs: string[] | undefined;

  constructor(options?: RoutingsOptionsType) {
    if (options?.migrationDirs) this.migrationDirs = options.migrationDirs;
  }

  private pushToRoutes({ method, path, fnArr }: PushToRoutesParamsType): void {
    for (const fn of fnArr) {
      const handlers = factory.createHandlers(fn);
      this.routes.push({ path, method, handlers });
    }
  }

  get(path: string, ...fnArr: MiddlewareHandler[]): void {
    this.pushToRoutes({ method: 'GET', path, fnArr });
  }

  post(path: string, ...fnArr: MiddlewareHandler[]): void {
    this.pushToRoutes({ method: 'POST', path, fnArr });
  }

  patch(path: string, ...fnArr: MiddlewareHandler[]): void {
    this.pushToRoutes({ method: 'PATCH', path, fnArr });
  }

  put(path: string, ...fnArr: MiddlewareHandler[]): void {
    this.pushToRoutes({ method: 'PUT', path, fnArr });
  }

  delete(path: string, ...fnArr: MiddlewareHandler[]): void {
    this.pushToRoutes({ method: 'DELETE', path, fnArr });
  }

  use(path: string, ...fnArr: MiddlewareHandler[]): void {
    this.pushToRoutes({ path, fnArr });
  }

  all(...fnArr: MiddlewareHandler[]): void {
    this.pushToRoutes({ path: '*', fnArr });
  }

  crud(params: CrudBuilderOptionsType): void {
    const { prefix, table, permissions } = params;
    const p = `/${prefix || table}`.replace(/^\/+/, '/');

    this.get(`${p}`, async (c) => {
      const cb = new CrudBuilder(params);
      await cb.get(c as AppContext);
    });
    this.post(`${p}`, async (c) => {
      const cb = new CrudBuilder(params);
      await cb.add(c as AppContext);
    });
    this.get(`${p}/:id`, async (c) => {
      const cb = new CrudBuilder(params);
      await cb.getById(c as AppContext);
    });
    this.put(`${p}/:id`, async (c) => {
      const cb = new CrudBuilder(params);
      await cb.update(c as AppContext);
    });
    this.patch(`${p}/:id`, async (c) => {
      const cb = new CrudBuilder(params);
      await cb.update(c as AppContext);
    });
    this.delete(`${p}/:id`, async (c) => {
      const cb = new CrudBuilder(params);
      await cb.delete(c as AppContext);
    });

    if (permissions?.protectedMethods) {
      const register = (path: string, method: string): void => {
        const key = `${method} ${path}`;
        if (!this.routesPermissions[key]) this.routesPermissions[key] = [];
        this.routesPermissions[key].push(`${p.replace(/^\//, '')}.${method.toLowerCase()}`);
      };

      const methods: MethodsType[] = permissions.protectedMethods[0] === '*'
        ? ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
        : (permissions.protectedMethods as MethodsType[]);

      for (const method of methods) {
        if (method === 'POST' || method === 'GET') register(p, method);
        if (method !== 'POST') register(`${p}/:id`, method);
      }
    }
  }

  errors(err: RoutesErrorsType | RoutesErrorsType[]): void {
    const errArr = Array.isArray(err) ? err : [err];
    for (const e of errArr) this.routesErrors = { ...this.routesErrors, ...e };
  }

  emailTemplates(template: RoutesEmailTemplatesType): void {
    this.routesEmailTemplates = { ...this.routesEmailTemplates, ...template };
  }
}
