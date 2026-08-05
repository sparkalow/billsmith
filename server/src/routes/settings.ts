import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { getSettings, updateSettings } from '../db/queries/settings.js';
import { settingsBody } from './schemas.js';

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
    const app = fastify.withTypeProvider<ZodTypeProvider>();
    const db = fastify.db;

    app.get('/settings', async () => getSettings(db));

    app.put('/settings', { schema: { body: settingsBody } }, async (request) =>
        updateSettings(db, request.body),
    );
};
