import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import {
    listInvoices, getInvoice, createInvoice, updateInvoice, deleteInvoice,
    replaceLineItems, cumulativeCents, invoiceNumberExists, suggestInvoiceNumber,
} from '../db/queries/invoices.js';
import { createInvoiceBody, updateInvoiceBody, lineItemsBody, idParam } from './schemas.js';

export const invoiceRoutes: FastifyPluginAsync = async (fastify) => {
    const app = fastify.withTypeProvider<ZodTypeProvider>();
    const db = fastify.db;

    app.get('/invoices', async () => ({
        invoices: listInvoices(db),
        cumulative_cents: cumulativeCents(db),
    }));

    app.get('/invoices/:id', { schema: { params: idParam } }, async (request, reply) => {
        const invoice = getInvoice(db, request.params.id);
        if (!invoice) return reply.code(404).send({ error: 'Invoice not found' });
        return invoice;
    });

    app.post('/invoices', { schema: { body: createInvoiceBody } }, async (request, reply) => {
        if (invoiceNumberExists(db, request.body.invoice_number)) {
            return reply
                .code(409)
                .send({ error: `Invoice number ${request.body.invoice_number} is already in use` });
        }
        try {
            return reply.code(201).send(createInvoice(db, request.body));
        } catch (err) {
            return reply.code(400).send({ error: (err as Error).message });
        }
    });

    app.patch(
        '/invoices/:id',
        { schema: { params: idParam, body: updateInvoiceBody } },
        async (request, reply) => {
            const { id } = request.params;
            const number = request.body.invoice_number;
            if (number && invoiceNumberExists(db, number, id)) {
                return reply.code(409).send({ error: `Invoice number ${number} is already in use` });
            }
            const updated = updateInvoice(db, id, request.body);
            if (!updated) return reply.code(404).send({ error: 'Invoice not found' });
            return updated;
        },
    );

    app.delete('/invoices/:id', { schema: { params: idParam } }, async (request, reply) => {
        if (!deleteInvoice(db, request.params.id)) {
            return reply.code(404).send({ error: 'Invoice not found' });
        }
        return reply.code(204).send();
    });

    // Replace the whole line-item set. The editor always sends the full list, so
    // positions are derived from array order rather than tracked client-side.
    app.put(
        '/invoices/:id/line-items',
        { schema: { params: idParam, body: lineItemsBody } },
        async (request, reply) => {
            const { id } = request.params;
            if (!getInvoice(db, id)) return reply.code(404).send({ error: 'Invoice not found' });
            replaceLineItems(db, id, request.body.line_items);
            return getInvoice(db, id);
        },
    );

    // Convenience for the "new invoice" form: the legacy numbering convention.
    app.get('/invoice-number/suggest', async (request) => {
        const { issue_date } = request.query as { issue_date?: string };
        const date = issue_date ?? new Date().toISOString().slice(0, 10);
        let candidate = suggestInvoiceNumber(date);
        let suffix = 1;
        while (invoiceNumberExists(db, candidate)) {
            candidate = `${suggestInvoiceNumber(date)}-${++suffix}`;
        }
        return { invoice_number: candidate };
    });
};
