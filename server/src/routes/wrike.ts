import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { fetchTimelogs, WrikeError } from '../wrike/client.js';
import {
    cacheTimelogs, previewRange, createInvoiceFromWrike, overlappingInvoices,
} from '../db/queries/wrike.js';
import { getSettings } from '../db/queries/settings.js';
import { wrikeRangeBody, fromWrikeBody } from './schemas.js';

export const wrikeRoutes: FastifyPluginAsync = async (fastify) => {
    const app = fastify.withTypeProvider<ZodTypeProvider>();
    const db = fastify.db;

    /**
     * Fetch a date range from Wrike, cache it, and return the preview.
     * Timelogs already attached to a line item come back flagged, so the import UI
     * can avoid billing the same work twice.
     */
    app.post('/wrike/timelogs', { schema: { body: wrikeRangeBody } }, async (request, reply) => {
        const { start, end } = request.body;
        const contactId = getSettings(db).wrike_contact_id;
        if (!contactId) {
            return reply.code(400).send({ error: 'No Wrike contact id configured in settings' });
        }

        try {
            const logs = await fetchTimelogs(contactId, start, end);
            cacheTimelogs(db, logs);
            return {
                timelogs: previewRange(db, start, end),
                fetched: logs.length,
                overlaps: overlappingInvoices(db, start, end),
            };
        } catch (err) {
            if (err instanceof WrikeError) {
                fastify.log.warn({ err: err.message }, 'Wrike fetch failed');
                // Fall back to whatever is already cached, so an expired token or an
                // offline machine still lets you work from the last successful pull.
                const cached = previewRange(db, start, end);
                return reply.code(cached.length ? 200 : 502).send(
                    cached.length
                        ? {
                            timelogs: cached,
                            fetched: 0,
                            warning: err.message,
                            overlaps: overlappingInvoices(db, start, end),
                        }
                        : { error: err.message },
                );
            }
            throw err;
        }
    });

    /** Cached timelogs for a range, without touching the Wrike API. */
    app.get('/wrike/timelogs', async (request, reply) => {
        const { start, end } = request.query as { start?: string; end?: string };
        if (!start || !end) {
            return reply.code(400).send({ error: 'start and end are required' });
        }
        return {
            timelogs: previewRange(db, start, end),
            fetched: 0,
            overlaps: overlappingInvoices(db, start, end),
        };
    });

    /** Build a draft invoice from cached timelogs. Replaces get-wrike-time.js. */
    app.post('/invoices/from-wrike', { schema: { body: fromWrikeBody } }, async (request, reply) => {
        try {
            return reply.code(201).send(createInvoiceFromWrike(db, request.body));
        } catch (err) {
            return reply.code(400).send({ error: (err as Error).message });
        }
    });
};
