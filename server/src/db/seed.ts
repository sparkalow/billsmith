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

/** Placeholders. Change these in Settings on first run — they print on every invoice. */
export const DEFAULT_BUSINESS = {
    name: 'First Last',
    address_1: '123 Main St',
    address_2: 'City ST, 90210',
};

/** A starter customer, so a fresh install has something to invoice. */
export const DEFAULT_CUSTOMER = {
    name: 'Customer Name',
    address_1: '456 Second Ave',
    address_2: 'City ST, 90210',
};

export const DEFAULT_RATE_CENTS = 8500;

/** Insert defaults if absent. Safe to call on every boot. */
export function seed(db: Db): void {
    db.prepare(
        `INSERT INTO settings (
            id, business_name, business_address_1, business_address_2,
            default_terms_html, default_rate_cents, default_net_days
         ) VALUES (1, ?, ?, ?, ?, ?, 30)
         ON CONFLICT(id) DO NOTHING`,
    ).run(
        DEFAULT_BUSINESS.name,
        DEFAULT_BUSINESS.address_1,
        DEFAULT_BUSINESS.address_2,
        DEFAULT_TERMS_HTML,
        DEFAULT_RATE_CENTS,
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
