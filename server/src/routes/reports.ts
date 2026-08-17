import type { FastifyPluginAsync } from 'fastify';

import { yearlyTotals, customerTotals, outstandingReport } from '../db/queries/reports.js';

export const reportsRoutes: FastifyPluginAsync = async (fastify) => {
    const db = fastify.db;

    // All three reports in one response. They are small, they are read together, and a
    // single fetch means the client's report tabs need no per-tab loading state.
    fastify.get('/reports', async () => ({
        yearly: yearlyTotals(db),
        outstanding: outstandingReport(db),
        customers: customerTotals(db),
    }));
};
