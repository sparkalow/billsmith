/**
 * Idempotent seed of the single-row `settings` record and the initial customer.
 *
 */

import type { Db } from './index.js';

export const DEFAULT_TERMS_HTML =
    '<strong>Due Date</strong>: Payment is due 30 days from the invoice date.<br>' +
    '<strong>Accepted Payment Methods</strong>: Check<br>' +
    '<small><strong>Invoice Disputes</strong>: Any disputes regarding the invoice ' +
    'must be raised within 7 days of receiving the invoice.</small>';

export const DEFAULT_BUSINESS = {
    name: 'Brian Matthews',
    address_1: '1119 Tiger Woods Way',
    address_2: 'Murfreesboro TN, 37129',
};

/** The only customer across all 19 legacy invoices. */
export const DEFAULT_CUSTOMER = {
    name: 'Industrial Strength Marketing',
    address_1: '1401 5th Ave N.',
    address_2: 'Nashville, TN 37208',
};

export const DEFAULT_RATE_CENTS = 8500;

/** Insert defaults if absent. Safe to call on every boot. */
export function seed(db: Db): void {
    db.prepare(
        `INSERT INTO settings (
            id, business_name, business_address_1, business_address_2,
            default_terms_html, default_rate_cents, default_net_days, wrike_contact_id
         ) VALUES (1, ?, ?, ?, ?, ?, 30, ?)
         ON CONFLICT(id) DO NOTHING`,
    ).run(
        DEFAULT_BUSINESS.name,
        DEFAULT_BUSINESS.address_1,
        DEFAULT_BUSINESS.address_2,
        DEFAULT_TERMS_HTML,
        DEFAULT_RATE_CENTS,
        process.env.WRIKE_CONTACT_ID ?? 'KUAUBLN4',
    );

    const existing = db
        .prepare('SELECT id FROM customers WHERE name = ?')
        .get(DEFAULT_CUSTOMER.name) as { id: number } | undefined;

    if (!existing) {
        db.prepare(
            'INSERT INTO customers (name, address_1, address_2) VALUES (?, ?, ?)',
        ).run(DEFAULT_CUSTOMER.name, DEFAULT_CUSTOMER.address_1, DEFAULT_CUSTOMER.address_2);
    }
}
