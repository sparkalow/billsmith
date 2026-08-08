import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { listCustomers, getCustomer, createCustomer, updateCustomer } from '../db/queries/customers.js';
import { customerBody, updateCustomerBody, idParam } from './schemas.js';

export const customerRoutes: FastifyPluginAsync = async (fastify) => {
    const app = fastify.withTypeProvider<ZodTypeProvider>();
    const db = fastify.db;

    app.get('/customers', async (request) => {
        const { include_archived } = request.query as { include_archived?: string };
        return listCustomers(db, include_archived === 'true');
    });

    app.get('/customers/:id', { schema: { params: idParam } }, async (request, reply) => {
        const customer = getCustomer(db, request.params.id);
        if (!customer) {return reply.code(404).send({ error: 'Customer not found' });}
        return customer;
    });

    app.post('/customers', { schema: { body: customerBody } }, async (request, reply) =>
        reply.code(201).send(createCustomer(db, request.body)),
    );

    app.patch(
        '/customers/:id',
        { schema: { params: idParam, body: updateCustomerBody } },
        async (request, reply) => {
            const updated = updateCustomer(db, request.params.id, request.body);
            if (!updated) {return reply.code(404).send({ error: 'Customer not found' });}
            return updated;
        },
    );
};
