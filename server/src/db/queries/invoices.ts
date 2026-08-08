/**
 * Invoice queries. All money in cents, durations in minutes, dates as YYYY-MM-DD.
 *
 * Totals always come from the `invoice_totals` view rather than being recomputed in
 * JS, so the list, the detail view, and the printed document can never disagree.
 */

import type { Db } from '../index.js';
import { all, get, run, transaction } from '../index.js';
import { addDays } from '../../../../shared/dates.js';
import type {
    InvoiceRow,
    LineItemRow,
    InvoiceTotals,
    InvoiceDetail,
    InvoiceSummary,
    CustomerRow,
    SettingsRow,
    CreateInvoiceInput,
    UpdateInvoiceInput,
    LineItemInput,
} from '../../../../shared/types.js';

const INVOICE_COLUMNS = `
    i.id, i.invoice_number, i.customer_id, i.status, i.issue_date, i.due_date,
    i.paid_date, i.hourly_rate_cents, i.tax_rate,
    i.customer_name, i.customer_address_1, i.customer_address_2,
    i.business_name, i.business_address_1, i.business_address_2,
    i.terms_html, i.notes, i.created_at, i.updated_at`;

const TOTALS_COLUMNS = `
    t.invoice_id, t.total_minutes, t.subtotal_cents, t.tax_cents,
    t.total_cents, t.line_item_count`;

type JoinedRow = InvoiceRow & InvoiceTotals;

function splitTotals(row: JoinedRow): InvoiceSummary {
    const {
        invoice_id, total_minutes, subtotal_cents, tax_cents, total_cents, line_item_count,
        ...invoice
    } = row;
    return {
        ...invoice,
        totals: {
            invoice_id, total_minutes, subtotal_cents, tax_cents, total_cents, line_item_count,
        },
    };
}

export function listInvoices(db: Db): InvoiceSummary[] {
    return all<JoinedRow>(
        db,
        `SELECT ${INVOICE_COLUMNS}, ${TOTALS_COLUMNS}
         FROM invoices i
         JOIN invoice_totals t ON t.invoice_id = i.id
         ORDER BY i.issue_date DESC, i.id DESC`,
    ).map(splitTotals);
}

/** Sum of every non-void invoice. Replaces the running total in the legacy index.njk. */
export function cumulativeCents(db: Db): number {
    return get<{ c: number }>(
        db,
        `SELECT COALESCE(SUM(t.total_cents), 0) AS c
         FROM invoice_totals t
         JOIN invoices i ON i.id = t.invoice_id
         WHERE i.status <> 'void'`,
    )!.c;
}

export function getInvoice(db: Db, id: number): InvoiceDetail | null {
    const row = get<JoinedRow>(
        db,
        `SELECT ${INVOICE_COLUMNS}, ${TOTALS_COLUMNS}
         FROM invoices i
         JOIN invoice_totals t ON t.invoice_id = i.id
         WHERE i.id = ?`,
        id,
    );
    if (!row) return null;

    const line_items = all<LineItemRow>(
        db,
        'SELECT * FROM line_items WHERE invoice_id = ? ORDER BY position',
        id,
    );

    return { ...splitTotals(row), line_items };
}

export function invoiceNumberExists(db: Db, number: string, excludeId?: number): boolean {
    return (
        get<{ id: number }>(
            db,
            'SELECT id FROM invoices WHERE invoice_number = ? AND id <> ?',
            number,
            excludeId ?? -1,
        ) !== undefined
    );
}

/**
 * Write the full line-item set for an invoice, renumbering positions from array order.
 * Replace-in-place rather than diffing: the editor always sends the whole list, and a
 * stale position is a far worse bug than a few extra writes on an invoice this size.
 */
export function replaceLineItems(db: Db, invoiceId: number, items: LineItemInput[]): void {
    run(db, 'DELETE FROM line_items WHERE invoice_id = ?', invoiceId);
    const insert = db.prepare(
        `INSERT INTO line_items (
            invoice_id, position, work_date, description, minutes, source
         ) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    items.forEach((item, index) => {
        insert.run(
            invoiceId,
            index,
            item.work_date,
            item.description,
            item.minutes,
            item.source ?? 'manual',
        );
    });
}

export function createInvoice(db: Db, input: CreateInvoiceInput): InvoiceDetail {
    return transaction(db, () => {
        const customer = get<CustomerRow>(db, 'SELECT * FROM customers WHERE id = ?', input.customer_id);
        if (!customer) throw new Error(`No customer with id ${input.customer_id}`);

        const settings = get<SettingsRow>(db, 'SELECT * FROM settings WHERE id = 1')!;

        // Snapshot customer, business, and terms so later edits to either cannot
        // rewrite what an already-issued invoice said.
        const rate =
            input.hourly_rate_cents ?? customer.default_rate_cents ?? settings.default_rate_cents;

        // The default terms promise "due 30 days from the invoice date", so an
        // omitted due date follows settings.default_net_days rather than falling
        // back to the issue date.
        const dueDate = input.due_date ?? addDays(input.issue_date, settings.default_net_days);

        const { lastInsertRowid } = run(
            db,
            `INSERT INTO invoices (
                invoice_number, customer_id, status, issue_date, due_date,
                hourly_rate_cents, tax_rate,
                customer_name, customer_address_1, customer_address_2,
                business_name, business_address_1, business_address_2,
                terms_html, notes
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            input.invoice_number,
            customer.id,
            input.status ?? 'draft',
            input.issue_date,
            dueDate,
            rate,
            input.tax_rate ?? 0,
            customer.name,
            customer.address_1,
            customer.address_2,
            settings.business_name,
            settings.business_address_1,
            settings.business_address_2,
            settings.default_terms_html,
            input.notes ?? null,
        );

        if (input.line_items?.length) replaceLineItems(db, lastInsertRowid, input.line_items);

        return getInvoice(db, lastInsertRowid)!;
    });
}

const UPDATABLE = [
    'invoice_number', 'customer_id', 'status', 'issue_date', 'due_date', 'paid_date',
    'hourly_rate_cents', 'tax_rate', 'customer_name', 'customer_address_1',
    'customer_address_2', 'business_name', 'business_address_1', 'business_address_2',
    'terms_html', 'notes',
] as const;

export function updateInvoice(
    db: Db,
    id: number,
    patch: UpdateInvoiceInput,
): InvoiceDetail | null {
    const entries = UPDATABLE
        .filter((col) => patch[col] !== undefined)
        .map((col) => [col, patch[col] ?? null] as const);

    if (entries.length === 0) return getInvoice(db, id);

    const { changes } = run(
        db,
        `UPDATE invoices SET ${entries.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`,
        ...entries.map(([, v]) => v as string | number | null),
        id,
    );
    if (changes === 0) return null;

    // Marking an invoice paid without a date is a common slip; fill it in.
    if (patch.status === 'paid' && patch.paid_date === undefined) {
        run(db, `UPDATE invoices SET paid_date = date('now') WHERE id = ? AND paid_date IS NULL`, id);
    }
    return getInvoice(db, id);
}

export function deleteInvoice(db: Db, id: number): boolean {
    return run(db, 'DELETE FROM invoices WHERE id = ?', id).changes > 0;
}

/**
 * Next invoice number for a given issue date, following the convention the legacy
 * invoices used: month + last-day-of-month + year, e.g. 2026-08-01 -> "8312026".
 */
export function suggestInvoiceNumber(issueDate: string): string {
    const parts = issueDate.split('-').map(Number);
    const year = parts[0]!;
    const month = parts[1]!;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return `${month}${lastDay}${year}`;
}
