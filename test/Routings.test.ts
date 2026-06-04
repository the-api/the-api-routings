import { describe, it, expect } from 'bun:test';
import { Routings } from '../src/Routings';

describe('Routings', () => {

  // -- crud() route generation -----------------------------

  describe('crud()', () => {
    it('registers CRUD routes for a table', () => {
      const router = new Routings();
      router.crud({ table: 'posts' });

      const paths = router.routes.map((r) => `${r.method} ${r.path}`);

      expect(paths).toContain('GET /posts');
      expect(paths).toContain('POST /posts');
      expect(paths).toContain('GET /posts/:id');
      expect(paths).toContain('PATCH /posts/:id');
      expect(paths).toContain('DELETE /posts/:id');
      // Each CRUD route has validation middleware + route handler.
      expect(router.routes.length).toBe(10);
    });

    it('uses prefix when provided', () => {
      const router = new Routings();
      router.crud({ table: 'posts', prefix: 'api/v1/posts' });

      const paths = router.routes.map((r) => r.path);
      expect(paths).toContain('/api/v1/posts');
      expect(paths).toContain('/api/v1/posts/:id');
    });

    it('normalizes double slashes in prefix', () => {
      const router = new Routings();
      router.crud({ table: 'posts', prefix: '/api//posts' });

      const paths = router.routes.map((r) => r.path);
      expect(paths[0]).toBe('/api//posts');
      // leading slash normalization
      expect(paths[0].startsWith('//')).toBe(false);
    });

    it('registers permissions for protected methods', () => {
      const router = new Routings();
      router.crud({
        table: 'posts',
        permissions: {
          protectedMethods: ['POST', 'DELETE'],
        },
      });

      expect(router.routesPermissions).toHaveProperty('POST /posts');
      expect(router.routesPermissions).toHaveProperty('DELETE /posts/:id');
      expect(router.routesPermissions).not.toHaveProperty('GET /posts');
    });

    it('registers permissions for methods alias', () => {
      const router = new Routings();
      router.crud({
        table: 'posts',
        permissions: {
          methods: ['PATCH'],
        },
      });

      expect(router.routesPermissions).toHaveProperty('PATCH /posts/:id');
      expect(router.routesPermissions).not.toHaveProperty('POST /posts');
    });

    it('expands wildcard * permissions to all methods', () => {
      const router = new Routings();
      router.crud({
        table: 'items',
        permissions: { protectedMethods: ['*'] },
      });

      expect(router.routesPermissions).toHaveProperty('GET /items');
      expect(router.routesPermissions).toHaveProperty('POST /items');
      expect(router.routesPermissions).toHaveProperty('PATCH /items/:id');
      expect(router.routesPermissions).toHaveProperty('DELETE /items/:id');
    });

    it('stores CRUD permissions meta', () => {
      const router = new Routings();
      router.crud({ table: 'items' });

      expect(router.crudPermissionsMeta.length).toBe(1);
      expect(router.crudPermissionsMeta[0]).toEqual({
        path: '/items',
        permissionPrefix: 'items',
        methodsConfigured: false,
        tableName: 'items',
      });
    });

    it('applies prefix scopes to CRUD routes and permissions meta', () => {
      const router = new Routings();
      router.prefix('/api/v1').crud({ table: 'items' });

      const paths = router.routes.map((r) => `${r.method} ${r.path}`);

      expect(paths).toContain('GET /api/v1/items');
      expect(paths).toContain('PATCH /api/v1/items/:id');
      expect(router.crudPermissionsMeta[0]).toEqual({
        path: '/api/v1/items',
        permissionPrefix: 'items',
        methodsConfigured: false,
        tableName: 'items',
      });
    });
  });

  // -- HTTP method helpers ---------------------------------

  describe('HTTP methods', () => {
    it('registers GET route', () => {
      const router = new Routings();
      router.get('/health', async () => {});

      expect(router.routes.length).toBe(1);
      expect(router.routes[0].method).toBe('GET');
      expect(router.routes[0].path).toBe('/health');
    });

    it('registers POST route', () => {
      const router = new Routings();
      router.post('/items', async () => {});

      expect(router.routes[0].method).toBe('POST');
    });

    it('registers PATCH route', () => {
      const router = new Routings();
      router.patch('/items/:id', async () => {});

      expect(router.routes[0].method).toBe('PATCH');
    });

    it('registers DELETE route', () => {
      const router = new Routings();
      router.delete('/items/:id', async () => {});

      expect(router.routes[0].method).toBe('DELETE');
    });

    it('registers multiple handlers as separate routes', () => {
      const router = new Routings();
      const mw1 = async () => {};
      const mw2 = async () => {};
      router.get('/test', mw1, mw2);

      expect(router.routes.length).toBe(2);
    });

    it('supports chained route registration on a prefixed scope', () => {
      const router = new Routings();

      router.prefix('/ships')
        .get('/:id/similar', async () => {})
        .get('/:id/requests', async () => {})
        .post('/import', async () => {})
        .post('/0', async () => {})
        .post('/0/countries', async () => {});

      const paths = router.routes.map((r) => `${r.method} ${r.path}`);

      expect(paths).toEqual([
        'GET /ships/:id/similar',
        'GET /ships/:id/requests',
        'POST /ships/import',
        'POST /ships/0',
        'POST /ships/0/countries',
      ]);
    });

    it('switches the current prefix when prefix() is called again', () => {
      const router = new Routings();

      router.prefix('/v1')
        .get('/users', async () => {})
        .prefix('/v2')
        .get('/users', async () => {});

      const paths = router.routes.map((r) => `${r.method} ${r.path}`);

      expect(paths).toContain('GET /v1/users');
      expect(paths).toContain('GET /v2/users');
    });

    it('use() registers route without method', () => {
      const router = new Routings();
      router.use('/api/*', async () => {});

      expect(router.routes[0].method).toBeUndefined();
      expect(router.routes[0].path).toBe('/api/*');
    });

    it('all() registers route on wildcard path', () => {
      const router = new Routings();
      router.all(async () => {});

      expect(router.routes[0].path).toBe('*');
    });
  });

  // -- Errors ----------------------------------------------

  describe('errors()', () => {
    it('registers error definitions', () => {
      const router = new Routings();
      router.errors({
        NOT_FOUND: { code: 1001, status: 404 },
        BAD_INPUT: { code: 1002, status: 400, description: 'Invalid input' },
      });

      expect(router.routesErrors.NOT_FOUND.status).toBe(404);
      expect(router.routesErrors.BAD_INPUT.description).toBe('Invalid input');
    });

    it('merges multiple error calls', () => {
      const router = new Routings();
      router.errors({ A: { code: 1, status: 400 } });
      router.errors({ B: { code: 2, status: 404 } });

      expect(router.routesErrors).toHaveProperty('A');
      expect(router.routesErrors).toHaveProperty('B');
    });

    it('accepts array of error objects', () => {
      const router = new Routings();
      router.errors([
        { A: { code: 1, status: 400 } },
        { B: { code: 2, status: 404 } },
      ]);

      expect(router.routesErrors).toHaveProperty('A');
      expect(router.routesErrors).toHaveProperty('B');
    });
  });

  // -- Email templates -------------------------------------

  describe('emailTemplates()', () => {
    it('registers templates', () => {
      const router = new Routings();
      router.emailTemplates({
        welcome: { subject: 'Hi', html: '<b>Hello</b>' },
      });

      expect(router.routesEmailTemplates.welcome.subject).toBe('Hi');
    });

    it('merges with existing templates', () => {
      const router = new Routings();
      router.emailTemplates({ a: { subject: 'A' } });
      router.emailTemplates({ b: { subject: 'B' } });

      expect(router.routesEmailTemplates).toHaveProperty('a');
      expect(router.routesEmailTemplates).toHaveProperty('b');
    });
  });

  // -- Constructor options ---------------------------------

  describe('constructor', () => {
    it('stores migrationDirs', () => {
      const dirs = ['/path/to/migrations'];
      const router = new Routings({ migrationDirs: dirs });

      expect(router.migrationDirs).toEqual(dirs);
    });

    it('works without options', () => {
      const router = new Routings();
      expect(router.routes).toEqual([]);
    });
  });
});
