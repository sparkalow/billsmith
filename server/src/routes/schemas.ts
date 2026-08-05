/**
 * Zod schemas for the API boundary.
 *
 */

import { z } from 'zod';

export const isoDate = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date')
    .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Not a real date');

export const invoiceStatus = z.enum(['draft', 'sent', 'paid', 'void']);
export const lineItemSource = z.enum(['manual', 'wrike', 'import']);

export const cents = z.number().int().min(0);
export const minutes = z.number().int().min(0);

export const idParam = z.object({
    id: z.coerce.number().int().positive(),
});

export const lineItemInput = z.object({
    work_date: isoDate,
    description: z.string().trim().min(1, 'Description is required'),
    minutes,
    source: lineItemSource.optional(),
    wrike_timelog_id: z.string().nullish(),
    wrike_task_id: z.string().nullish(),
    wrike_hours_raw: z.number().nullish(),
});

export const createInvoiceBody = z.object({
    invoice_number: z.string().trim().min(1),
    customer_id: z.number().int().positive(),
    issue_date: isoDate,
    due_date: isoDate.optional(),
    status: invoiceStatus.optional(),
    hourly_rate_cents: cents.optional(),
    tax_rate: z.number().min(0).optional(),
    notes: z.string().nullish(),
    line_items: z.array(lineItemInput).optional(),
});

export const updateInvoiceBody = z.object({
    invoice_number: z.string().trim().min(1).optional(),
    customer_id: z.number().int().positive().optional(),
    status: invoiceStatus.optional(),
    issue_date: isoDate.optional(),
    due_date: isoDate.optional(),
    paid_date: isoDate.nullish(),
    hourly_rate_cents: cents.optional(),
    tax_rate: z.number().min(0).optional(),
    customer_name: z.string().trim().min(1).optional(),
    customer_address_1: z.string().optional(),
    customer_address_2: z.string().optional(),
    business_name: z.string().trim().min(1).optional(),
    business_address_1: z.string().optional(),
    business_address_2: z.string().optional(),
    terms_html: z.string().optional(),
    notes: z.string().nullish(),
});

export const lineItemsBody = z.object({
    line_items: z.array(lineItemInput),
});

export const customerBody = z.object({
    name: z.string().trim().min(1),
    address_1: z.string().optional(),
    address_2: z.string().optional(),
    default_rate_cents: cents.nullish(),
});

export const updateCustomerBody = customerBody.partial().extend({
    archived: z.union([z.literal(0), z.literal(1)]).optional(),
});

export const settingsBody = z.object({
    business_name: z.string().trim().min(1).optional(),
    business_address_1: z.string().optional(),
    business_address_2: z.string().optional(),
    default_terms_html: z.string().optional(),
    default_rate_cents: cents.optional(),
    default_net_days: z.number().int().min(0).optional(),
    wrike_contact_id: z.string().nullish(),
});

export const wrikeRangeBody = z
    .object({ start: isoDate, end: isoDate })
    .refine((v) => v.start <= v.end, { message: 'start must not be after end' });

export const fromWrikeBody = z
    .object({
        start: isoDate,
        end: isoDate,
        customer_id: z.number().int().positive(),
        invoice_number: z.string().trim().min(1).optional(),
        issue_date: isoDate.optional(),
        due_date: isoDate.optional(),
        skip_imported: z.boolean().optional(),
    })
    .refine((v) => v.start <= v.end, { message: 'start must not be after end' });
