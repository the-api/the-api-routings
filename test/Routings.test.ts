import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { Routings } from '../src/Routings';

describe('Routings', () => {

  // ── Constructor ──────────────────────────────────

  describe('constructor', () => {
    it('creates instance with empty routes', () => {
      const r = new Routings();
      expect(r.routes).toEqual([]);
      expect(r.routesErrors).toEqual({});
      expect(r.routesEmailTemplates).toEqual({});
      expect(r.routesPermissions).toEqual({});
    });

    it('stores migrationDirs', () => {
      const r = new Routings({ migrationDirs: ['/migrations'] });
      expect(r.migrationDirs).toEqual(['/migrations']);
    });

    it('handles missing options', () => {
      const r = new Routings();
      expect(r.migrationDirs).toBeUndefined();
    });
  });

  // ── HTTP method helpers ──────────────────────────

  describe.each([
    ['get', 'GET'],
    ['post', 'POST'],
    ['patch', 'PATCH'],
    ['put', 'PUT'],
    ['delete', 'DELETE'],
  ] as const)('%s()', (method, httpMethod) => {
    it(`registers ${httpMethod} route`, () => {
      const r = new Routings();
      const handler = mock(async () => {});
      (r as any)[method]('/test', handler);

      expect(r.routes).toHaveLength(1);
      expect(r.routes[0].method).toBe(httpMethod);
      expect(r.routes[0].path).toBe('/test');
      expect(r.routes[0].handlers).toHaveLength(1);
    });
  });

  describe('use()', () => {
    it('registers route without method', () => {
      const r = new Routings();
      const handler = mock(async () => {});
      r.use('/mid', handler);

      expect(r.routes).toHaveLength(1);
      expect(r.routes[0].method).toBeUndefined();
      expect(r.routes[0].path).toBe('/mid');
    });
  });

  describe('all()', () => {
    it('registers wildcard route', () => {
      const r = new Routings();
      r.all(mock(async () => {}));

      expect(r.routes).toHaveLength(1);
      expect(r.routes[0].path).toBe('*');
    });
  });

  describe('multiple handlers', () => {
    it('creates separate route entry per handler', () => {
      const r = new Routings();
      const h1 = mock(async () => {});
      const h2 = mock(async () => {});
      r.get('/multi', h1, h2);

      expect(r.routes).toHaveLength(2);
      expect(r.routes[0].path).toBe('/multi');
      expect(r.routes[1].path).toBe('/multi');
    });
  });

  // ── crud() ───────────────────────────────────────

  describe('crud()', () => {
    let r: Routings;

    beforeEach(() => {
      r = new Routings();
    });

    it('creates 6 routes for a table', () => {
      r.crud({ table: 'users' });
      expect(r.routes).toHaveLength(6);
    });

    it('registers correct methods and paths', () => {
      r.crud({ table: 'users' });

      const methods = r.routes.map((rt) => `${rt.method} ${rt.path}`);
      expect(methods).toContain('GET /users');
      expect(methods).toContain('POST /users');
      expect(methods).toContain('GET /users/:id');
      expect(methods).toContain('PUT /users/:id');
      expect(methods).toContain('PATCH /users/:id');
      expect(methods).toContain('DELETE /users/:id');
    });

    it('uses prefix when provided', () => {
      r.crud({ table: 'users', prefix: 'api/users' });

      const paths = r.routes.map((rt) => rt.path);
      expect(paths).toContain('/api/users');
      expect(paths).toContain('/api/users/:id');
    });

    it('normalizes leading slashes in prefix', () => {
      r.crud({ table: 'users', prefix: '/api/users' });

      const paths = r.routes.map((rt) => rt.path);
      expect(paths[0]).toBe('/api/users');
    });

    it('sets routesPermissions for protectedMethods wildcard', () => {
      r.crud({
        table: 'posts',
        permissions: { protectedMethods: ['*'] },
      });

      expect(r.routesPermissions['GET /posts']).toContain('posts.get');
      expect(r.routesPermissions['POST /posts']).toContain('posts.post');
      expect(r.routesPermissions['GET /posts/:id']).toContain('posts.get');
      expect(r.routesPermissions['PUT /posts/:id']).toContain('posts.put');
      expect(r.routesPermissions['PATCH /posts/:id']).toContain('posts.patch');
      expect(r.routesPermissions['DELETE /posts/:id']).toContain('posts.delete');
    });

    it('sets routesPermissions for specific methods', () => {
      r.crud({
        table: 'posts',
        permissions: { protectedMethods: ['GET', 'DELETE'] },
      });

      expect(r.routesPermissions['GET /posts']).toContain('posts.get');
      expect(r.routesPermissions['GET /posts/:id']).toContain('posts.get');
      expect(r.routesPermissions['DELETE /posts/:id']).toContain('posts.delete');
      expect(r.routesPermissions['POST /posts']).toBeUndefined();
    });

    it('does not set routesPermissions when no protectedMethods', () => {
      r.crud({ table: 'posts' });
      expect(Object.keys(r.routesPermissions)).toHaveLength(0);
    });
  });

  // ── errors() ─────────────────────────────────────

  describe('errors()', () => {
    it('registers error definitions', () => {
      const r = new Routings();
      r.errors({ NOT_FOUND: { code: 1, status: 404 } });

      expect(r.routesErrors.NOT_FOUND).toEqual({ code: 1, status: 404 });
    });

    it('merges multiple error objects', () => {
      const r = new Routings();
      r.errors({ ERR_A: { code: 1, status: 400 } });
      r.errors({ ERR_B: { code: 2, status: 500 } });

      expect(r.routesErrors.ERR_A).toBeDefined();
      expect(r.routesErrors.ERR_B).toBeDefined();
    });

    it('accepts array of error objects', () => {
      const r = new Routings();
      r.errors([
        { ERR_A: { code: 1, status: 400 } },
        { ERR_B: { code: 2, status: 500 } },
      ]);

      expect(r.routesErrors.ERR_A).toBeDefined();
      expect(r.routesErrors.ERR_B).toBeDefined();
    });
  });

  // ── emailTemplates() ────────────────────────────

  describe('emailTemplates()', () => {
    it('registers email templates', () => {
      const r = new Routings();
      r.emailTemplates({
        welcome: { subject: 'Hello', text: 'Welcome!' },
      });

      expect(r.routesEmailTemplates.welcome).toEqual({
        subject: 'Hello',
        text: 'Welcome!',
      });
    });

    it('merges templates', () => {
      const r = new Routings();
      r.emailTemplates({ a: { subject: 'A' } });
      r.emailTemplates({ b: { subject: 'B' } });

      expect(r.routesEmailTemplates.a).toBeDefined();
      expect(r.routesEmailTemplates.b).toBeDefined();
    });
  });
});
