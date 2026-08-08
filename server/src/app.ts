/**
 * Fastify app assembly.
 *
 * buildApp() is kept separate from listen() so tests can use app.inject() without
 * binding a socket.
 *
 * One process serves everything, in development and production alike. In dev, Vite
 * runs in middleware mode inside this server; in production the same routes serve
 * client/dist. That means one origin (:3000) either way — no proxy, no CORS, and no
 * class of bug that only appears in one mode.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import {
    serializerCompiler,
    validatorCompiler,
    hasZodFastifySchemaValidationErrors,
} from 'fastify-type-provider-zod';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDb, migrate, type Db } from './db/index.js';
import { seed } from './db/seed.js';
import { invoiceRoutes } from './routes/invoices.js';
import { customerRoutes } from './routes/customers.js';
import { settingsRoutes } from './routes/settings.js';

declare module 'fastify' {
    interface FastifyInstance {
        db: Db;
    }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = resolve(__dirname, '..', '..', 'client');
const CLIENT_DIST = join(CLIENT_ROOT, 'dist');

export interface BuildOptions {
    dbPath?: string;
    logger?: boolean;
    /**
     * Serve the client alongside the API: Vite middleware in dev, client/dist in
     * production. Set false for tests, which only want the API.
     */
    serveClient?: boolean;
    /** Defaults to NODE_ENV !== 'production'. */
    dev?: boolean;
}

/**
 * Run Vite inside this server for development.
 *
 * Vite is loaded with a dynamic import so production never pulls it in, and it is
 * wired through the not-found handler rather than as a global middleware. That
 * ordering matters: Fastify matches its own routes first, so `/api/*` is resolved
 * before Vite ever sees the request. Mounting Vite globally would let its SPA
 * fallback answer API calls with index.html.
 *
 * `reply.hijack()` hands the raw socket to Vite — after it, Fastify stops managing
 * the response, which is what lets Vite stream modules and drive HMR.
 */
async function attachViteMiddleware(app: FastifyInstance): Promise<void> {
    const { createServer } = await import('vite');

    const vite = await createServer({
        root: CLIENT_ROOT,
        // 'spa' keeps Vite's own index.html serving and history fallback, so the
        // client router works on a deep link like /invoices/4/edit.
        appType: 'spa',
        server: { middlewareMode: true },
        // Load client/vite.config.ts through Vite's module runner instead of the
        // default 'bundle' loader. 'bundle' esbuild-bundles the config to
        // client/node_modules/.vite-temp/*.mjs, imports it, then deletes it — and
        // that import registers the file with `tsx watch`, whose deletion then
        // looks like a source change. Under tsx that is an endless restart loop:
        // every restart writes and deletes another temp file.
        configLoader: 'runner',
    });

    app.addHook('onClose', async () => vite.close());

    app.setNotFoundHandler((request, reply) => {
        if (request.url.startsWith('/api')) {
            return reply.code(404).send({ error: 'Not found' });
        }
        reply.hijack();
        vite.middlewares(request.raw, reply.raw, () => {
            reply.raw.statusCode = 404;
            reply.raw.end('Not found');
        });
    });

    app.log.info('Vite dev middleware attached — client and API share one origin');
}

export async function buildApp(options: BuildOptions = {}): Promise<FastifyInstance> {
    const app = Fastify({
        logger: options.logger ?? true,
    });

    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    // Turn Zod validation failures into a flat, readable 400 rather than Fastify's
    // default shape, which buries the field path.
    app.setErrorHandler((error, request, reply) => {
        if (hasZodFastifySchemaValidationErrors(error)) {
            return reply.code(400).send({
                error: 'Validation failed',
                details: error.validation.map((issue) => ({
                    path: issue.instancePath || issue.params?.issue?.path?.join('.') || '',
                    message: issue.message ?? 'invalid',
                })),
            });
        }
        request.log.error(error);
        // The Zod guard above accepts `unknown`, which leaves `error` unnarrowed here.
        const failure = error as { statusCode?: number; message?: string };
        return reply.code(failure.statusCode ?? 500).send({
            error: failure.message || 'Internal server error',
        });
    });

    const db = openDb(options.dbPath);
    migrate(db);
    seed(db);
    app.decorate('db', db);
    app.addHook('onClose', async () => db.close());

    await app.register(
        async (api) => {
            await api.register(invoiceRoutes);
            await api.register(customerRoutes);
            await api.register(settingsRoutes);
        },
        { prefix: '/api' },
    );

    app.get('/api/health', async () => ({ ok: true }));

    const dev = options.dev ?? process.env.NODE_ENV !== 'production';

    if (options.serveClient !== false) {
        if (dev) {
            await attachViteMiddleware(app);
        } else if (existsSync(join(CLIENT_DIST, 'index.html'))) {
            await app.register(fastifyStatic, { root: CLIENT_DIST });
            // SPA fallback: anything not under /api belongs to the client router.
            app.setNotFoundHandler((request, reply) => {
                if (request.url.startsWith('/api')) {
                    return reply.code(404).send({ error: 'Not found' });
                }
                return reply.sendFile('index.html');
            });
        } else {
            app.log.warn(`No client build at ${CLIENT_DIST}. Run \`npm run build\`.`);
        }
    }

    return app;
}
